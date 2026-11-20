(function () {
  'use strict';

  var Lib = window.GlossaryLib;
  var App = window.GlossaryApp;
  var Speech = window.GlossarySpeech;
  var RATE_KEY = 'glossary.speechRate';

  var $ = function (id) { return document.getElementById(id); };
  var stories = null;      // data/stories.json（初回表示時に読み込む）
  var loading = null;
  var current = null;      // 表示中のストーリー
  var readingIndex = 0;    // 読み上げ中の段落

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function termsById() {
    var map = {};
    App.getTerms().forEach(function (t) { map[t.id] = t; });
    return map;
  }
  function load() {
    if (stories) return Promise.resolve(stories);
    if (!loading) {
      loading = fetch('data/stories.json').then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) { stories = Array.isArray(data) ? data : []; return stories; });
    }
    return loading;
  }
  function storyIdFromHash() {
    var m = /^#story=(.+)$/.exec(location.hash);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  // ---------- 一覧 ----------
  function renderList() {
    var list = $('story-list');
    list.textContent = '';
    stories.forEach(function (s) {
      var count = new Set([].concat.apply([], s.paragraphs.map(Lib.storyTermIds))).size;
      var li = el('li');
      var a = el('a', 'story-card');
      a.href = '#story=' + encodeURIComponent(s.id);
      a.appendChild(el('span', 'story-card-title', s.title));
      a.appendChild(el('span', 'story-card-summary', s.summary));
      a.appendChild(el('span', 'story-card-meta', '用語 ' + count + '語'));
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  // ---------- 本文 ----------
  function renderStory(s) {
    var byId = termsById();
    current = s;
    readingIndex = 0;
    $('story-title').textContent = s.title;
    $('story-summary').textContent = s.summary;

    var body = $('story-body');
    body.textContent = '';
    s.paragraphs.forEach(function (p, i) {
      var para = el('p', 'story-para');
      para.setAttribute('data-i', String(i));
      Lib.parseStory(p, byId).forEach(function (seg) {
        if (seg.type === 'text') { para.appendChild(document.createTextNode(seg.text)); return; }
        var b = el('button', 'story-term', seg.label);
        b.type = 'button';
        b.title = byId[seg.id].term + ' の解説を開く';
        b.addEventListener('click', function () { App.showTerm(seg.id); });
        para.appendChild(b);
      });
      body.appendChild(para);
    });

    var terms = $('story-terms');
    terms.textContent = '';
    var ids = [];
    s.paragraphs.forEach(function (p) {
      Lib.storyTermIds(p).forEach(function (id) { if (ids.indexOf(id) === -1 && byId[id]) ids.push(id); });
    });
    ids.forEach(function (id) {
      var b = el('button', null, byId[id].term);
      b.type = 'button';
      b.addEventListener('click', function () { App.showTerm(id); });
      terms.appendChild(b);
    });

    var idx = stories.indexOf(s);
    var next = stories[(idx + 1) % stories.length];
    $('story-next').textContent = '次のお話：' + next.title + ' →';
    $('story-next').onclick = function () { location.hash = 'story=' + encodeURIComponent(next.id); };
    updatePlayer('idle');
  }

  // ---------- 読み上げ ----------
  function updatePlayer(state) {
    $('story-play').textContent = state === 'playing' ? '⏸ 一時停止' : state === 'paused' ? '▶ 再開' : '▶ 読み上げ';
    $('story-stop').disabled = state === 'idle';
    if (state === 'idle') highlight(-1);
  }
  function highlight(i) {
    Array.prototype.forEach.call($('story-body').children, function (p) {
      p.classList.toggle('is-reading', Number(p.getAttribute('data-i')) === i);
    });
    var cur = $('story-body').children[i];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function play(from) {
    var byId = termsById();
    var items = current.paragraphs.map(function (p, i) {
      return { text: Lib.speechText(Lib.parseStory(p, byId), byId), index: i };
    }).slice(from || 0);
    if (!from) items.unshift({ text: current.title + '。', index: 0 });
    Speech.speak(items, {
      owner: 'story',
      rate: Number($('story-rate').value),
      onItem: function (i) { readingIndex = i; highlight(i); },
      onState: updatePlayer
    });
  }
  function togglePlay() {
    var st = Speech.getOwner() === 'story' ? Speech.getState() : 'idle';
    if (st === 'playing') Speech.pause();
    else if (st === 'paused') Speech.resume();
    else play(0);
  }
  function changeRate() {
    try { localStorage.setItem(RATE_KEY, $('story-rate').value); } catch (e) { /* 保存できなくても続行 */ }
    if (Speech.getOwner() === 'story') play(readingIndex); // 読んでいる段落から新しい速さで読み直す
  }

  // ---------- 画面切り替え ----------
  function show() {
    var id = storyIdFromHash();
    load().then(function () {
      if (!App.getTerms().length) return; // 用語データの読み込み後に glossary:data で再表示する
      var s = id && stories.filter(function (x) { return x.id === id; })[0];
      $('story-list-panel').hidden = !!s;
      $('story-detail').hidden = !s;
      if (s) {
        if (!current || current.id !== s.id) { Speech.stop(); renderStory(s); }
        $('story-title').focus();
      } else {
        Speech.stop();
        current = null;
        renderList();
        if (id) App.toast('指定されたストーリーが見つかりませんでした', true);
      }
    }).catch(function () {
      App.toast('ストーリーのデータを読み込めませんでした。', true);
    });
  }

  function init() {
    $('story-player').hidden = !Speech.supported;
    try {
      var saved = localStorage.getItem(RATE_KEY);
      if (saved && $('story-rate').querySelector('option[value="' + saved + '"]')) $('story-rate').value = saved;
    } catch (e) { /* 既定の速さを使う */ }
    $('story-play').addEventListener('click', togglePlay);
    $('story-stop').addEventListener('click', function () { Speech.stop(); });
    $('story-rate').addEventListener('change', changeRate);
    window.addEventListener('glossary:mode', function (e) {
      if (e.detail === 'story') show(); else current = null;
    });
    window.addEventListener('glossary:data', function () {
      if (!$('story-view').hidden) show();
    });
    if (!$('story-view').hidden) show();
  }

  init();
})();
