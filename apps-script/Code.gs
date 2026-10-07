/**
 * K예술영재 업무보고 시스템 — 백엔드 (Google Apps Script)
 * 구글시트에 붙인 스크립트로 웹앱 배포해서 사용합니다. 설치 방법은 설치안내.md 참고.
 *
 * 시트 탭
 *  - 설정     : 구분(기관/관리자/작성자) | 이름 | 약칭 | 코드 | 이메일
 *  - 휴일     : 날짜(yyyy-MM-dd) | 이름
 *  - 입력     : key | agency | sec | cat | ord | text | status | src | updated
 *  - 제출현황 : key | agency | state | savedAt | submittedAt
 *  - 최종본   : key | json | version | updatedAt
 * 스크립트 속성 (선택)
 *  - INPUT_PAGE_URL : 기관 입력 화면 주소 (마감 알림 메일에 링크로 들어감)
 *
 * 비용: 구글시트·Apps Script·MailApp(일 100통 한도)·GitHub Pages 모두 무료 범위에서 동작하며
 *       외부 유료 API를 호출하지 않습니다. 문장 정리는 브라우저 안에서 규칙으로 처리합니다.
 */

var CATEGORIES = ['K예술영재 심화멘토링', 'K예술영재 겨울캠프', 'K예술영재 공연', '홍보/다큐/아카이빙', '기타'];
var TABS = {
  '설정': ['구분', '이름', '약칭', '코드', '이메일'],
  '휴일': ['날짜', '이름'],
  '입력': ['key', 'agency', 'sec', 'cat', 'ord', 'text', 'status', 'src', 'updated'],
  '제출현황': ['key', 'agency', 'state', 'savedAt', 'submittedAt'],
  '최종본': ['key', 'json', 'version', 'updatedAt']
};

/* ========== 최초 1회 실행: 탭 만들기 ========== */
function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    if (sh.getLastRow() === 0) sh.appendRow(TABS[name]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, TABS[name].length).setFontWeight('bold').setBackground('#E8F1F4');
  });
  var cfg = ss.getSheetByName('설정');
  if (cfg.getLastRow() === 1) {
    function code() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }
    cfg.getRange(2, 1, 5, 5).setValues([
      ['기관', '레이아웃', '레이아웃', code(), ''],
      ['기관', 'MBC C&I', 'MBC C&I', code(), ''],
      ['기관', '케이브레인컴퍼니', '케이브레인', code(), ''],
      ['관리자', '케이브레인 취합', '', code(), ''],
      ['작성자', '㈜케이브레인컴퍼니', '', '', '']
    ]);
  }
  var hol = ss.getSheetByName('휴일');
  if (hol.getLastRow() === 1) {
    hol.getRange(2, 1, 6, 2).setValues([
      ['2026-10-09', '한글날'], ['2026-12-25', '성탄절'], ['2027-01-01', '신정'],
      ['2027-02-08', '설 연휴'], ['2027-02-09', '설 대체공휴일'], ['2027-03-01', '삼일절']
    ]);
  }
  ['Sheet1', '시트1'].forEach(function (n) { var s = ss.getSheetByName(n); if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s); });
  SpreadsheetApp.getUi && Logger.log('설정 탭의 코드를 각 기관에 전달하세요.');
}

