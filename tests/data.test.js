const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { validateTerms } = require('../lib.js');

const CATEGORIES = ['ネットワーク', 'セキュリティ', 'クラウド', '開発・プログラミング', 'データ・AI', 'ハードウェア・組込み', 'プロジェクト・業務', 'よく聞く略語', '医療機器・内視鏡'];
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'terms.json'), 'utf8'));

test('全件 validateTerms を通過する', () => {
  const { valid, skipped } = validateTerms(raw);
  assert.strictEqual(skipped, 0);
  assert.strictEqual(valid.length, raw.length);
});
test('id が重複しない', () => {
  const ids = raw.map(t => t.id);
  assert.strictEqual(new Set(ids).size, ids.length);
});
test('id は小文字 ASCII の kebab-case', () => {
  raw.forEach(t => assert.match(t.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, t.id));
});
test('category が 9 種のいずれか', () => {
  raw.forEach(t => assert.ok(CATEGORIES.includes(t.category), t.id + ': ' + t.category));
});
test('related の id がすべて存在し自己参照しない', () => {
  const ids = new Set(raw.map(t => t.id));
  raw.forEach(t => t.related.forEach(r => {
    assert.ok(ids.has(r), t.id + ' -> ' + r);
    assert.notStrictEqual(r, t.id);
  }));
});
test('件数が 120 以上', () => { assert.ok(raw.length >= 120); });
test('各分野 10 件以上', () => {
  CATEGORIES.forEach(c => assert.ok(raw.filter(t => t.category === c).length >= 10, c));
});
test('必須項目が空でない', () => {
  raw.forEach(t => ['term', 'reading', 'summary', 'description', 'analogy', 'example'].forEach(k =>
    assert.ok(t[k] && t[k].length > 0, t.id + '.' + k)));
});
test('description は 2〜4 文', () => {
  raw.forEach(t => {
    const n = (t.description.match(/。/g) || []).length;
    assert.ok(n >= 2 && n <= 4, t.id + ': ' + n);
  });
});
test('level は 1〜3', () => {
  raw.forEach(t => assert.ok([1, 2, 3].includes(t.level), t.id));
});
test('reading はひらがな（長音可）のみ', () => {
  raw.forEach(t => assert.match(t.reading, /^[ぁ-んー]+$/, t.id));
});
test('example は「」で囲まれる', () => {
  raw.forEach(t => assert.match(t.example, /^「.+」$/, t.id));
});

test('aliases は空でない文字列の配列で、重複しない', () => {
  raw.forEach(t => {
    assert.ok(Array.isArray(t.aliases), t.id + ': aliases が配列ではない');
    t.aliases.forEach(a => assert.ok(typeof a === 'string' && a.trim() === a && a, t.id + ': ' + a));
    assert.strictEqual(new Set(t.aliases).size, t.aliases.length, t.id + ': aliases 重複');
  });
});
