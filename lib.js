(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.GlossaryLib = lib;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var KEYS = ['id', 'term', 'reading', 'fullName', 'category', 'summary',
    'description', 'analogy', 'example', 'related', 'level'];

  function kataToHira(s) {
    return s.replace(/[\u30a1-\u30f6]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }

  function normalize(s) {
    s = String(s == null ? '' : s).normalize('NFKC').toLowerCase();
    return kataToHira(s).replace(/\s+/g, '');
  }

  var SEARCH_FIELDS = ['term', 'reading', 'fullName', 'summary', 'description'];

  function searchTerms(terms, query) {
    var q = normalize(query);
    if (!q) return terms.slice();
    var prefix = [], rest = [];
    terms.forEach(function (t) {
      var hit = SEARCH_FIELDS.some(function (k) { return normalize(t[k]).indexOf(q) !== -1; });
      if (!hit) return;
      (normalize(t.term).indexOf(q) === 0 ? prefix : rest).push(t);
    });
    return prefix.concat(rest);
  }

  function csvCell(v) {
    var s = Array.isArray(v) ? v.join('|') : String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(terms) {
    var lines = [KEYS.join(',')];
    terms.forEach(function (t) {
      lines.push(KEYS.map(function (k) { return csvCell(t[k]); }).join(','));
    });
    return '\uFEFF' + lines.join('\n') + '\n';
  }

  function parseRows(text) {
    var rows = [], row = [], cell = '', inQ = false, i = 0, n = text.length, c;
    while (i < n) {
      c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; }
      else if (c === ',') { row.push(cell); cell = ''; i++; }
      else if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = ''; i++;
      } else { cell += c; i++; }
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var rows = parseRows(text).filter(function (r) {
      return !(r.length === 1 && r[0] === '');
    });
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return h.trim(); });
    return rows.slice(1).map(function (r) {
      var o = {};
      KEYS.forEach(function (k) { o[k] = ''; });
      header.forEach(function (h, idx) {
        if (KEYS.indexOf(h) !== -1) o[h] = r[idx] == null ? '' : r[idx];
      });
      o.related = o.related ? o.related.split('|').filter(Boolean) : [];
      var lv = Number(o.level);
      o.level = o.level === '' || isNaN(lv) ? 1 : lv;
      return o;
    });
  }

  function str(v) { return v == null ? '' : String(v); }

  function validateTerms(raw) {
    var valid = [], skipped = 0;
    (Array.isArray(raw) ? raw : []).forEach(function (r) {
      if (!r || typeof r !== 'object' || !str(r.id).trim() || !str(r.term).trim() || !str(r.category).trim()) {
        skipped++; return;
      }
      var lv = Math.round(Number(r.level));
      if (isNaN(lv)) lv = 1;
      var t = {};
      KEYS.forEach(function (k) { t[k] = str(r[k]); });
      ['id', 'term', 'category', 'reading'].forEach(function (k) { t[k] = t[k].trim(); });
      t.related = Array.isArray(r.related) ? r.related.map(str) : [];
      t.level = Math.min(3, Math.max(1, lv));
      valid.push(t);
    });
    return { valid: valid, skipped: skipped };
  }

  function mergeTerms(base, local) {
    var map = {};
    local.forEach(function (t) { map[t.id] = t; });
    var used = {};
    var out = base.map(function (t) {
      if (!map[t.id]) return t;
      used[t.id] = true;
      return Object.assign({}, map[t.id], { _local: true });
    });
    local.forEach(function (t) {
      if (!used[t.id] && !base.some(function (b) { return b.id === t.id; })) {
        used[t.id] = true;
        out.push(Object.assign({}, map[t.id], { _local: true }));
      }
    });
    return out;
  }

  function termOfTheDay(terms, date) {
    if (!terms.length) return null;
    var n = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    return terms[n % terms.length];
  }

  var ROWS = [
    ['あいうえおぁぃぅぇぉゔ', 'あ'], ['かきくけこがぎぐげごゕ', 'か'],
    ['さしすせそざじずぜぞ', 'さ'], ['たちつてとだぢづでどっ', 'た'],
    ['なにぬねの', 'な'], ['はひふへほばびぶべぼぱぴぷぺぽ', 'は'],
    ['まみむめも', 'ま'], ['やゆよゃゅょ', 'や'], ['らりるれろ', 'ら'],
    ['わゐゑをんゎ', 'わ']
  ];

  function initialOf(term) {
    var t = str(term.term);
    if (/^[A-Za-z]/.test(t)) return t[0].toUpperCase();
    var s = kataToHira(str(term.reading || term.term).normalize('NFKC').trim());
    var c = s[0];
    if (!c) return '#';
    for (var i = 0; i < ROWS.length; i++) {
      if (ROWS[i][0].indexOf(c) !== -1) return ROWS[i][1];
    }
    return /[A-Za-z]/.test(c) ? c.toUpperCase() : '#';
  }

  return {
    normalize: normalize, searchTerms: searchTerms, toCSV: toCSV, parseCSV: parseCSV,
    validateTerms: validateTerms, mergeTerms: mergeTerms, termOfTheDay: termOfTheDay,
    initialOf: initialOf
  };
});
