const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib.js');

const T = (o) => Object.assign({
  id: 'x', term: 'X', reading: '', fullName: '', category: 'c',
  summary: '', description: '', analogy: '', example: '', related: [], level: 1,
}, o);

test('normalize', () => {
  assert.equal(L.normalize('ＡＰＩ'), L.normalize('api'));
  assert.equal(L.normalize('エーピーアイ'), 'えーぴーあい');
  assert.equal(L.normalize(' A P I\u3000'), 'api');
});

test('searchTerms: 半角カナ・前方一致優先', () => {
  const terms = [
    T({ id: 'a', term: 'オンプレクラウド', reading: 'おんぷれくらうど' }),
    T({ id: 'b', term: 'クラウド', reading: 'くらうど' }),
  ];
  const r = L.searchTerms(terms, 'ｸﾗｳﾄﾞ');
  assert.deepEqual(r.map((t) => t.id), ['b', 'a']);
  assert.equal(L.searchTerms(terms, '').length, 2);
  assert.equal(L.searchTerms(terms, 'zzz').length, 0);
});

test('toCSV/parseCSV round trip', () => {
  const x = [
    T({ id: 'a', term: 'API', description: 'a,b "q"\nline2', related: ['b', 'c'], level: 2 }),
    T({ id: 'b', term: 'B', related: [], level: 3, _local: true }),
  ];
  const csv = L.toCSV(x);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(!csv.includes('_local'));
  assert.equal(csv.split('\n')[0].replace('\uFEFF', ''),
    'id,term,reading,fullName,category,summary,description,analogy,example,related,level');
  const back = L.parseCSV(csv);
  assert.deepEqual(back, x.map((t) => { const c = { ...t }; delete c._local; return c; }));
});

test('parseCSV: CRLF', () => {
  const r = L.parseCSV('id,term,category,level,related\r\na,A,c,2,x|y\r\nb,B,c,,\r\n');
  assert.equal(r.length, 2);
  assert.deepEqual(r[0].related, ['x', 'y']);
  assert.equal(r[0].level, 2);
  assert.deepEqual(r[1].related, []);
});

test('validateTerms', () => {
  const r = L.validateTerms([{ id: 'a', term: 'A', category: 'ネットワーク' }, { term: 'no id' }]);
  assert.equal(r.valid.length, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.valid[0].level, 1);
  const lv = L.validateTerms([
    { id: 'a', term: 'A', category: 'c', level: 9 },
    { id: 'b', term: 'B', category: 'c', level: 0 },
    { id: 'c', term: 'C', category: 'c', level: 'x' },
  ]).valid.map((t) => t.level);
  assert.deepEqual(lv, [3, 1, 1]);
});

test('mergeTerms', () => {
  const base = [T({ id: 'a', term: 'A' }), T({ id: 'b', term: 'B' })];
  const local = [T({ id: 'b', term: 'B2' }), T({ id: 'c', term: 'C' })];
  const m = L.mergeTerms(base, local);
  assert.deepEqual(m.map((t) => t.term), ['A', 'B2', 'C']);
  assert.equal(m[0]._local, undefined);
  assert.equal(m[1]._local, true);
  assert.equal(m[2]._local, true);
});

test('termOfTheDay', () => {
  const terms = [T({ id: 'a' }), T({ id: 'b' }), T({ id: 'c' })];
  const d = new Date(2026, 10, 18); // 20261118
  assert.equal(L.termOfTheDay(terms, d), terms[20261118 % 3]);
  assert.equal(L.termOfTheDay([], d), null);
});

test('initialOf', () => {
  assert.equal(L.initialOf({ reading: 'くらうど' }), 'か');
  assert.equal(L.initialOf({ term: 'API', reading: 'えーぴーあい' }), 'A');
  assert.equal(L.initialOf({ reading: 'ぱけっと' }), 'は');
  assert.equal(L.initialOf({ reading: 'がぞう' }), 'か');
  assert.equal(L.initialOf({ reading: 'ゃ' }), 'や');
  assert.equal(L.initialOf({ reading: 'ゔ' }), 'あ');
  assert.equal(L.initialOf({ reading: 'ー' }), '#');
  assert.equal(L.initialOf({ term: '5G' }), '#');
  assert.equal(L.initialOf({ reading: 'カタカナ' }), 'か');
});

test('mergeTerms: local の重複 id は 1 件だけ出力し、後勝ち', () => {
  const base = [T({ id: 'a', term: 'A' })];
  const m = L.mergeTerms(base, [T({ id: 'x', term: 'X1' }), T({ id: 'x', term: 'X2' })]);
  assert.deepEqual(m.map((t) => t.id), ['a', 'x']);
  assert.equal(m[1].term, 'X2');
});

test('validateTerms: 文字列を trim し、空白のみの必須項目はスキップ', () => {
  const r = L.validateTerms([
    { id: 'dns ', term: ' DNS ', category: ' ネットワーク ', reading: ' でぃーえぬえす ' },
    { id: '  ', term: 'X', category: 'ネットワーク' },
    { id: 'y', term: '  ', category: 'ネットワーク' },
    { id: 'z', term: 'Z', category: '  ' },
  ]);
  assert.equal(r.valid.length, 1);
  assert.equal(r.skipped, 3);
  assert.equal(r.valid[0].id, 'dns');
  assert.equal(r.valid[0].term, 'DNS');
  assert.equal(r.valid[0].category, 'ネットワーク');
  assert.equal(r.valid[0].reading, 'でぃーえぬえす');
});
