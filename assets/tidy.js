/* 문장 자동 정리 — 외부 서비스 없이 브라우저 안에서 규칙으로 처리 (비용 0)
 *  1) 공백·마침표 정리, 물결표(~) 앞뒤 띄어쓰기
 *  2) 서술형 끝맺음 → 개조식 명사형 (운영했습니다 → 운영, 협의할 예정입니다 → 협의 예정, 확정되었음 → 확정)
 *  3) 날짜 표기 통일 (10월 7일 · 10/7 · 10.7.  → 10. 7.(수)), 틀린 요일 바로잡기
 *  4) 같은 기관의 똑같은 항목 하나로 합치기
 */
(function (root) {
  'use strict';
  var WD = '일월화수목금토';

  function weekday(y, m, d) { var x = new Date(y, m - 1, d); return x.getMonth() === m - 1 ? WD[x.getDay()] : null; }
  /** 기준일(base)에 가장 가까운 연도로 요일 계산 */
  function wdNear(m, d, base) {
    var best = null, bd = Infinity;
    [base.getFullYear() - 1, base.getFullYear(), base.getFullYear() + 1].forEach(function (y) {
      var x = new Date(y, m - 1, d); if (x.getMonth() !== m - 1) return;
      var diff = Math.abs(x - base); if (diff < bd) { bd = diff; best = y; }
    });
    return best == null ? null : weekday(best, m, d);
  }
  function okMD(m, d) { return m >= 1 && m <= 12 && d >= 1 && d <= 31; }

  function dates(s, base) {
    function fmt(m, d) { m = +m; d = +d; if (!okMD(m, d)) return null; var w = wdNear(m, d, base); return m + '. ' + d + '.' + (w ? '(' + w + ')' : ''); }
    // 10월 7일(수) / 10월7일
    s = s.replace(/(\d{1,2})\s*월\s*(\d{1,2})\s*일(\s*\(\s*[일월화수목금토]\s*\))?/g, function (a, m, d) { return fmt(m, d) || a; });
    // 10/7(수), 10/07 — 분수(2/3 완료)와 헷갈리지 않게: 요일이 붙었거나, ~ 기간이거나, 보고 기간 근처 달일 때만
    var bm = base.getMonth() + 1;
    function near(m) { var diff = ((m - bm) + 12) % 12; return diff <= 2 || diff === 11; }
    s = s.replace(/(^|[^\d\/])(\d{1,2})\/(\d{1,2})(?![\d\/])(\s*\(\s*[일월화수목금토]\s*\))?/g, function (a, pre, m, d, w, off, all) {
      var after = all.slice(off + a.length), before = all.slice(0, off + pre.length);
      var inRange = /^\s*[~∼～]/.test(after) || /[~∼～]\s*$/.test(before);
      if (!w && !inRange && !near(+m)) return a;
      var f = fmt(m, d); return f ? pre + f : a;
    });
    // 10.7.(수) · 10. 7. · 10.07(수) — 끝 마침표나 요일이 있을 때만(소수 1.5 등 보호)
    s = s.replace(/(^|[^\d.])(\d{1,2})\.\s?(\d{1,2})(?:\.(\s*\(\s*[일월화수목금토]\s*\))?|(\s*\(\s*[일월화수목금토]\s*\)))(?!\d)/g,
      function (a, pre, m, d) { var f = fmt(m, d); return f ? pre + f : a; });
    return s;
  }

  var KEEP_HAM = ['포함', '고함', '함함', '조함'];
  function ending(s) {
    var t = s;
    t = t.replace(/\s*(을|를)?\s*(할|하는)\s*예정(입니다|임|이다|이며)?$/, ' 예정');
    t = t.replace(/(\S)\s*예정(입니다|임|이다)$/, '$1 예정');
    t = t.replace(/중(입니다|임|이다|에 있음|에 있습니다)$/, '중');
    t = t.replace(/(\S)(을|를)?\s*(완료|진행|실시|추진|운영|협의|검토|개최|배포|제출|공유|확정)\s*(했습니다|하였습니다|했음|하였음|하였다|했다|합니다|한다|함)$/, '$1$2 $3');
    t = t.replace(/(\S{2,})(했습니다|하였습니다|했음|하였음|하였다|했다|합니다|한다)$/, '$1');
    t = t.replace(/(\S{2,})(되었습니다|됐습니다|되었음|됐음|되었다|됐다|됩니다|된다|됨)$/, '$1');
    var m = t.match(/(\S+)함$/);
    if (m && m[1].length >= 2 && KEEP_HAM.indexOf(m[1].slice(-1) + '함') < 0) t = t.slice(0, -1);
    t = t.replace(/(\S)입니다$/, '$1');
    t = t.replace(/(\S{2,})(드립니다|드림|드려요)$/, '$1');
    // 끝 동작어 앞의 목적격 조사 생략: 멘토링을 운영 → 멘토링 운영, 계약을 협의 예정 → 계약 협의 예정
    if (t !== s) t = t.replace(/(\S)(을|를) (\S+(?: 예정| 중)?)$/, '$1 $3');
    t = t.replace(/\s+(을|를)\s+/g, '$1 ');
    return t;
  }

  function line(s, base) {
    var t = String(s || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/^[-–·ㆍ•*]\s*/, '');
    t = t.replace(/[.。]+$/, '');
    t = dates(t, base);
    t = t.replace(/\s*[~∼～]\s*/g, ' ~ ');
    t = ending(t);
    t = t.replace(/[.。]+$/, '').replace(/\s+/g, ' ').trim();
    t = t.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+,/g, ',');
    return t;
  }

  function norm(s) { return String(s || '').replace(/[\s.,·()]/g, ''); }

  /** items: [{text, subs, tag, ...}], base: Date(기간 시작일) */
  function items(list, base) {
    base = base || new Date();
    var out = [];
    list.forEach(function (it) {
      var n = Object.assign({}, it, { text: line(it.text, base), subs: (it.subs || []).map(function (s) { return line(s, base); }).filter(Boolean) });
      if (!n.text) return;
      var dup = out.filter(function (o) { return o.tag === n.tag && norm(o.text) === norm(n.text); })[0];
      if (dup) { n.subs.forEach(function (s) { if (dup.subs.indexOf(s) < 0) dup.subs.push(s); }); return; }
      out.push(n);
    });
    return out;
  }

  var api = { items: items, line: line };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Tidy = api;
})(typeof window !== 'undefined' ? window : globalThis);
