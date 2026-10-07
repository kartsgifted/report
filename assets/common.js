/* K예술영재 업무보고 시스템 — 공통 (날짜·보고 회차·API) */
(function (root) {
  'use strict';

  /* ===== 설정 =====
   * Apps Script 웹앱을 배포한 뒤 받은 주소를 API_URL에 넣는다.
   * 비워 두거나 주소 뒤에 ?demo=1 을 붙이면 브라우저 안에서만 동작하는 체험 모드가 된다. */
  var CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbym7JDOEuwACn4bmap2NCqSpk3sfSvDn9L_1pxnLyjc1JbuJiJe2cwCHZlEab0t2eEorw/exec',
    CATEGORIES: ['K예술영재 심화멘토링', 'K예술영재 겨울캠프', 'K예술영재 공연', '홍보/다큐/아카이빙', '기타'],
    DUE_TIME: '17:00',
    // 시트 holidays 탭이 우선. 비어 있을 때만 사용
    HOLIDAYS: {
      '2026-10-09': '한글날', '2026-12-25': '성탄절', '2027-01-01': '신정',
      '2027-02-08': '설 연휴', '2027-02-09': '설 대체공휴일', '2027-03-01': '삼일절'
    }
  };

  var WD = '일월화수목금토';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function add(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function mondayOf(d) { var w = d.getDay(); return add(d, w === 0 ? -6 : 1 - w); }
  /** 10. 5.(월) */
  function kd(d) { return (d.getMonth() + 1) + '. ' + d.getDate() + '.(' + WD[d.getDay()] + ')'; }
  /** 26. 10. 9.(금) */
  function kdy(d) { return String(d.getFullYear()).slice(2) + '. ' + kd(d); }
  function range(a, b) { return kd(a) + ' ~ ' + kd(b); }

  var holidays = Object.assign({}, CONFIG.HOLIDAYS);
  function setHolidays(list) {
    if (list && Object.keys(list).length) holidays = list;
  }
  function isOff(d) { return d.getDay() === 0 || d.getDay() === 6 || !!holidays[ymd(d)]; }
  function prevBiz(d) { while (isOff(d)) d = add(d, -1); return d; }
  function nthBizBefore(d, n) { for (var i = 0; i < n; i++) d = prevBiz(add(d, -1)); return d; }

  /* ===== 보고 회차 =====
   * 주간: W-YYYY-MM-DD(그 주 월요일). 주차 이름은 목요일이 속한 달 기준.
   * 월간: M-YYYY-MM(제목에 쓰는 '계획 월'). 지난 실적 = 전월, 향후 계획 = 해당 월. */
  function weekly(monday) {
    var mon = mondayOf(monday), thu = add(mon, 3), fri = add(mon, 4);
    var label = (thu.getMonth() + 1) + '월 ' + Math.ceil(thu.getDate() / 7) + '주';
    var due = prevBiz(fri);
    return {
      type: 'W', key: 'W-' + ymd(mon), label: label, short: label.replace(' ', ''),
      title: label + ' 업무보고', typeName: '주간',
      prevStart: mon, prevEnd: fri, nextStart: add(mon, 7), nextEnd: add(mon, 11),
      periodPrev: range(mon, fri), periodNext: range(add(mon, 7), add(mon, 11)),
      due: due, internalDue: nthBizBefore(due, 1),
      prevKey: 'W-' + ymd(add(mon, -7)), nextKey: 'W-' + ymd(add(mon, 7)),
      prevReport: function () { return weekly(add(mon, -7)); },
      nextReport: function () { return weekly(add(mon, 7)); }
    };
  }
  function monthly(year, month) { // month: 1~12, 계획 월
    var first = new Date(year, month - 1, 1), last = new Date(year, month, 0);
    var pFirst = new Date(year, month - 2, 1), pLast = new Date(year, month - 1, 0);
    var due = prevBiz(pLast);
    // 지난달에 속한 주간보고 회차(목요일 기준)
    var weeks = [], m = mondayOf(pFirst);
    for (; m <= pLast; m = add(m, 7)) { var th = add(m, 3); if (th.getMonth() === pFirst.getMonth()) weeks.push('W-' + ymd(m)); }
    var label = month + '월';
    return {
      type: 'M', key: 'M-' + year + '-' + pad(month), label: label, short: label,
      title: '(' + label + ') 업무보고', typeName: '월간',
      prevStart: pFirst, prevEnd: pLast, nextStart: first, nextEnd: last,
      periodPrev: range(pFirst, pLast), periodNext: range(first, last),
      due: due, internalDue: nthBizBefore(due, 2), weekKeys: weeks,
      prevKey: 'M-' + pFirst.getFullYear() + '-' + pad(pFirst.getMonth() + 1),
      prevReport: function () { return monthly(pFirst.getFullYear(), pFirst.getMonth() + 1); },
      nextReport: function () { return monthly(first.getMonth() === 11 ? year + 1 : year, month === 12 ? 1 : month + 1); }
    };
  }
  function fromKey(key) {
    if (/^W-/.test(key)) return weekly(parse(key.slice(2)));
    var a = key.slice(2).split('-').map(Number); return monthly(a[0], a[1]);
  }
  /** 지금 작성해야 할 회차: 주간은 이번 주(토·일이면 다음 주), 월간은 다음 달 */
  function current(type) {
    var t = today();
    if (type === 'W') return weekly(t.getDay() === 6 || t.getDay() === 0 ? add(mondayOf(t), 7) : t);
    var m = t.getMonth() + 2, y = t.getFullYear(); if (m > 12) { m = 1; y++; }
    // 이미 이번 달 마감이 지났으면 다다음 달
    var r = monthly(y, m); if (today() > r.due) r = r.nextReport();
    return r;
  }
  function dday(due) {
    var n = Math.round((due - today()) / 864e5);
    return n === 0 ? 'D-day' : (n > 0 ? 'D-' + n : 'D+' + (-n));
  }

  /* ===== 파일명: K예술영재 프로젝트_주간업무보고_10월2주_Ver.1.0_20261008.hwpx ===== */
  function fileName(rep, version, agency) {
    var d = today();
    return ['K예술영재 프로젝트', rep.typeName + '업무보고', rep.short].concat(agency ? [agency] : [])
      .concat(['Ver.' + version, '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())]).join('_') + '.hwpx';
  }
  function bumpVersion(v, minor) {
    var a = String(v || '1.0').split('.').map(Number);
    if (minor) { if (a.length < 3) a.push(1); else a[2]++; return a.join('.'); }
    return a[0] + '.' + ((a[1] || 0) + 1);
  }

  /* ===== API ===== */
  var DEMO = !CONFIG.API_URL || /[?&]demo=1/.test(location.search);

  async function call(action, data) {
    data = Object.assign({ action: action, code: sessionStorage.getItem('kr_code') || '' }, data || {});
    if (DEMO) return Demo.handle(data);
    var res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
    var j = await res.json();
    if (!j.ok) throw new Error(j.error || '서버 오류');
    return j.data;
  }

  /* ===== 체험 모드 백엔드 (Code.gs와 같은 규칙, 이 브라우저에만 저장) ===== */
  var Demo = (function () {
    var AG = [
      { name: '레이아웃', tag: '레이아웃', code: 'layout' },
      { name: 'MBC C&I', tag: 'MBC C&I', code: 'mbc' },
      { name: '케이브레인컴퍼니', tag: '케이브레인', code: 'kbrain' }
    ];
    var ADMIN = 'admin';
    var mem = {};
    function db() {
      try { return JSON.parse(localStorage.getItem('kr_demo') || '{"entries":[],"subs":[],"finals":{}}'); }
      catch (e) { return mem.db || (mem.db = { entries: [], subs: [], finals: {} }); }
    }
    function put(d) { try { localStorage.setItem('kr_demo', JSON.stringify(d)); } catch (e) { mem.db = d; } }
    function who(code) {
      if (code === ADMIN) return { role: 'admin', agency: '' };
      var a = AG.filter(function (x) { return x.code === code; })[0];
      if (!a) throw new Error('코드가 올바르지 않습니다');
      return { role: 'agency', agency: a.name };
    }
    function pub() { return AG.map(function (a) { return { name: a.name, tag: a.tag }; }); }
    function handle(q) {
      var me = who(q.code), d = db(), now = new Date().toISOString();
      function scope(agency) { return me.role === 'admin' ? (agency || '') : me.agency; }
      switch (q.action) {
        case 'login': return { role: me.role, agency: me.agency, agencies: pub(), holidays: {}, author: '㈜케이브레인컴퍼니' };
        case 'load': {
          var ag = scope(q.agency);
          return {
            entries: d.entries.filter(function (e) { return e.key === q.key && (!ag || e.agency === ag); }),
            subs: d.subs.filter(function (s) { return s.key === q.key && (!ag || s.agency === ag); }),
            final: me.role === 'admin' ? (d.finals[q.key] || null) : null
          };
        }
        case 'loadMany': {
          var ag2 = scope(q.agency);
          return { entries: d.entries.filter(function (e) { return q.keys.indexOf(e.key) >= 0 && (!ag2 || e.agency === ag2); }) };
        }
        case 'save': {
          var ag3 = scope(q.agency); if (!ag3) throw new Error('기관을 지정하세요');
          d.entries = d.entries.filter(function (e) { return !(e.key === q.key && e.agency === ag3); });
          (q.entries || []).forEach(function (e, i) {
            d.entries.push({ key: q.key, agency: ag3, sec: e.sec, cat: +e.cat, ord: i, text: e.text, status: e.status || '', src: e.src || '', updated: now });
          });
          var s = d.subs.filter(function (x) { return x.key === q.key && x.agency === ag3; })[0];
          if (!s) { s = { key: q.key, agency: ag3, state: '', savedAt: '', submittedAt: '' }; d.subs.push(s); }
          s.savedAt = now; if (q.submit) { s.state = '제출'; s.submittedAt = now; } else if (s.state !== '제출') s.state = '작성중';
          put(d); return { sub: s };
        }
        case 'saveFinal': {
          if (me.role !== 'admin') throw new Error('권한 없음');
          d.finals[q.key] = { json: q.final, version: q.version || '', updatedAt: now }; put(d); return { updatedAt: now };
        }
      }
      throw new Error('알 수 없는 요청: ' + q.action);
    }
    return { handle: function (q) { return new Promise(function (ok, no) { setTimeout(function () { try { ok(JSON.parse(JSON.stringify(handle(q)))); } catch (e) { no(e); } }, 120); }); }, AG: AG };
  })();

  /* ===== 작은 도우미 ===== */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    [].concat(kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function toast(msg, kind) {
    var t = h('div', { class: 'toast ' + (kind || ''), text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }
  function fmtTime(iso) {
    if (!iso) return ''; var d = new Date(iso);
    return (d.getMonth() + 1) + '. ' + d.getDate() + '. ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; }

  root.KR = {
    CONFIG: CONFIG, DEMO: DEMO, Demo: Demo, call: call,
    weekly: weekly, monthly: monthly, fromKey: fromKey, current: current, dday: dday,
    kd: kd, kdy: kdy, ymd: ymd, today: today, setHolidays: setHolidays, holidays: function () { return holidays; },
    fileName: fileName, bumpVersion: bumpVersion, h: h, toast: toast, fmtTime: fmtTime, autosize: autosize
  };
})(window);
