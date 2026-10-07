/* 한예종 업무보고 HWPX 생성기
 * template/report_template.hwpx(원본 양식에서 만든 자리표시자 템플릿)에 내용을 채워 넣는다.
 * 브라우저(window.JSZip)와 Node(require('jszip')) 모두에서 동작.
 */
(function (root) {
  'use strict';

  var PARA_BODY = 19;   // 원본 본문 문단(양쪽 정렬, 줄간격 200%)
  var PARA_ITEM = 21;   // 추가: '- ' 항목(내어쓰기, 줄간격 160%)
  var PARA_SUB = 22;    // 추가: '· ' 세부 항목
  var CHAR_HEAD = 1;    // 휴먼명조 12pt 진하게
  var CHAR_TEXT = 11;   // 휴먼명조 12pt
  var CHAR_SPACER = 10; // 5pt 빈 줄
  var CHAR_TAG = 13;    // 추가: 기관 표기 10pt 회색

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function p(paraId, runs) {
    return '<hp:p id="2147483648" paraPrIDRef="' + paraId + '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
      runs.map(function (r) {
        return r.text == null
          ? '<hp:run charPrIDRef="' + r.cp + '"/>'
          : '<hp:run charPrIDRef="' + r.cp + '"><hp:t>' + esc(r.text) + '</hp:t></hp:run>';
      }).join('') + '</hp:p>';
  }

  function spacer() { return p(PARA_BODY, [{ cp: CHAR_SPACER }]); }

  /** 한 칸(지난 실적 또는 향후 계획)의 문단 XML */
  function cellBody(categories, lists, opt) {
    var out = [];
    categories.forEach(function (cat, i) {
      out.push(spacer());
      out.push(p(PARA_BODY, [{ cp: CHAR_HEAD, text: '□ ' + cat }]));
      var items = (lists && lists[i]) || [];
      items = items.filter(function (it) { return it && String(it.text || '').trim(); });
      if (!items.length) {
        out.push(p(PARA_ITEM, [{ cp: CHAR_TEXT, text: ' - ' + (opt.emptyText || '') }]));
        return;
      }
      items.forEach(function (it) {
        var text = String(it.text).trim();
        if (opt.showStatus && it.status) text += ' (' + it.status + ')';
        var runs = [{ cp: CHAR_TEXT, text: ' - ' + text }];
        if (opt.showAgency && it.tag) runs.push({ cp: CHAR_TAG, text: ' [' + it.tag + ']' });
        out.push(p(PARA_ITEM, runs));
        (it.subs || []).forEach(function (s) {
          s = String(s || '').trim();
          if (s) out.push(p(PARA_SUB, [{ cp: CHAR_TEXT, text: '· ' + s.replace(/^[·ㆍ\-*]\s*/, '') }]));
        });
      });
    });
    return out.join('');
  }

  function plainText(r, categories) {
    var hp = r.headPrev || '지난 실적', hn = r.headNext || '향후 계획';
    var lines = [r.title, r.dateLine, '', '<' + hp + '> ' + r.periodPrev];
    function dump(lists) {
      categories.forEach(function (c, i) {
        lines.push('□ ' + c);
        ((lists && lists[i]) || []).forEach(function (it) { lines.push(' - ' + it.text); });
      });
    }
    dump(r.prev);
    lines.push('', '<' + hn + '> ' + r.periodNext);
    dump(r.next);
    return lines.join('\r\n').slice(0, 1000);
  }

  /**
   * @param {ArrayBuffer|Uint8Array} template  report_template.hwpx
   * @param {object} r  {title,dateLine,headPrev,headNext,periodPrev,periodNext,categories,prev,next,showAgency,showStatus,emptyText}
   * @param {string} type  'blob' | 'uint8array' | 'nodebuffer'
   */
  async function generate(template, r, type) {
    var JSZip = root.JSZip || (typeof require === 'function' ? require('jszip') : null);
    var zip = await JSZip.loadAsync(template);
    var cats = r.categories;
    var opt = { showAgency: !!r.showAgency, showStatus: !!r.showStatus, emptyText: r.emptyText == null ? '해당 없음' : r.emptyText };

    var sec = await zip.file('Contents/section0.xml').async('string');
    var map = {
      __TITLE__: esc(r.title), __DATELINE__: esc(r.dateLine),
      __HEAD_PREV__: esc(r.headPrev || '지난 실적'), __HEAD_NEXT__: esc(r.headNext || '향후 계획'),
      __PERIOD_PREV__: esc(r.periodPrev), __PERIOD_NEXT__: esc(r.periodNext),
      __BODY_PREV__: cellBody(cats, r.prev, opt), __BODY_NEXT__: cellBody(cats, r.next, opt)
    };
    Object.keys(map).forEach(function (k) { sec = sec.split(k).join(map[k]); });
    zip.file('Contents/section0.xml', sec);

    var hpf = await zip.file('Contents/content.hpf').async('string');
    hpf = hpf.replace('__DOCTITLE__', esc(r.title)).replace('__MODIFIED__', new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
    zip.file('Contents/content.hpf', hpf);
    zip.file('Preview/PrvText.txt', plainText(r, cats));

    var mt = await zip.file('mimetype').async('uint8array');
    zip.file('mimetype', mt, { compression: 'STORE' });
    return zip.generateAsync({ type: type || 'blob', compression: 'DEFLATE', mimeType: 'application/hwp+zip' });
  }

  var api = { generate: generate, cellBody: cellBody };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HWPX = api;
})(typeof window !== 'undefined' ? window : globalThis);