/* ========== 웹앱 진입점 ========== */
function doGet() {
  return json({ ok: true, data: 'K예술영재 업무보고 API' });
}
function doPost(e) {
  try {
    var q = JSON.parse(e.postData.contents);
    var me = auth(q.code);
    return json({ ok: true, data: route(q, me) });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function route(q, me) {
  switch (q.action) {
    case 'login': return { role: me.role, agency: me.agency, agencies: agencies(), holidays: holidays(), author: author() };
    case 'load': return load(q, me);
    case 'loadMany': return loadMany(q, me);
    case 'save': return withLock(function () { return save(q, me); });
    case 'saveFinal': admin(me); return withLock(function () { return saveFinal(q); });
  }
  throw new Error('알 수 없는 요청: ' + q.action);
}

/* ========== 인증 ========== */
function config() {
  return rows('설정').map(function (r) { return { kind: r[0], name: r[1], tag: r[2], code: String(r[3]).trim(), email: r[4] }; });
}
function auth(code) {
  code = String(code || '').trim();
  if (!code) throw new Error('코드를 입력하세요');
  var c = config().filter(function (x) { return x.code && x.code === code; })[0];
  if (!c) throw new Error('코드가 올바르지 않습니다');
  if (c.kind === '관리자') return { role: 'admin', agency: '' };
  if (c.kind === '기관') return { role: 'agency', agency: c.name };
  throw new Error('코드가 올바르지 않습니다');
}
function admin(me) { if (me.role !== 'admin') throw new Error('권한이 없습니다'); }
function agencies() { return config().filter(function (x) { return x.kind === '기관'; }).map(function (x) { return { name: x.name, tag: x.tag || x.name }; }); }
function author() { var a = config().filter(function (x) { return x.kind === '작성자'; })[0]; return a ? a.name : '㈜케이브레인컴퍼니'; }
function holidays() {
  var o = {};
  rows('휴일').forEach(function (r) { var d = ymd(r[0]); if (d) o[d] = r[1]; });
  return o;
}

/* ========== 입력 ========== */
function scope(me, agency) { return me.role === 'admin' ? (agency || '') : me.agency; }
function entryObj(r) { return { key: r[0], agency: r[1], sec: r[2], cat: Number(r[3]), ord: Number(r[4]), text: String(r[5]), status: r[6], src: r[7], updated: r[8] }; }
function subObj(r) { return { key: r[0], agency: r[1], state: r[2], savedAt: r[3], submittedAt: r[4] }; }

function load(q, me) {
  var ag = scope(me, q.agency);
  var out = {
    entries: rows('입력').filter(function (r) { return r[0] === q.key && (!ag || r[1] === ag); }).map(entryObj),
    subs: rows('제출현황').filter(function (r) { return r[0] === q.key && (!ag || r[1] === ag); }).map(subObj),
    final: null
  };
  if (me.role === 'admin') {
    var f = rows('최종본').filter(function (r) { return r[0] === q.key; })[0];
    if (f) out.final = { json: f[1], version: f[2], updatedAt: f[3] };
  }
  return out;
}
function loadMany(q, me) {
  var ag = scope(me, q.agency), keys = q.keys || [];
  return { entries: rows('입력').filter(function (r) { return keys.indexOf(r[0]) >= 0 && (!ag || r[1] === ag); }).map(entryObj) };
}
function save(q, me) {
  var ag = scope(me, q.agency);
  if (!ag) throw new Error('기관을 지정하세요');
  if (!/^(W-\d{4}-\d{2}-\d{2}|M-\d{4}-\d{2})$/.test(q.key || '')) throw new Error('보고 회차가 올바르지 않습니다');
  var now = new Date().toISOString();
  var sh = sheet('입력');
  // 이 기관·회차의 기존 행 삭제 후 새로 기록
  var data = sh.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) if (data[i][0] === q.key && data[i][1] === ag) sh.deleteRow(i + 1);
  var add = (q.entries || []).filter(function (e) { return String(e.text || '').trim(); }).map(function (e, i) {
    if (['prev', 'next'].indexOf(e.sec) < 0 || !(e.cat >= 0 && e.cat < CATEGORIES.length)) throw new Error('입력 형식 오류');
    return [q.key, ag, e.sec, String(e.cat), String(i), String(e.text).slice(0, 2000), e.status || '', e.src || '', now];
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, add[0].length).setNumberFormat('@').setValues(add);

  var ss = sheet('제출현황'), sd = ss.getDataRange().getValues(), row = -1;
  for (var j = 1; j < sd.length; j++) if (sd[j][0] === q.key && sd[j][1] === ag) { row = j; break; }
  var sub = row > 0 ? subObj(sd[row]) : { key: q.key, agency: ag, state: '', savedAt: '', submittedAt: '' };
  sub.savedAt = now;
  if (q.submit) { sub.state = '제출'; sub.submittedAt = now; } else if (sub.state !== '제출') sub.state = '작성중';
  var vals = [[sub.key, sub.agency, sub.state, sub.savedAt, sub.submittedAt]];
  if (row > 0) ss.getRange(row + 1, 1, 1, 5).setValues(vals);
  else ss.getRange(ss.getLastRow() + 1, 1, 1, 5).setNumberFormat('@').setValues(vals);
  return { sub: sub };
}
function saveFinal(q) {
  var now = new Date().toISOString(), sh = sheet('최종본'), d = sh.getDataRange().getValues();
  var vals = [[q.key, String(q.final || ''), String(q.version || ''), now]];
  for (var i = 1; i < d.length; i++) if (d[i][0] === q.key) { sh.getRange(i + 1, 1, 1, 4).setValues(vals); return { updatedAt: now }; }
  sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setNumberFormat('@').setValues(vals);
  return { updatedAt: now };
}

/* ========== 마감 알림 메일 (선택) ==========
 * installReminders()를 한 번 실행하면 매일 오전 10시에 확인해서,
 * 오늘이 기관 초안 마감일이면 아직 제출하지 않은 기관(설정 탭에 이메일이 있는 곳)에 알림을 보냅니다. */
function installReminders() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'remindDrafts') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('remindDrafts').timeBased().everyDays(1).atHour(10).create();
}
function remindDrafts() {
  var hol = holidays(), today = dOnly(new Date());
  function off(d) { return d.getDay() === 0 || d.getDay() === 6 || !!hol[ymd(d)]; }
  function prevBiz(d) { while (off(d)) d = addD(d, -1); return d; }
  function bizBefore(d, n) { for (var i = 0; i < n; i++) d = prevBiz(addD(d, -1)); return d; }
  var targets = [];
  // 주간
  var mon = addD(today, today.getDay() === 0 ? -6 : 1 - today.getDay());
  var wDue = prevBiz(addD(mon, 4));
  if (ymd(bizBefore(wDue, 1)) === ymd(today)) targets.push({ key: 'W-' + ymd(mon), name: '주간보고', due: wDue });
  // 월간 (다음 달 제목)
  var last = new Date(today.getFullYear(), today.getMonth() + 1, 0), mDue = prevBiz(last);
  var pm = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  if (ymd(bizBefore(mDue, 2)) === ymd(today)) targets.push({ key: 'M-' + pm.getFullYear() + '-' + pad(pm.getMonth() + 1), name: '(' + (pm.getMonth() + 1) + '월) 월간보고', due: mDue });
  if (!targets.length) return;
  var subs = rows('제출현황'), url = PropertiesService.getScriptProperties().getProperty('INPUT_PAGE_URL') || '';
  config().filter(function (c) { return c.kind === '기관' && c.email; }).forEach(function (c) {
    targets.forEach(function (t) {
      var done = subs.some(function (r) { return r[0] === t.key && r[1] === c.name && r[2] === '제출'; });
      if (done) return;
      MailApp.sendEmail(String(c.email), '[K예술영재] ' + t.name + ' 초안 마감 안내 (오늘 17:00)',
        c.name + ' 담당자님,\n\n' + t.name + ' 기관 초안 마감이 오늘 17:00입니다.\n한예종 제출일: ' + ymd(t.due) + ' 17:00\n\n' +
        (url ? '작성 페이지: ' + url + '\n\n' : '') + '㈜케이브레인컴퍼니 드림');
    });
  });
}

/* ========== 도우미 ========== */
function sheet(name) { var s = SpreadsheetApp.getActive().getSheetByName(name); if (!s) throw new Error('시트 탭이 없습니다: ' + name + ' (setup 실행 필요)'); return s; }
function rows(name) { var v = sheet(name).getDataRange().getValues(); v.shift(); return v.filter(function (r) { return r.join('') !== ''; }); }
function withLock(fn) { var l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) {
  if (!d) return '';
  if (Object.prototype.toString.call(d) === '[object Date]') return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  var m = String(d).match(/(\d{4})[-.\/]\s*(\d{1,2})[-.\/]\s*(\d{1,2})/);
  return m ? m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) : '';
}
function dOnly(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addD(d, n) { var x = dOnly(d); x.setDate(x.getDate() + n); return x; }
