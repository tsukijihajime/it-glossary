(function () {
  'use strict';

  // ブラウザ標準の読み上げ（Web Speech API）の薄いラッパー。使えない環境では supported=false
  var synth = window.speechSynthesis;
  var supported = !!(synth && window.SpeechSynthesisUtterance);
  var PREFERRED = /Natural|Online|Nanami|Keita|Google|Kyoko|O-ren|Haruka/i;

  var queue = [];
  var pos = 0;
  var opts = {};
  var state = 'idle'; // idle | playing | paused
  var session = 0;

  function pickVoice() {
    var ja = synth.getVoices().filter(function (v) { return /^ja/i.test(v.lang); });
    return ja.filter(function (v) { return PREFERRED.test(v.name); })[0] || ja[0] || null;
  }

  // 長い文は途中で止まるブラウザがあるため、句点ごとに分けて順に読む
  function split(items) {
    var out = [];
    items.forEach(function (it) {
      (String(it.text).match(/[^。！？!?]+[。！？!?]?/g) || []).forEach(function (s) {
        if (s.trim()) out.push({ text: s.trim(), index: it.index });
      });
    });
    return out;
  }

  function setState(s) {
    state = s;
    if (opts.onState) opts.onState(s);
  }

  function speakNext(id) {
    if (id !== session) return;
    if (pos >= queue.length) { setState('idle'); if (opts.onEnd) opts.onEnd(); return; }
    var item = queue[pos];
    var u = new SpeechSynthesisUtterance(item.text);
    u.lang = 'ja-JP';
    u.rate = opts.rate || 1;
    var v = pickVoice();
    if (v) u.voice = v;
    u.onstart = function () { if (id === session && opts.onItem) opts.onItem(item.index); };
    u.onend = function () { if (id === session) { pos++; speakNext(id); } };
    u.onerror = function (e) {
      if (id !== session || e.error === 'interrupted' || e.error === 'canceled') return;
      stop();
    };
    synth.speak(u);
  }

  function speak(items, options) {
    if (!supported) return;
    stop();
    opts = options || {};
    queue = split(items);
    pos = 0;
    session++;
    setState('playing');
    speakNext(session);
  }

  function pause() { if (state === 'playing') { synth.pause(); setState('paused'); } }
  function resume() { if (state === 'paused') { synth.resume(); setState('playing'); } }

  function stop() {
    if (!supported) return;
    session++;
    synth.cancel();
    var cb = opts.onState;
    queue = []; pos = 0;
    state = 'idle';
    if (cb) cb('idle');
  }

  if (supported && synth.onvoiceschanged !== undefined) synth.onvoiceschanged = function () {};

  window.GlossarySpeech = {
    supported: supported,
    speak: speak, pause: pause, resume: resume, stop: stop,
    getState: function () { return state; },
    // 今の読み上げを始めた画面（speak の options.owner）。止まっていれば null
    getOwner: function () { return state === 'idle' ? null : (opts.owner || null); }
  };
})();
