/* 케이브레인컴퍼니 취합 화면: 기관 입력 취합 → 편집·문장 자동 정리 → 한예종 양식 HWPX 생성 */
(function () {
  'use strict';
  var h = KR.h, CATS = KR.CONFIG.CATEGORIES;
  var app = document.getElementById('app');
  var S = { me: null, rep: null, raw: null, F: null, dirty: false };
  var SEC = { prev: '지난 실적', next: '향후 계획' };

  if (KR.DEMO) document.getElementById('demo').appendChild(h('div', { class: 'demo-bar', text: '체험 모드 — 관리자 코드: admin · 기관 입력 화면(index.html)에서 먼저 내용을 넣어 보세요' }));
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- 로그인 ---------- */
  function loginView(msg) {
    var code = h('input', { class: 'input', type: 'password', placeholder: '관리자 코드', autocomplete: 'off' });
    var err = h('div', { class: 'err', text: msg || '' });
    var btn = h('button', { class: 'btn primary', style: 'width:100%;padding:11px', text: '들어가기' });
    async function go() {
      var v = code.value.trim(); if (!v) return;
      btn.disabled = true; sessionStorage.setItem('kr_code', v);
      try { await boot(); } catch (e) { sessionStorage.removeItem('kr_code'); err.textContent = e.message; btn.disabled = false; }
    }
    btn.onclick = go; code.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'login' }, h('div', { class: 'card' }, [
      h('h1', { text: '업무보고 취합' }), h('p', { text: '케이브레인컴퍼니 담당자 전용 화면입니다.' }),
      h('label', { class: 'field' }, [h('span', { text: '관리자 코드' }), code]), err, btn
    ])));
    setTimeout(function () { code.focus(); }, 50);
  }

  async function boot() {
    var me = await KR.call('login');
    if (me.role !== 'admin') throw new Error('관리자 코드가 아닙니다. 기관 입력은 index.html에서 하세요');
    S.me = me; KR.setHolidays(me.holidays);
    var who = document.getElementById('who'); who.innerHTML = '';
    who.appendChild(h('span', { class: 'chip', text: '케이브레인 취합 담당' }));
    who.appendChild(h('button', { class: 'btn-ghost-w', text: '나가기', onclick: function () { if (S.dirty && !confirm('저장하지 않은 편집이 있습니다. 나갈까요?')) return; S.dirty = false; sessionStorage.removeItem('kr_code'); location.reload(); } }));
    var saved = sessionStorage.getItem('kr_admin_rep');
    open(saved ? KR.fromKey(saved) : KR.current('W'));
  }

  /* ---------- 취합 ---------- */
  function tagOf(agency) {
    var a = (S.me.agencies || []).filter(function (x) { return x.name === agency; })[0];
    return a ? (a.tag || a.name) : agency;
  }
  function build(entries) {
    var order = (S.me.agencies || []).map(function (a) { return a.name; });
    var F = {
      title: S.rep.title, dateLine: (S.me.author || '㈜케이브레인컴퍼니') + ' / ' + KR.kdy(S.rep.due),
      headPrev: '지난 실적', headNext: '향후 계획', periodPrev: S.rep.periodPrev, periodNext: S.rep.periodNext,
      showAgency: true, showStatus: false, emptyText: '해당 없음', version: '1.0',
      prev: CATS.map(function () { return []; }), next: CATS.map(function () { return []; })
    };
    entries.slice().sort(function (a, b) {
      var oa = order.indexOf(a.agency), ob = order.indexOf(b.agency);
      return (oa - ob) || (a.ord - b.ord);
    }).forEach(function (e) {
      var lines = String(e.text).split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!lines.length || !F[e.sec] || !F[e.sec][e.cat]) return;
      F[e.sec][e.cat].push({ text: lines[0], subs: lines.slice(1), agency: e.agency, tag: tagOf(e.agency), status: e.status || '' });
    });
    return F;
  }

  async function open(rep) {
    if (S.dirty && !confirm('저장하지 않은 편집이 있습니다. 다른 회차로 이동할까요?')) return;
    S.rep = rep; S.dirty = false; sessionStorage.setItem('kr_admin_rep', rep.key);
    app.innerHTML = '<div class="loading">불러오는 중…</div>';
    try {
      S.raw = await KR.call('load', { key: rep.key });
      if (S.raw.final && S.raw.final.json) {
        S.F = typeof S.raw.final.json === 'string' ? JSON.parse(S.raw.final.json) : S.raw.final.json;
        S.F.version = S.raw.final.version || S.F.version || '1.0';
      } else S.F = build(S.raw.entries);
      render();
    } catch (e) { app.innerHTML = ''; KR.toast(e.message, 'bad'); if (/코드|권한/.test(e.message)) loginView(e.message); }
  }
  function staleSince() {
    if (!S.raw.final) return false;
    var t = S.raw.final.updatedAt;
    return S.raw.subs.some(function (s) { return s.savedAt && s.savedAt > t; });
  }
  function touch() { S.dirty = true; if (S.saveMsg) S.saveMsg.textContent = '편집 내용이 저장되지 않았습니다'; }

  /* ---------- 화면 ---------- */
  function render() {
    var rep = S.rep, F = S.F; app.innerHTML = '';
    var wrap = h('div', { class: 'wrap' });
    var seg = h('div', { class: 'seg' }, [
      h('button', { class: rep.type === 'W' ? 'on' : '', text: '주간', onclick: function () { if (rep.type !== 'W') open(KR.current('W')); } }),
      h('button', { class: rep.type === 'M' ? 'on' : '', text: '월간', onclick: function () { if (rep.type !== 'M') open(KR.current('M')); } })
    ]);
    var nav = h('div', { class: 'rep-nav' }, [
      h('button', { class: 'icon-btn', 'aria-label': '이전 회차', text: '◀', onclick: function () { open(rep.prevReport()); } }),
      h('div', { class: 'rep-title', text: rep.title }),
      h('button', { class: 'icon-btn', 'aria-label': '다음 회차', text: '▶', onclick: function () { open(rep.nextReport()); } })
    ]);
    var meta = h('div', { class: 'rep-meta', html: '기관 초안 마감 <b>' + KR.kd(rep.internalDue) + ' ' + KR.CONFIG.DUE_TIME + '</b><br>한예종 제출 <b>' + KR.kd(rep.due) + ' ' + KR.CONFIG.DUE_TIME + '</b> <span style="color:var(--coral);font-weight:700">' + KR.dday(rep.due) + '</span>' });
    wrap.appendChild(h('div', { class: 'repbar' }, [seg, nav, meta, h('div', { class: 'spacer' }),
      h('button', { class: 'btn', text: '↻ 기관 입력으로 다시 취합', onclick: rebuild })]));

    var grid = h('div', { class: 'admin-grid' });
    grid.appendChild(side());
    var main = h('div');
    if (staleSince()) main.appendChild(h('div', { class: 'warnbox', style: 'margin-bottom:12px', text: '최종본을 저장한 뒤에 기관 입력이 바뀌었습니다. 반영하려면 "기관 입력으로 다시 취합"을 누르세요(현재 편집 내용은 사라집니다).' }));
    main.appendChild(paper());
    grid.appendChild(main);
    wrap.appendChild(grid);
    app.appendChild(wrap);
  }

  function side() {
    var F = S.F, rep = S.rep, el = h('div', { class: 'side' });

    // 제출 현황
    var subBox = h('div', { class: 'box' }, h('h3', { text: '기관 제출 현황' }));
    (S.me.agencies || []).forEach(function (a) {
      var s = S.raw.subs.filter(function (x) { return x.agency === a.name; })[0];
      var st = s ? (s.state || '작성중') : '미작성';
      var n = S.raw.entries.filter(function (e) { return e.agency === a.name; }).length;
      subBox.appendChild(h('div', { class: 'sub-row' }, [
        h('span', { class: 'nm', text: a.name }), h('span', { class: 'chip state s-' + st, text: st }),
        h('span', { class: 't', html: (n ? n + '건' : '') + (s && s.savedAt ? '<br>' + KR.fmtTime(s.submittedAt || s.savedAt) : '') })
      ]));
    });
    subBox.appendChild(h('button', { class: 'btn sm', style: 'margin-top:10px;width:100%', text: '기관별 원본 보기', onclick: rawModal }));
    el.appendChild(subBox);

    // 옵션
    var opt = h('div', { class: 'box' }, h('h3', { text: '표기 옵션' }));
    function check(key, label) {
      var c = h('input', { type: 'checkbox' }); c.checked = !!F[key];
      c.onchange = function () { F[key] = c.checked; touch(); rerenderPaper(); };
      return h('label', { class: 'opt' }, [c, label]);
    }
    opt.appendChild(check('showAgency', '항목 끝에 수행기관 표기 [레이아웃]'));
    opt.appendChild(check('showStatus', '실적에 진행 상태 표기 (완료/진행/연기)'));
    var et = h('input', { class: 'input', type: 'text', value: F.emptyText, style: 'padding:6px 10px' });
    et.oninput = function () { F.emptyText = et.value; touch(); rerenderPaper(); };
    opt.appendChild(h('label', { class: 'opt' }, [h('span', { style: 'white-space:nowrap', text: '빈 항목 문구' }), et]));
    el.appendChild(opt);

    // 문장 자동 정리 (규칙 기반, 외부 호출 없음)
    el.appendChild(h('div', { class: 'box' }, [h('h3', { text: '문장 자동 정리' }),
      h('p', { class: 'small', style: 'margin:0 0 10px', text: '서술형 끝맺음 → 개조식(운영했습니다 → 운영), 날짜 표기 10. 7.(수)로 통일·요일 확인, 같은 기관의 똑같은 항목 합치기. 바뀌는 부분을 비교한 뒤 골라서 적용합니다.' }),
      h('button', { class: 'btn sm', style: 'width:100%', text: '✦ 전체 정리 미리보기', onclick: function () { polish(null); } })]));

    // 생성
    var ver = h('input', { class: 'input', value: F.version || '1.0' });
    var fname = h('div', { class: 'fname' });
    function upd() { F.version = ver.value.trim() || '1.0'; fname.textContent = KR.fileName(rep, F.version); }
    ver.oninput = function () { upd(); touch(); }; upd();
    S.saveMsg = h('div', { class: 'small', style: 'margin-top:8px', text: S.raw.final ? '최종본 저장 ' + KR.fmtTime(S.raw.final.updatedAt) : '아직 저장한 최종본이 없습니다' });
    el.appendChild(h('div', { class: 'box' }, [h('h3', { text: '최종 보고자료' }),
      h('div', { class: 'ver' }, [h('span', { class: 'small', text: 'Ver.' }), ver,
        h('button', { class: 'btn sm', title: '수정', text: '+수정', onclick: function () { ver.value = KR.bumpVersion(ver.value); upd(); touch(); } }),
        h('button', { class: 'btn sm', title: '소소한 수정', text: '+소소', onclick: function () { ver.value = KR.bumpVersion(ver.value, true); upd(); touch(); } })]),
      fname,
      h('button', { class: 'btn accent', style: 'width:100%;padding:10px', text: '⬇ 한글(HWPX) 파일 만들기', onclick: generate }),
      h('div', { style: 'display:flex;gap:6px;margin-top:8px' }, [
        h('button', { class: 'btn sm', style: 'flex:1', text: '편집 저장', onclick: function () { saveFinal(true); } }),
        h('button', { class: 'btn sm', style: 'flex:1', text: '텍스트 복사', onclick: copyText })]),
      S.saveMsg]));
    return el;
  }

  /* ---------- 미리보기(편집 가능) ---------- */
  var paperEl = null;
  function rerenderPaper() { if (!paperEl) return; var n = paper(); paperEl.replaceWith(n); }
  function editable(cls, val, onset) {
    var e = h('span', { class: cls, contenteditable: 'true', spellcheck: 'false' }); e.textContent = val;
    e.addEventListener('input', function () { onset(e.textContent.replace(/\s+/g, ' ').trim()); touch(); });
    e.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); e.blur(); } });
    return e;
  }
  function paper() {
    var F = S.F;
    var pt = editable('p-title', F.title, function (v) { F.title = v; }); pt.className = 'p-title'; pt.style.display = 'block';
    var pd = editable('p-date', F.dateLine, function (v) { F.dateLine = v; }); pd.style.display = 'block';
    var table = h('table', {}, [
      h('tr', {}, [h('th', { text: F.headPrev }), h('th', { text: F.headNext })]),
      h('tr', { class: 'per' }, [
        h('th', {}, editable('', F.periodPrev, function (v) { F.periodPrev = v; })),
        h('th', {}, editable('', F.periodNext, function (v) { F.periodNext = v; }))]),
      h('tr', {}, [h('td', {}, cell('prev')), h('td', {}, cell('next'))])
    ]);
    paperEl = h('div', { class: 'paper' }, [pt, pd, table]);
    return paperEl;
  }
  function cell(sec) {
    var F = S.F, frag = h('div');
    CATS.forEach(function (cat, ci) {
      var list = F[sec][ci];
      frag.appendChild(h('div', { class: 'p-cat' }, ['□ ' + cat, h('span', { class: 'tools' }, [
        h('button', { class: 'btn sm', title: '이 항목군 문장 자동 정리', text: '✦ 정리', onclick: function () { polish([{ sec: sec, ci: ci }]); } })])]));
      if (!list.length) frag.appendChild(h('div', { class: 'p-item p-empty' }, [h('span', { class: 'dash', text: '-' }), h('span', { text: F.emptyText })]));
      list.forEach(function (it, ii) {
        var tag = F.showAgency && it.tag ? h('span', { class: 'tag' + (it.hideTag ? ' off' : ''), title: '클릭하면 이 항목만 기관 표기 숨김/표시', text: '[' + it.tag + ']', onclick: function () { it.hideTag = !it.hideTag; touch(); rerenderPaper(); } }) : null;
        var label = editable('tx', it.text, function (v) { it.text = v; });
        var row = h('div', { class: 'p-item' }, [h('span', { class: 'dash', text: '-' }), label,
          F.showStatus && sec === 'prev' && it.status ? h('span', { class: 'tag', text: '(' + it.status + ')' }) : null, tag,
          h('span', { class: 'acts' }, [
            h('button', { class: 'icon-btn', title: '위로', text: '↑', onclick: function () { if (ii > 0) { list.splice(ii - 1, 0, list.splice(ii, 1)[0]); touch(); rerenderPaper(); } } }),
            h('button', { class: 'icon-btn', title: '아래로', text: '↓', onclick: function () { if (ii < list.length - 1) { list.splice(ii + 1, 0, list.splice(ii, 1)[0]); touch(); rerenderPaper(); } } }),
            h('button', { class: 'icon-btn', title: '세부 항목 추가', text: '·+', onclick: function () { (it.subs = it.subs || []).push('세부 내용'); touch(); rerenderPaper(); } }),
            h('button', { class: 'icon-btn', title: '삭제', text: '✕', onclick: function () { list.splice(ii, 1); touch(); rerenderPaper(); } })
          ])]);
        frag.appendChild(row);
        (it.subs || []).forEach(function (s, si) {
          frag.appendChild(h('div', { class: 'p-sub' }, [h('span', { text: '·' }), editable('tx', s, function (v) { it.subs[si] = v; }),
            h('button', { class: 'icon-btn', style: 'width:20px;height:20px;font-size:11px', title: '세부 삭제', text: '✕', onclick: function () { it.subs.splice(si, 1); touch(); rerenderPaper(); } })]));
        });
      });
      frag.appendChild(h('button', { class: 'p-add', text: '+ 항목 추가', onclick: function () {
        list.push({ text: '새 항목', subs: [], agency: '케이브레인컴퍼니', tag: tagOf('케이브레인컴퍼니'), status: '' }); touch(); rerenderPaper();
      } }));
    });
    return frag;
  }

  /* ---------- 저장·생성 ---------- */
  async function saveFinal(notify) {
    var r = await KR.call('saveFinal', { key: S.rep.key, final: JSON.stringify(S.F), version: S.F.version });
    S.raw.final = { json: S.F, version: S.F.version, updatedAt: r.updatedAt };
    S.dirty = false; if (S.saveMsg) S.saveMsg.textContent = '최종본 저장 ' + KR.fmtTime(r.updatedAt);
    if (notify) KR.toast('편집 내용을 저장했습니다');
  }
  function reportData() {
    var F = S.F;
    function lists(sec) {
      return F[sec].map(function (l) {
        return l.map(function (it) { return { text: it.text, subs: it.subs || [], tag: it.hideTag ? '' : it.tag, status: sec === 'prev' ? it.status : '' }; });
      });
    }
    return {
      title: F.title, dateLine: F.dateLine, headPrev: F.headPrev, headNext: F.headNext,
      periodPrev: F.periodPrev, periodNext: F.periodNext, categories: CATS,
      prev: lists('prev'), next: lists('next'), showAgency: F.showAgency, showStatus: F.showStatus, emptyText: F.emptyText
    };
  }
  var tplCache = null;
  async function generate() {
    try {
      if (!tplCache) {
        var res = await fetch('template/report_template.hwpx', { cache: 'no-cache' });
        if (!res.ok) throw new Error('양식 파일(template/report_template.hwpx)을 찾을 수 없습니다');
        tplCache = await res.arrayBuffer();
      }
      var blob = await HWPX.generate(tplCache, reportData(), 'blob');
      var name = KR.fileName(S.rep, S.F.version);
      var a = h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      await saveFinal(false);
      KR.toast(name + ' 저장됨');
    } catch (e) { KR.toast(e.message, 'bad'); console.error(e); }
  }
  function copyText() {
    var F = S.F, out = [F.title, F.dateLine, ''];
    ['prev', 'next'].forEach(function (sec) {
      out.push('<' + (sec === 'prev' ? F.headPrev : F.headNext) + '> ' + (sec === 'prev' ? F.periodPrev : F.periodNext));
      CATS.forEach(function (c, ci) {
        out.push('□ ' + c);
        var l = F[sec][ci]; if (!l.length) out.push(' - ' + F.emptyText);
        l.forEach(function (it) {
          out.push(' - ' + it.text + (F.showStatus && sec === 'prev' && it.status ? ' (' + it.status + ')' : '') + (F.showAgency && it.tag && !it.hideTag ? ' [' + it.tag + ']' : ''));
          (it.subs || []).forEach(function (s) { out.push('   · ' + s); });
        });
      });
      out.push('');
    });
    var txt = out.join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { KR.toast('텍스트를 복사했습니다'); }, function () { prompt('복사하세요', txt); });
  }
  function rebuild() {
    if ((S.dirty || S.raw.final) && !confirm('기관 입력으로 다시 취합하면 지금 편집한 내용이 사라집니다. 계속할까요?')) return;
    var v = S.F.version;
    KR.call('load', { key: S.rep.key }).then(function (r) {
      S.raw.entries = r.entries; S.raw.subs = r.subs; S.F = build(r.entries); S.F.version = v; render(); touch();
      KR.toast('기관 입력 ' + r.entries.length + '건으로 다시 취합했습니다');
    }, function (e) { KR.toast(e.message, 'bad'); });
  }

  /* ---------- 문장 자동 정리 ---------- */
  function polish(targets) {
    var F = S.F;
    targets = targets || ['prev', 'next'].reduce(function (a, sec) { return a.concat(CATS.map(function (c, ci) { return { sec: sec, ci: ci }; })); }, []);
    targets = targets.filter(function (t) { return F[t.sec][t.ci].length; });
    if (!targets.length) { KR.toast('정리할 항목이 없습니다'); return; }
    function key(l) { return JSON.stringify(l.map(function (x) { return [x.text, x.subs || []]; })); }
    var results = targets.map(function (t) {
      var items = F[t.sec][t.ci];
      var after = Tidy.items(items.map(function (it) { return { text: it.text, subs: it.subs || [], tag: it.tag, agency: it.agency, status: it.status, hideTag: it.hideTag }; }),
        t.sec === 'prev' ? S.rep.prevStart : S.rep.nextStart);
      return { t: t, before: items, after: after };
    }).filter(function (r) { return key(r.before) !== key(r.after); });
    if (!results.length) { KR.toast('고칠 부분이 없습니다'); return; }
    var body = h('div'), checks = [];
    results.forEach(function (res) {
      var c = h('input', { type: 'checkbox' }); c.checked = true; checks.push({ c: c, res: res });
      function li(it) { return h('li', {}, [it.text + (it.tag ? ' [' + it.tag + ']' : ''), (it.subs || []).length ? h('div', { class: 'small', text: it.subs.map(function (s) { return '· ' + s; }).join('  ') }) : null]); }
      body.appendChild(h('div', { style: 'margin-bottom:18px' }, [
        h('label', { class: 'opt', style: 'font-weight:700' }, [c, SEC[res.t.sec] + ' · □ ' + CATS[res.t.ci]]),
        h('div', { class: 'diff' }, [
          h('div', { class: 'before' }, [h('h4', { text: '현재', style: 'padding-left:12px' }), h('ol', {}, res.before.map(li))]),
          h('div', { class: 'after' }, [h('h4', { text: '제안', style: 'padding-left:12px' }), h('ol', {}, res.after.map(li))])])]));
    });
    var m = modal('문장 자동 정리 — 적용할 항목군을 고르세요 (' + results.length + '곳 변경)', body, [
      h('button', { class: 'btn', text: '닫기', onclick: function () { m.remove(); } }),
      h('button', { class: 'btn primary', text: '선택한 제안 적용', onclick: function () {
        var n = 0;
        checks.forEach(function (x) {
          if (!x.c.checked) return;
          F[x.res.t.sec][x.res.t.ci] = x.res.after.map(function (it) {
            return { text: it.text, subs: it.subs || [], tag: it.tag || '', agency: it.agency || '', status: it.status || '', hideTag: !!it.hideTag };
          }); n++;
        });
        m.remove(); if (n) { touch(); rerenderPaper(); KR.toast(n + '개 항목군에 적용했습니다'); }
      } })]);
  }

  function rawModal() {
    var body = h('div');
    (S.me.agencies || []).forEach(function (a) {
      var es = S.raw.entries.filter(function (e) { return e.agency === a.name; });
      body.appendChild(h('h3', { style: 'margin:6px 0', text: a.name + (es.length ? '' : ' — 입력 없음') }));
      ['prev', 'next'].forEach(function (sec) {
        var rows = es.filter(function (e) { return e.sec === sec; });
        if (!rows.length) return;
        body.appendChild(h('div', { class: 'small', style: 'font-weight:700;margin-top:6px', text: SEC[sec] }));
        body.appendChild(h('ul', { style: 'margin:4px 0 10px;font-size:14px' }, rows.map(function (e) {
          return h('li', { text: '[' + CATS[e.cat] + '] ' + e.text.replace(/\n/g, ' / ') + (e.status ? ' (' + e.status + ')' : '') });
        })));
      });
    });
    var m = modal('기관별 원본 입력', body, [h('button', { class: 'btn', text: '닫기', onclick: function () { m.remove(); } })]);
  }

  function modal(title, body, buttons) {
    var bg = h('div', { class: 'modal-bg', onclick: function (e) { if (e.target === bg && buttons.length) bg.remove(); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-label': title }, [h('header', {}, h('h3', { text: title })), h('div', { class: 'body' }, body),
        buttons.length ? h('footer', {}, buttons) : null]));
    document.body.appendChild(bg); return bg;
  }

  if (sessionStorage.getItem('kr_code')) boot().catch(function (e) { sessionStorage.removeItem('kr_code'); loginView(e.message); });
  else loginView();
})();
