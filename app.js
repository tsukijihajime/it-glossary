(function () {
  'use strict';

  var Lib = window.GlossaryLib;
  var CATEGORIES = ['ネットワーク', 'セキュリティ', 'クラウド', '開発・プログラミング',
    'データ・AI', 'ハードウェア・組込み', 'プロジェクト・業務', 'よく聞く略語'];
  var INDEX_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat('あかさたなはまやらわ'.split(''), ['#']);
  var FAV_KEY = 'glossary.favorites';
  var LOCAL_KEY = 'glossary.localTerms';

  var state = { base: [], local: [], all: [], favs: [], query: '', category: 'すべて', levels: [], favOnly: false, initial: '', view: [] };
  var $ = function (id) { return document.getElementById(id); };
  var currentId = null;
  var toastTimer = null;

  // ---------- storage (always guarded) ----------
  function readJSON(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  // ---------- helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function stars(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
  function findTerm(id) {
    for (var i = 0; i < state.all.length; i++) if (state.all[i].id === id) return state.all[i];
    return null;
  }
  function isFav(id) { return state.favs.indexOf(id) !== -1; }

  function toast(msg, isError) {
    var t = $('toast');
    var dlg = $('detail');
    (dlg.open ? dlg : document.body).appendChild(t);
    t.textContent = msg;
    t.className = 'toast' + (isError ? ' error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4000);
  }

  function showMessage(msg) {
    var m = $('message');
    m.textContent = msg;
    m.hidden = !msg;
  }

  // ---------- data ----------
  function recompute() {
    state.all = Lib.mergeTerms(state.base, state.local);
  }

  function toggleFav(id, btn) {
    var i = state.favs.indexOf(id);
    if (i === -1) state.favs.push(id); else state.favs.splice(i, 1);
    writeJSON(FAV_KEY, state.favs);
    if (currentId === id) renderDetail(findTerm(id));
    if (btn && !state.favOnly) {
      btn.textContent = isFav(id) ? '★' : '☆';
      btn.setAttribute('aria-pressed', String(isFav(id)));
      return;
    }
    var pos = state.view.findIndex(function (t) { return t.id === id; });
    render();
    if (btn) {
      var favs = $('grid').querySelectorAll('.fav-btn');
      var next = favs[Math.min(pos, favs.length - 1)];
      (next || $('fav-only')).focus();
    }
  }

  // ---------- filtering / rendering ----------
  function applyFilters() {
    var list = Lib.searchTerms(state.all, state.query);
    return list.filter(function (t) {
      if (state.category !== 'すべて' && t.category !== state.category) return false;
      if (state.levels.length && state.levels.indexOf(t.level) === -1) return false;
      if (state.favOnly && !isFav(t.id)) return false;
      if (state.initial && Lib.initialOf(t) !== state.initial) return false;
      return true;
    });
  }

  function renderCard(t) {
    var li = el('li', 'card');
    var open = el('button', 'card-open');
    open.type = 'button';
    open.appendChild(el('span', 'term', t.term));
    if (t.reading) open.appendChild(el('span', 'reading', t.reading)).style.display = 'block';
    var meta = el('span', 'card-meta');
    meta.appendChild(el('span', 'chip', t.category));
    var lv = el('span', 'level', stars(t.level));
    lv.setAttribute('role', 'img');
    lv.setAttribute('aria-label', '難易度 ' + t.level);
    meta.appendChild(lv);
    if (t._local) meta.appendChild(el('span', 'chip local', 'ローカル'));
    open.appendChild(meta);
    open.appendChild(el('span', 'summary', t.summary));
    open.addEventListener('click', function () { openDetail(t.id); });
    li.appendChild(open);

    var fav = el('button', 'fav-btn', isFav(t.id) ? '★' : '☆');
    fav.type = 'button';
    fav.setAttribute('aria-pressed', String(isFav(t.id)));
    fav.setAttribute('aria-label', 'お気に入り');
    fav.title = t.term + ' をお気に入りに追加/解除';
    fav.addEventListener('click', function () { toggleFav(t.id, fav); });
    li.appendChild(fav);
    return li;
  }

  function render() {
    state.view = applyFilters();
    var grid = $('grid');
    grid.textContent = '';
    state.view.forEach(function (t) { grid.appendChild(renderCard(t)); });
    var count = $('count');
    if (!state.all.length) count.textContent = '';
    else if (!state.view.length) count.textContent = '該当する用語が見つかりませんでした。検索ワードや絞り込みを変えてみてください。';
    else count.textContent = state.view.length + '件の用語';
    renderToday();
  }

  function renderToday() {
    var t = Lib.termOfTheDay(state.all, new Date());
    var box = $('today');
    if (!t) { box.hidden = true; return; }
    box.hidden = false;
    var b = $('today-btn');
    b.textContent = '';
    b.appendChild(el('span', 't', t.term));
    b.appendChild(el('span', 's', t.summary));
    b.onclick = function () { openDetail(t.id); };
  }

  function syncPressed(box, isOn) {
    Array.prototype.forEach.call(box.children, function (b) {
      b.setAttribute('aria-pressed', String(isOn(b.getAttribute('data-key'))));
    });
  }

  function pressedButton(label, pressed, onClick) {
    var b = el('button', null, label);
    b.type = 'button';
    b.setAttribute('data-key', label);
    b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', onClick);
    return b;
  }

  function renderTabs() {
    var box = $('tabs');
    if (box.children.length) { syncPressed(box, function (k) { return k === state.category; }); return; }
    ['すべて'].concat(CATEGORIES).forEach(function (c) {
      box.appendChild(pressedButton(c, state.category === c, function () {
        state.category = c; renderTabs(); render();
      }));
    });
  }

  function renderLevels() {
    var box = $('levels');
    if (box.children.length) { syncPressed(box, function (k) { return state.levels.indexOf(Number(k.slice(1))) !== -1; }); return; }
    [1, 2, 3].forEach(function (n) {
      box.appendChild(pressedButton('★' + n, state.levels.indexOf(n) !== -1, function () {
        var i = state.levels.indexOf(n);
        if (i === -1) state.levels.push(n); else state.levels.splice(i, 1);
        renderLevels(); render();
      }));
    });
  }

  function renderIndex() {
    var box = $('index-bar');
    if (box.children.length) { syncPressed(box, function (k) { return k === state.initial; }); return; }
    INDEX_KEYS.forEach(function (k) {
      box.appendChild(pressedButton(k, state.initial === k, function () {
        state.initial = state.initial === k ? '' : k;
        renderIndex(); render();
      }));
    });
  }

  // ---------- detail dialog ----------
  function renderDetail(t) {
    if (!t) return;
    $('d-term').textContent = t.term;
    $('d-reading').textContent = t.reading;
    $('d-full').textContent = t.fullName;
    $('d-cat').textContent = t.category;
    $('d-level').textContent = '難易度 ' + stars(t.level);
    $('d-desc').textContent = t.description;
    $('d-analogy').textContent = t.analogy;
    $('d-example').textContent = t.example;
    $('d-analogy-wrap').hidden = !t.analogy;
    $('d-example-wrap').hidden = !t.example;
    var rel = $('d-related');
    rel.textContent = '';
    (t.related || []).forEach(function (id) {
      var r = findTerm(id);
      if (!r) return;
      var b = el('button', null, r.term);
      b.type = 'button';
      b.addEventListener('click', function () { openDetail(r.id); });
      rel.appendChild(b);
    });
    $('d-related-wrap').hidden = !rel.children.length;
    $('d-fav').textContent = isFav(t.id) ? '★ お気に入り済み' : '☆ お気に入りに追加';
    $('d-delete').hidden = !t._local;
  }

  function openDetail(id, fromHash) {
    var t = findTerm(id);
    if (!t) return;
    currentId = id;
    renderDetail(t);
    var dlg = $('detail');
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
    if (!fromHash && location.hash !== '#term=' + encodeURIComponent(id)) {
      location.hash = 'term=' + encodeURIComponent(id);
    }
  }

  function closeDetail() {
    currentId = null;
    if (/^#term=/.test(location.hash)) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function handleHash() {
    var m = /^#term=(.+)$/.exec(location.hash);
    var dlg = $('detail');
    if (m) {
      var id;
      try { id = decodeURIComponent(m[1]); } catch (e) { id = m[1]; }
      if (id !== currentId) openDetail(id, true);
    } else if (dlg.open) {
      currentId = null;
      dlg.close();
    }
  }

  function copyURL() {
    var url = location.href;
    var done = function () { toast('URLをコピーしました'); };
    var fail = function () { toast('コピーできませんでした。アドレスバーのURLをご利用ください。', true); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fail);
    } else fail();
  }

  function deleteLocalTerm() {
    if (!currentId) return;
    var id = currentId;
    if (!confirm('この用語をローカルから削除します。よろしいですか？')) return;
    state.local = state.local.filter(function (t) { return t.id !== id; });
    writeJSON(LOCAL_KEY, state.local);
    recompute();
    $('detail').close();
    render();
    toast('削除しました');
  }

  // ---------- import / export ----------
  function handleImport(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { toast('ファイルを読み込めませんでした。', true); };
    reader.onload = function () {
      var raw;
      try {
        var text = String(reader.result);
        if (/\.csv$/i.test(file.name)) raw = Lib.parseCSV(text);
        else {
          raw = JSON.parse(text.replace(/^﻿/, ''));
          if (!Array.isArray(raw)) throw new Error('not array');
        }
      } catch (e) {
        toast('ファイルの形式が正しくありません。既存のデータは変更していません。', true);
        return;
      }
      var res = Lib.validateTerms(raw);
      if (res.valid.length) {
        var map = {};
        res.valid.forEach(function (t) { map[t.id] = t; });
        var merged = state.local.filter(function (t) { return !map[t.id]; }).concat(res.valid);
        if (!writeJSON(LOCAL_KEY, merged)) {
          toast('このブラウザでは保存できませんでした。', true);
          return;
        }
        state.local = merged;
        recompute();
        render();
      }
      if (res.valid.length) toast(res.valid.length + '件取り込みました（' + res.skipped + '件スキップ）');
      else toast('取り込める用語がありませんでした（' + res.skipped + '件スキップ）', true);
    };
    reader.readAsText(file, 'utf-8');
  }

  function stripLocal(list) {
    return list.map(function (t) {
      var c = Object.assign({}, t);
      delete c._local;
      return c;
    });
  }

  function dateStamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function doExport(kind) {
    var list = stripLocal(kind.indexOf('all') === 0 ? state.all : state.view);
    var base = 'it-glossary-' + dateStamp() + (kind.indexOf('view') === 0 ? '-view' : '');
    if (/json$/.test(kind)) download(base + '.json', JSON.stringify(list, null, 2), 'application/json');
    else download(base + '.csv', Lib.toCSV(list), 'text/csv;charset=utf-8');
  }

  function clearLocal() {
    if (!state.local.length) { toast('ローカル追加分はありません'); return; }
    if (!confirm('ローカルに追加した用語をすべて削除します。元に戻せません。よろしいですか？')) return;
    state.local = [];
    writeJSON(LOCAL_KEY, []);
    recompute();
    render();
    toast('ローカル追加分を削除しました');
  }

  // ---------- init ----------
  function bind() {
    var timer;
    $('search').addEventListener('input', function (e) {
      clearTimeout(timer);
      var v = e.target.value;
      timer = setTimeout(function () { state.query = v; render(); }, 150);
    });
    $('fav-only').addEventListener('change', function (e) { state.favOnly = e.target.checked; render(); });
    $('detail').addEventListener('close', closeDetail);
    $('detail').addEventListener('click', function (e) { if (e.target === $('detail')) $('detail').close(); });
    $('d-close').addEventListener('click', function () { $('detail').close(); });
    $('d-fav').addEventListener('click', function () { if (currentId) toggleFav(currentId); });
    $('d-copy').addEventListener('click', copyURL);
    $('d-delete').addEventListener('click', deleteLocalTerm);
    $('import-file').addEventListener('change', function (e) {
      handleImport(e.target.files[0]);
      e.target.value = '';
    });
    $('clear-local').addEventListener('click', clearLocal);
    Array.prototype.forEach.call(document.querySelectorAll('[data-export]'), function (b) {
      b.addEventListener('click', function () { doExport(b.getAttribute('data-export')); });
    });
    window.addEventListener('hashchange', handleHash);
  }

  function init() {
    state.favs = readJSON(FAV_KEY);
    var local = Lib.validateTerms(readJSON(LOCAL_KEY));
    state.local = local.valid;
    renderTabs();
    renderLevels();
    renderIndex();
    bind();
    fetch('data/terms.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      state.base = Lib.validateTerms(data).valid;
      recompute();
      render();
      handleHash();
    }).catch(function () {
      showMessage('用語データを読み込めませんでした。index.html をファイルとして直接開いている場合は、Webサーバー経由（またはGitHub Pages）で開いてください。');
      recompute();
      render();
    });
  }

  init();
})();
