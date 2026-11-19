(function () {
  'use strict';

  var Lib = window.GlossaryLib;
  var App = window.GlossaryApp;
  var BEST_KEY = 'glossary.quizBest';
  var COUNTS = [10, 20];
  var LABELS = ['A', 'B', 'C', 'D'];
  var KIND_TEXT = {
    'summary-to-term': 'この説明にあてはまる用語はどれ？',
    'term-to-summary': 'この用語の説明として正しいものはどれ？'
  };

  var $ = function (id) { return document.getElementById(id); };
  var setup = { category: 'すべて', levels: [], count: 10 };
  var play = null; // { questions, index, correct, wrongIds, answered }

  // ---------- storage (always guarded) ----------
  function readBest() {
    try {
      var v = JSON.parse(localStorage.getItem(BEST_KEY));
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch (e) { return {}; }
  }
  function saveBest(category, correct, total) {
    var best = readBest();
    var pct = Math.round(correct / total * 100);
    if (!best[category] || pct > best[category]) {
      best[category] = pct;
      try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* 保存できなくても続行 */ }
    }
  }

  // ---------- helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function findTerm(id) {
    var all = App.getTerms();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function pool() {
    return App.getTerms().filter(function (t) {
      if (setup.category !== 'すべて' && t.category !== setup.category) return false;
      if (setup.levels.length && setup.levels.indexOf(t.level) === -1) return false;
      return true;
    });
  }
  function showPanel(name) {
    $('quiz-setup').hidden = name !== 'setup';
    $('quiz-play').hidden = name !== 'play';
    $('quiz-result').hidden = name !== 'result';
  }
  function toggleButton(label, isOn, onClick) {
    var b = el('button', null, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(isOn));
    b.addEventListener('click', onClick);
    return b;
  }
  function syncPressed(box, isOn) {
    Array.prototype.forEach.call(box.children, function (b) {
      b.setAttribute('aria-pressed', String(isOn(b.textContent)));
    });
  }

  // ---------- setup ----------
  function buildSetup() {
    var cats = $('quiz-cats');
    ['すべて'].concat(App.categories).forEach(function (c) {
      cats.appendChild(toggleButton(c, setup.category === c, function () {
        setup.category = c; renderSetup();
      }));
    });
    var levels = $('quiz-levels');
    [1, 2, 3].forEach(function (n) {
      levels.appendChild(toggleButton('★' + n, false, function () {
        var i = setup.levels.indexOf(n);
        if (i === -1) setup.levels.push(n); else setup.levels.splice(i, 1);
        renderSetup();
      }));
    });
    var counts = $('quiz-counts');
    COUNTS.forEach(function (n) {
      counts.appendChild(toggleButton(n + '問', setup.count === n, function () {
        setup.count = n; renderSetup();
      }));
    });
  }

  function renderSetup() {
    syncPressed($('quiz-cats'), function (k) { return k === setup.category; });
    syncPressed($('quiz-levels'), function (k) { return setup.levels.indexOf(Number(k.slice(1))) !== -1; });
    syncPressed($('quiz-counts'), function (k) { return k === setup.count + '問'; });
    var n = pool().length;
    var enough = n > 0 && App.getTerms().length >= 4;
    $('quiz-pool').textContent = enough
      ? '対象の用語：' + n + '語（' + Math.min(n, setup.count) + '問出題）'
      : '条件に合う用語がありません。分野や難易度を変えてください。';
    $('quiz-start').disabled = !enough;
    var best = readBest()[setup.category];
    $('quiz-best').textContent = best != null ? '「' + setup.category + '」のこれまでの最高正解率：' + best + '%' : '';
  }

  // ---------- play ----------
  function start(terms) {
    var questions = Lib.buildQuiz(terms, App.getTerms(), Math.min(terms.length, setup.count));
    if (!questions.length) { App.toast('問題を作れませんでした。条件を変えてください。', true); return; }
    play = { questions: questions, index: 0, correct: 0, wrongIds: [], answered: false, isReview: terms !== null && terms.isReview };
    showPanel('play');
    renderQuestion();
  }

  function renderQuestion() {
    var q = play.questions[play.index];
    play.answered = false;
    $('quiz-progress').textContent = (play.index + 1) + ' / ' + play.questions.length + ' 問目';
    $('quiz-score').textContent = '正解 ' + play.correct;
    $('quiz-kind').textContent = KIND_TEXT[q.type];
    $('quiz-prompt').textContent = q.prompt;
    $('quiz-prompt').className = 'quiz-prompt' + (q.type === 'term-to-summary' ? ' is-term' : '');
    var box = $('quiz-choices');
    box.textContent = '';
    q.choices.forEach(function (c, i) {
      var b = el('button', 'quiz-choice');
      b.type = 'button';
      b.appendChild(el('span', 'quiz-label', LABELS[i]));
      b.appendChild(el('span', 'quiz-text', c.text));
      b.addEventListener('click', function () { answer(i); });
      box.appendChild(b);
    });
    $('quiz-feedback').hidden = true;
    $('quiz-next').hidden = true;
    box.firstChild.focus();
  }

  function answer(i) {
    if (play.answered) return;
    play.answered = true;
    var q = play.questions[play.index];
    var ok = i === q.answerIndex;
    if (ok) play.correct++; else play.wrongIds.push(q.termId);
    Array.prototype.forEach.call($('quiz-choices').children, function (b, j) {
      b.disabled = true;
      if (j === q.answerIndex) { b.classList.add('is-correct'); b.setAttribute('aria-label', b.textContent + '（正解）'); }
      else if (j === i) { b.classList.add('is-wrong'); b.setAttribute('aria-label', b.textContent + '（あなたの回答）'); }
    });
    var t = findTerm(q.termId);
    $('quiz-judge').textContent = ok ? '正解です！' : '不正解… 正解は「' + t.term + '」です。';
    $('quiz-judge').className = 'quiz-judge ' + (ok ? 'ok' : 'ng');
    $('quiz-explain').textContent = t.term + '：' + t.description;
    $('quiz-analogy').textContent = t.analogy ? '例えるなら：' + t.analogy : '';
    $('quiz-feedback').hidden = false;
    $('quiz-score').textContent = '正解 ' + play.correct;
    var last = play.index === play.questions.length - 1;
    $('quiz-next').textContent = last ? '結果を見る' : '次へ';
    $('quiz-next').hidden = false;
    $('quiz-next').focus();
  }

  function next() {
    if (!play || !play.answered) return;
    if (play.index < play.questions.length - 1) { play.index++; renderQuestion(); }
    else showResult();
  }

  // ---------- result ----------
  function showResult() {
    var total = play.questions.length;
    var pct = Math.round(play.correct / total * 100);
    var msg = pct === 100 ? '全問正解です。すばらしい！' : pct >= 70 ? 'よくできました。' : 'まちがえた用語を見直してみましょう。';
    $('quiz-total').textContent = total + '問中 ' + play.correct + '問正解（' + pct + '%）。' + msg;
    if (!play.isReview) saveBest(setup.category, play.correct, total);

    var list = $('quiz-wrong');
    list.textContent = '';
    play.wrongIds.forEach(function (id) {
      var t = findTerm(id);
      if (!t) return;
      var li = el('li');
      var d = el('details');
      d.appendChild(el('summary', null, t.term + (t.reading ? '（' + t.reading + '）' : '')));
      d.appendChild(el('p', null, t.description));
      if (t.analogy) d.appendChild(el('p', 'note', '例えるなら：' + t.analogy));
      li.appendChild(d);
      list.appendChild(li);
    });
    $('quiz-wrong-wrap').hidden = !play.wrongIds.length;
    $('quiz-retry-wrong').hidden = !play.wrongIds.length;
    showPanel('result');
    $('quiz-total').setAttribute('tabindex', '-1');
    $('quiz-total').focus();
  }

  function retryWrong() {
    var terms = play.wrongIds.map(findTerm).filter(Boolean);
    terms.isReview = true;
    start(terms);
  }

  // ---------- wiring ----------
  function backToSetup() {
    play = null;
    renderSetup();
    showPanel('setup');
  }

  function bind() {
    $('quiz-start').addEventListener('click', function () { start(pool()); });
    $('quiz-next').addEventListener('click', next);
    $('quiz-quit').addEventListener('click', function () {
      if (!play || play.index === 0 && !play.answered || confirm('問題集を終了しますか？')) backToSetup();
    });
    $('quiz-again').addEventListener('click', function () { start(pool()); });
    $('quiz-retry-wrong').addEventListener('click', retryWrong);
    $('quiz-back').addEventListener('click', backToSetup);
    window.addEventListener('glossary:data', function () { if (!play) renderSetup(); });
    window.addEventListener('glossary:mode', function (e) {
      if (e.detail !== 'quiz') return;
      if (!play) renderSetup();
      $('quiz-title').focus();
    });
  }

  buildSetup();
  bind();
  renderSetup();
  showPanel('setup');
})();
