const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib.js');

// 再現可能な乱数（mulberry32）
function seeded(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mk = (id, term, category, summary, extra) => Object.assign(
  { id, term, reading: '', category, summary, aliases: [] }, extra || {});
const ALL = [
  mk('api', 'API', 'dev', 'APIは機能を呼び出すための決まりごとです。', { aliases: ['えーぴーあい'] }),
  mk('git', 'Git', 'dev', '変更履歴を管理する仕組みです。'),
  mk('ide', 'IDE', 'dev', '開発をまとめて行えるソフトです。'),
  mk('bug', 'バグ', 'dev', 'プログラムの誤りです。'),
  mk('sdk', 'SDK', 'dev', '開発に必要な道具一式です。'),
  mk('ut', 'UT（単体テスト）', 'pm', '単体テストは部品ごとのテストです。'),
  mk('wbs', 'WBS', 'pm', '作業を細かく分けた一覧です。'),
  mk('pm', 'PM', 'pm', 'プロジェクトの責任者です。'),
  mk('qcd', 'QCD', 'pm', '品質・コスト・納期です。'),
  mk('lan', 'LAN', 'net', '建物内のネットワークです。')
];

test('buildQuiz: 指定数の問題を、用語の重複なく作る', () => {
  const q = L.buildQuiz(ALL, ALL, 5, seeded(1));
  assert.equal(q.length, 5);
  assert.equal(new Set(q.map((x) => x.termId)).size, 5);
});

test('buildQuiz: 出題元が問題数より少なければ出題元の数だけ作る', () => {
  const pool = ALL.filter((t) => t.category === 'pm');
  assert.equal(L.buildQuiz(pool, ALL, 10, seeded(2)).length, 4);
});

test('buildQuiz: 選択肢は 4 つで重複せず、正解を 1 つ含む', () => {
  L.buildQuiz(ALL, ALL, 10, seeded(3)).forEach((q) => {
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices.map((c) => c.id)).size, 4);
    assert.equal(q.choices[q.answerIndex].id, q.termId);
    assert.ok(['summary-to-term', 'term-to-summary'].includes(q.type));
  });
});

test('buildQuiz: まちがいの選択肢は、足りる限り同じ分野から選ぶ', () => {
  L.buildQuiz(ALL.filter((t) => t.category === 'dev'), ALL, 5, seeded(4)).forEach((q) => {
    q.choices.forEach((c) => assert.equal(ALL.find((t) => t.id === c.id).category, 'dev'));
  });
});

test('buildQuiz: 同じ分野が足りなければ他の分野から補う', () => {
  const q = L.buildQuiz([ALL[9]], ALL, 1, seeded(5))[0];
  assert.equal(q.choices.length, 4);
  assert.equal(q.termId, 'lan');
});

test('buildQuiz: 説明→用語の問題文と、用語→説明の選択肢では用語名を伏せる', () => {
  for (let s = 0; s < 30; s++) {
    L.buildQuiz([ALL[0], ALL[5]], ALL, 2, seeded(s)).forEach((q) => {
      const texts = q.type === 'summary-to-term' ? [q.prompt] : q.choices.map((c) => c.text);
      texts.forEach((t) => {
        assert.ok(!/API|単体テスト|えーぴーあい/.test(t), t);
      });
    });
  }
});

test('buildQuiz: 同じ乱数なら同じ問題になる', () => {
  assert.deepEqual(L.buildQuiz(ALL, ALL, 5, seeded(9)), L.buildQuiz(ALL, ALL, 5, seeded(9)));
});

test('buildQuiz: 全体が 4 語未満なら問題を作らない', () => {
  assert.deepEqual(L.buildQuiz(ALL.slice(0, 3), ALL.slice(0, 3), 3, seeded(1)), []);
});
