(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else root.GlossaryLib = lib;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var KEYS = ['id', 'term', 'reading', 'fullName', 'category', 'summary',
    'description', 'analogy', 'example', 'related', 'level', 'aliases'];

  function kataToHira(s) {
    return s.replace(/[\u30a1-\u30f6]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }

  var SMALL_KANA = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ',
    'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ', 'ゕ': 'か', 'ゖ': 'け' };

  // 表記ゆれを吸収した比較用文字列。長音・中黒は無視し、小書きかなと「ゔ」を通常のかなに寄せる
  function normalize(s) {
    s = String(s == null ? '' : s).normalize('NFKC').toLowerCase();
    return kataToHira(s)
      .replace(/[\sー・\-ｰ･]/g, '')
      .replace(/ゔ/g, 'ぶ')
      .replace(/[ぁぃぅぇぉっゃゅょゎゕゖ]/g, function (c) { return SMALL_KANA[c]; });
  }

  var SEARCH_FIELDS = ['term', 'reading', 'fullName', 'aliases', 'summary', 'description'];

  // aliases（配列）も含め、比較用に正規化した文字列の一覧を返す
  function fieldValues(t, k) {
    var v = t[k];
    return (Array.isArray(v) ? v : [v]).map(normalize);
  }

  function matchesAny(t, keys, test) {
    return keys.some(function (k) { return fieldValues(t, k).some(test); });
  }

  function searchTerms(terms, query) {
    var q = normalize(query);
    if (!q) return terms.slice();
    var NAME_FIELDS = ['term', 'reading', 'aliases'];
    var exact = [], prefix = [], rest = [];
    terms.forEach(function (t) {
      if (!matchesAny(t, SEARCH_FIELDS, function (v) { return v.indexOf(q) !== -1; })) return;
      if (matchesAny(t, NAME_FIELDS, function (v) { return v === q; })) exact.push(t);
      else if (matchesAny(t, NAME_FIELDS, function (v) { return v.indexOf(q) === 0; })) prefix.push(t);
      else rest.push(t);
    });
    return exact.concat(prefix, rest);
  }

  // query と text の任意の部分文字列との最小編集距離（置換・挿入・削除を 1 として数える）
  function substringDistance(query, text) {
    var m = query.length, n = text.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = 0;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (query[i - 1] === text[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return Math.min.apply(null, prev);
  }

  function allowedDistance(len) {
    if (len <= 2) return -1;
    return len <= 5 ? 1 : 2;
  }

  // 綴り違い・聞き間違いを想定した「もしかして」候補。term/reading/fullName が対象
  function fuzzySearch(terms, query, limit) {
    var q = normalize(query);
    var max = allowedDistance(q.length);
    if (max < 0) return [];
    var scored = [];
    terms.forEach(function (t) {
      var best = Infinity, lenGap = Infinity;
      [t.term, t.reading, t.fullName].concat(t.aliases || []).forEach(function (f) {
        var s = normalize(f);
        if (s.length + max < q.length) return;
        var d = substringDistance(q, s), gap = Math.abs(s.length - q.length);
        if (d < best || (d === best && gap < lenGap)) { best = d; lenGap = gap; }
      });
      if (best <= max) scored.push({ t: t, d: best, gap: lenGap });
    });
    // 距離が同じなら、長さが近い（＝語全体が似ている）候補を先にする
    scored.sort(function (a, b) { return a.d - b.d || a.gap - b.gap; });
    return scored.slice(0, limit || 10).map(function (x) { return x.t; });
  }

  // ---------- 問題集 ----------
  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // 用語名・括弧内の名前・別の呼び方を「〇〇」に伏せる（答えが問題文に出てしまうのを防ぐ）
  function maskTermName(text, t) {
    var names = [str(t.term), str(t.term).replace(/[（(].*?[）)]/g, '')];
    str(t.term).replace(/[（(](.*?)[）)]/g, function (_, inner) { names.push(inner); return ''; });
    names = names.concat(t.aliases || []).map(function (n) { return n.trim(); })
      .filter(function (n) { return n.length >= 2; })
      .sort(function (a, b) { return b.length - a.length; });
    return names.reduce(function (acc, n) {
      var src = escapeRegExp(n);
      if (/^[\x20-\x7e]+$/.test(n)) src = '(?<![A-Za-z])' + src + '(?![A-Za-z])';
      return acc.replace(new RegExp(src, 'gi'), '〇〇');
    }, str(text));
  }

  // pool から最大 count 問の 4 択問題を作る。まちがいの選択肢は allTerms の同じ分野を優先する
  function buildQuiz(pool, allTerms, count, rng) {
    rng = rng || Math.random;
    if (allTerms.length < 4) return [];
    return shuffle(pool, rng).slice(0, count).map(function (answer) {
      var type = rng() < 0.5 ? 'summary-to-term' : 'term-to-summary';
      var textOf = type === 'summary-to-term'
        ? function (t) { return str(t.term); }
        : function (t) { return maskTermName(t.summary, t); };
      var others = allTerms.filter(function (t) { return t.id !== answer.id; });
      var same = shuffle(others.filter(function (t) { return t.category === answer.category; }), rng);
      var rest = shuffle(others.filter(function (t) { return t.category !== answer.category; }), rng);
      var picked = [answer], seen = {};
      seen[textOf(answer)] = true;
      same.concat(rest).forEach(function (t) {
        if (picked.length < 4 && !seen[textOf(t)]) { picked.push(t); seen[textOf(t)] = true; }
      });
      var choices = shuffle(picked, rng).map(function (t) { return { id: t.id, text: textOf(t) }; });
      return {
        type: type,
        termId: answer.id,
        prompt: type === 'summary-to-term' ? maskTermName(answer.summary, answer) : str(answer.term),
        choices: choices,
        answerIndex: choices.findIndex(function (c) { return c.id === answer.id; })
      };
    });
  }

  // ---------- ストーリー（用語をつなげた例文） ----------
  var STORY_MARK = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;

  // 本文の [[id]] / [[id|表示名]] を用語の区切りに分ける。存在しない id は普通の文字として残す
  function parseStory(text, termsById) {
    var out = [], last = 0, m;
    text = str(text);
    STORY_MARK.lastIndex = 0;
    while ((m = STORY_MARK.exec(text))) {
      if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
      var t = termsById[m[1]];
      if (t) out.push({ type: 'term', id: m[1], label: m[2] || t.term });
      else out.push({ type: 'text', text: m[2] || m[1] });
      last = STORY_MARK.lastIndex;
    }
    if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
    return out;
  }

  function storyTermIds(text) {
    var ids = [], m;
    STORY_MARK.lastIndex = 0;
    while ((m = STORY_MARK.exec(str(text)))) if (ids.indexOf(m[1]) === -1) ids.push(m[1]);
    return ids;
  }

  // 読み上げ用の文字列。用語の表示名に含まれる英字の名前は、その用語の読みがなに置き換える
  function speechText(segments, termsById) {
    return segments.map(function (s) {
      if (s.type !== 'term') return s.text;
      var t = termsById[s.id];
      var names = [str(t.term), str(t.term).replace(/[（(].*?[）)]/g, '')].concat(t.aliases || [])
        .map(normalize);
      return s.label.replace(/[A-Za-z][A-Za-z0-9.#+\/-]*/g, function (w) {
        return t.reading && names.indexOf(normalize(w)) !== -1 ? t.reading : w;
      });
    }).join('');
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
      o.aliases = o.aliases ? o.aliases.split('|').filter(Boolean) : [];
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
      t.aliases = (Array.isArray(r.aliases) ? r.aliases : [])
        .map(function (a) { return str(a).trim(); }).filter(Boolean);
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
    normalize: normalize, searchTerms: searchTerms, fuzzySearch: fuzzySearch, buildQuiz: buildQuiz,
    parseStory: parseStory, storyTermIds: storyTermIds, speechText: speechText, toCSV: toCSV, parseCSV: parseCSV,
    validateTerms: validateTerms, mergeTerms: mergeTerms, termOfTheDay: termOfTheDay,
    initialOf: initialOf
  };
});
