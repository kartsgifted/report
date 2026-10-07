/* 기관 입력 화면 (레이아웃 · MBC C&I · 케이브레인컴퍼니) */
(function () {
  'use strict';
  var h = KR.h, CATS = KR.CONFIG.CATEGORIES;
  var app = document.getElementById('app');
  var S = { me: null, type: 'W', rep: null, data: null, sub: null, dirty: false, busy: false };

  if (KR.DEMO) document.getElementById('demo').appendChild(h('div', { class: 'demo-bar', text: '체험 모드 — 입력 내용은 이 브라우저에만 저장됩니다. 기관 코드: layout(레이아웃) · mbc(MBC C&I) · kbrain(케이브레인컴퍼니)' }));

  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  function empty() { return { prev: CATS.map(function () { return []; }), next: CATS.map(function () { return []; }) }; }

  /* ---------- 로그인 ---------- */
  function loginView(msg) {
    var code = h('input', { class: 'input', type: 'password', placeholder: '기관 코드', autocomplete: 'off' });
    var err = h('div', { class: 'err', text: msg || '' });
    var btn = h('button', { class: 'btn primary', style: 'width:100%;padding:11px', text: '들어가기' });
    async function go() {
      var v = code.value.trim(); if (!v) { err.textContent = '코드를 입력하세요'; return; }
      btn.disabled = true; err.textContent = '';
      sessionStorage.setItem('kr_code', v);
      try { await boot(); } catch (e) { sessionStorage.removeItem('kr_code'); err.textContent = e.message; btn.disabled = false; }
    }
    btn.onclick = go; code.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'login' }, h('div', { class: 'card' }, [
      h('h1', { text: '업무보고 작성' }),
      h('p', { text: '기관별로 받은 코드로 들어가 주간·월간 업무 내용을 작성합니다.' }),
      h('label', { class: 'field' }, [h('span', { text: '기관 코드' }), code]), err, btn
    ])));
    setTimeout(function () { code.focus(); }, 50);
  }

  async function boot() {
    var me = await KR.call('login');
    if (me.role === 'admin') { location.href = 'admin.html' + location.search; return; }
    S.me = me; KR.setHolidays(me.holidays);
    var who = document.getElementById('who'); who.innerHTML = '';
    who.appendChild(h('span', { class: 'chip', text: me.agency }));
    who.appendChild(h('button', { class: 'btn-ghost-w', text: '나가기', onclick: function () { if (S.dirty && !confirm('저장하지 않은 내용이 있습니다. 나갈까요?')) return; S.dirty = false; sessionStorage.removeItem('kr_code'); location.reload(); } }));
    var saved = sessionStorage.getItem('kr_rep');
    open(saved ? KR.fromKey(saved) : KR.current('W'));
  }

  /* ---------- 회차 열기 ---------- */
  async function open(rep) {
    if (S.dirty && !confirm('저장하지 않은 내용이 있습니다. 다른 회차로 이동할까요?')) return;
    S.rep = rep; S.type = rep.type; S.dirty = false; sessionStorage.setItem('kr_rep', rep.key);
    app.innerHTML = '<div class="loading">불러오는 중…</div>';
    try {
      var r = await KR.call('load', { key: rep.key });
      S.data = empty();
      r.entries.sort(function (a, b) { return a.ord - b.ord; }).forEach(function (e) {
        if (S.data[e.sec] && S.data[e.sec][e.cat]) S.data[e.sec][e.cat].push({ text: e.text, status: e.status, src: e.src });
      });
      S.sub = r.subs[0] || null;
      render();
    } catch (e) { app.innerHTML = ''; KR.toast(e.message, 'bad'); if (/코드/.test(e.message)) loginView(e.message); }
  }

  /* ---------- 화면 ---------- */
  function render() {
    var rep = S.rep; app.innerHTML = '';
    var wrap = h('div', { class: 'wrap' });
    var state = S.sub ? (S.sub.state || '작성중') : '미작성';

    var seg = h('div', { class: 'seg' }, [
      h('button', { class: S.type === 'W' ? 'on' : '', text: '주간', onclick: function () { if (S.type !== 'W') open(KR.current('W')); } }),
      h('button', { class: S.type === 'M' ? 'on' : '', text: '월간', onclick: function () { if (S.type !== 'M') open(KR.current('M')); } })
    ]);
    var nav = h('div', { class: 'rep-nav' }, [
      h('button', { class: 'icon-btn', title: '이전 회차', 'aria-label': '이전 회차', text: '◀', onclick: function () { open(rep.prevReport()); } }),
      h('div', { class: 'rep-title', text: rep.title }),
      h('button', { class: 'icon-btn', title: '다음 회차', 'aria-label': '다음 회차', text: '▶', onclick: function () { open(rep.nextReport()); } })
    ]);
    var meta = h('div', { class: 'rep-meta', html: '실적 <b>' + rep.periodPrev + '</b><br>계획 <b>' + rep.periodNext + '</b>' });
    var due = h('div', { class: 'due', html: '기관 초안 마감 <b>' + KR.kd(rep.internalDue) + ' ' + KR.CONFIG.DUE_TIME + '</b> <span class="d">' + KR.dday(rep.internalDue) + '</span><br>한예종 제출 ' + KR.kd(rep.due) + ' ' + KR.CONFIG.DUE_TIME });
    var st = h('span', { class: 'chip state s-' + state, text: state === '제출' ? '제출 완료' : state });
    wrap.appendChild(h('div', { class: 'repbar' }, [seg, nav, meta, h('div', { class: 'spacer' }), due, st]));

    // 도구
    var tools = h('div', { class: 'toolbar' });
    if (rep.type === 'W') tools.appendChild(h('button', { class: 'btn sm', text: '↓ 지난주 계획 불러오기', onclick: carryWeekly }));
    else tools.appendChild(h('button', { class: 'btn sm', text: '↓ 지난달 주간보고 실적 불러오기', onclick: carryMonthly }));
    tools.appendChild(h('button', { class: 'btn sm', text: '작성 요령', onclick: function () { g.hidden = !g.hidden; } }));
    tools.appendChild(h('span', { class: 'hint', text: '항목 안에서 줄을 바꾸면 세부 항목(·)이 됩니다' }));
    wrap.appendChild(tools);

    var g = h('div', { class: 'guide', hidden: true, html:
      '<b>작성 요령</b><ul>' +
      '<li>한 칸에 한 가지 업무, 개조식으로 짧게: <b>음악 분야 수도권 1회차 멘토링 운영(10. 7.(수), 서초캠퍼스)</b></li>' +
      '<li>날짜는 <b>10. 7.(수)</b> 형식, 수치(인원·회차·건수)는 가능하면 함께</li>' +
      '<li>한예종 결정·협조가 필요한 사항은 <b>기타</b>에 <b>(협조요청)</b>을 앞에 붙여 작성 → 월요일 Zoom 안건</li>' +
      '<li>지난주 계획을 불러온 항목은 <b>완료 / 진행 / 연기</b> 중 하나를 꼭 선택</li>' +
      '<li>해당 없는 항목은 비워 두면 최종본에 "해당 없음"으로 표기됩니다</li></ul>' });
    wrap.appendChild(g);

    var cols = h('div', { class: 'cols' });
    cols.appendChild(panel('prev', '지난 실적', rep.periodPrev));
    cols.appendChild(panel('next', '향후 계획', rep.periodNext));
    wrap.appendChild(cols);
    app.appendChild(wrap);

    // 저장 바
    S.msg = h('div', { class: 'msg' });
    app.appendChild(h('div', { class: 'savebar' }, h('div', { class: 'in' }, [
      S.msg,
      h('button', { class: 'btn', text: '임시저장', onclick: function () { save(false); } }),
      h('button', { class: 'btn primary', text: state === '제출' ? '수정 내용 다시 제출' : '제출하기', onclick: function () { save(true); } })
    ])));
    setMsg();
    app.querySelectorAll('textarea').forEach(KR.autosize);
  }

  function setMsg() {
    if (!S.msg) return;
    if (S.dirty) { S.msg.className = 'msg dirty'; S.msg.textContent = '저장하지 않은 변경 사항이 있습니다'; return; }
    S.msg.className = 'msg';
    S.msg.textContent = S.sub ? ('마지막 저장 ' + KR.fmtTime(S.sub.savedAt) + (S.sub.submittedAt ? ' · 제출 ' + KR.fmtTime(S.sub.submittedAt) : '')) : '아직 저장한 내용이 없습니다';
  }
  function touch() { if (!S.dirty) { S.dirty = true; setMsg(); } }

  function panel(sec, title, period) {
    var p = h('section', { class: 'panel' }, h('header', {}, [h('h2', { text: title }), h('span', { text: period })]));
    CATS.forEach(function (cat, ci) {
      var list = S.data[sec][ci];
      var box = h('div', { class: 'cat' });
      var count = h('span', { class: 'n', text: list.length ? list.length + '건' : '' });
      box.appendChild(h('h3', {}, ['□ ' + cat, count]));
      var items = h('div');
      function draw() {
        items.innerHTML = '';
        list.forEach(function (it, ii) { items.appendChild(row(sec, list, it, ii, draw)); });
        count.textContent = list.length ? list.length + '건' : '';
        items.querySelectorAll('textarea').forEach(KR.autosize);
      }
      draw();
      box.appendChild(items);
      box.appendChild(h('button', { class: 'add', text: '+ 항목 추가', onclick: function () {
        list.push({ text: '', status: '', src: '' }); touch(); draw();
        var tas = items.querySelectorAll('textarea'); tas[tas.length - 1].focus();
      } }));
      p.appendChild(box);
    });
    return p;
  }

  function row(sec, list, it, ii, redraw) {
    var ta = h('textarea', { rows: 1, placeholder: '업무 내용', oninput: function () { it.text = ta.value; KR.autosize(ta); touch(); } });
    ta.value = it.text;
    var ctl = h('div', { class: 'ctl' }), fromEl = null;
    if (sec === 'prev') {
      var sel = h('select', { title: '진행 상태', onchange: function () { it.status = sel.value; sel.classList.toggle('need', /계획$/.test(it.src || '') && !sel.value); fromEl && (fromEl.textContent = fromText(it)); touch(); } },
        ['', '완료', '진행', '연기'].map(function (v) { return h('option', { value: v, text: v || '상태' }); }));
      sel.value = it.status || ''; if (/계획$/.test(it.src || '') && !it.status) sel.classList.add('need');
      ctl.appendChild(sel);
    }
    ctl.appendChild(h('button', { class: 'icon-btn', title: '위로', 'aria-label': '위로', text: '↑', onclick: function () { if (ii > 0) { list.splice(ii - 1, 0, list.splice(ii, 1)[0]); touch(); redraw(); } } }));
    ctl.appendChild(h('button', { class: 'icon-btn', title: '삭제', 'aria-label': '삭제', text: '✕', onclick: function () { list.splice(ii, 1); touch(); redraw(); } }));
    var r = h('div', { class: 'item' }, [h('span', { class: 'dash', text: '-' }), ta, ctl]);
    if (it.src) { fromEl = h('div', { class: 'from', text: fromText(it) }); r.appendChild(fromEl); }
    return r;
  }

  function fromText(it) { return it.src + '에서 가져옴' + (/계획$/.test(it.src) && !it.status ? ' — 완료/진행/연기를 선택하세요' : ''); }

  /* ---------- 불러오기 ---------- */
  function norm(s) { return String(s || '').replace(/\s+/g, ''); }
  function merge(entries, sec, srcLabel, statusDefault) {
    var n = 0;
    entries.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : a.ord - b.ord; }).forEach(function (e) {
      var list = S.data.prev[e.cat]; if (!list) return;
      if (list.some(function (x) { return norm(x.text) === norm(e.text); })) return;
      list.push({ text: e.text, status: statusDefault === null ? (e.status || '') : '', src: srcLabel(e) }); n++;
    });
    return n;
  }
  async function carryWeekly() {
    var prev = S.rep.prevReport();
    try {
      var r = await KR.call('loadMany', { keys: [prev.key] });
      var n = merge(r.entries.filter(function (e) { return e.sec === 'next'; }), 'prev', function () { return prev.label + ' 계획'; });
      if (!n) { KR.toast(prev.label + ' 보고서에 가져올 계획이 없습니다'); return; }
      touch(); render(); KR.toast(n + '건을 지난 실적에 넣었습니다. 상태를 선택해 주세요');
    } catch (e) { KR.toast(e.message, 'bad'); }
  }
  async function carryMonthly() {
    try {
      var keys = S.rep.weekKeys;
      var r = await KR.call('loadMany', { keys: keys });
      var n = merge(r.entries.filter(function (e) { return e.sec === 'prev'; }), 'prev', function (e) { return KR.fromKey(e.key).label + ' 실적'; }, null);
      if (!n) { KR.toast('가져올 주간보고 실적이 없습니다'); return; }
      touch(); render(); KR.toast(n + '건을 가져왔습니다. 비슷한 항목은 하나로 합쳐 주세요');
    } catch (e) { KR.toast(e.message, 'bad'); }
  }

  /* ---------- 저장 ---------- */
  async function save(submit) {
    if (S.busy) return;
    var entries = [];
    ['prev', 'next'].forEach(function (sec) {
      S.data[sec].forEach(function (list, ci) {
        list.forEach(function (it) {
          if (String(it.text).trim()) entries.push({ sec: sec, cat: ci, text: String(it.text).trim(), status: it.status || '', src: it.src || '' });
        });
      });
    });
    if (submit) {
      var miss = S.data.prev.reduce(function (n, l) { return n + l.filter(function (x) { return /계획$/.test(x.src || '') && !x.status && String(x.text).trim(); }).length; }, 0);
      if (miss && !confirm('지난주 계획에서 가져온 항목 중 상태를 고르지 않은 것이 ' + miss + '건 있습니다. 그대로 제출할까요?')) return;
      if (!entries.length && !confirm('작성한 항목이 없습니다. 빈 보고로 제출할까요?')) return;
    }
    S.busy = true;
    try {
      var r = await KR.call('save', { key: S.rep.key, entries: entries, submit: !!submit });
      S.sub = r.sub; S.dirty = false;
      KR.toast(submit ? '제출했습니다. 마감 전까지는 수정 후 다시 제출할 수 있어요' : '임시저장했습니다');
      render();
    } catch (e) { KR.toast(e.message, 'bad'); }
    S.busy = false;
  }

  // 시작
  if (sessionStorage.getItem('kr_code')) boot().catch(function (e) { sessionStorage.removeItem('kr_code'); loginView(e.message); });
  else loginView();
})();
