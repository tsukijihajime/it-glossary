const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib.js');

const T = (o) => Object.assign({
  id: 'x', term: 'X', reading: '', fullName: '', category: 'c',
  summary: '', description: '', analogy: '', example: '', related: [], level: 1, aliases: [],
}, o);

test('normalize', () => {
  assert.equal(L.normalize('ＡＰＩ'), L.normalize('api'));
  assert.equal(L.normalize('エーピーアイ'), 'えぴあい');
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
    T({ id: 'a', term: 'API', description: 'a,b "q"\nline2', related: ['b', 'c'], level: 2, aliases: ['えーぴーあい', 'I/F'] }),
    T({ id: 'b', term: 'B', related: [], level: 3, _local: true }),
  ];
  const csv = L.toCSV(x);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(!csv.includes('_local'));
  assert.equal(csv.split('\n')[0].replace('\uFEFF', ''),
    'id,term,reading,fullName,category,summary,description,analogy,example,related,level,aliases');
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

test('normalize: 長音・中黒・小書きかな・ヴ の表記ゆれを吸収', () => {
  assert.equal(L.normalize('サーバ'), L.normalize('サーバー'));
  assert.equal(L.normalize('インタフェース'), L.normalize('インターフェース'));
  assert.equal(L.normalize('データ・AI'), L.normalize('データAI'));
  assert.equal(L.normalize('キャッシュ'), L.normalize('きやつしゆ'));
  assert.equal(L.normalize('ヴィ'), L.normalize('ぶい'));
});

const FUZZY = [
  { id: 'cloud', term: 'クラウド', reading: 'くらうど', fullName: 'Cloud Computing' },
  { id: 'escalation', term: 'エスカレーション', reading: 'えすかれーしょん', fullName: 'Escalation' },
  { id: 'v-model', term: 'V字モデル', reading: 'ぶいじもでる', fullName: 'V-Model' },
  { id: 'api', term: 'API', reading: 'えーぴーあい', fullName: 'Application Programming Interface' },
  { id: 'ut', term: 'UT（単体テスト）', reading: 'ゆーてぃー', fullName: 'Unit Test' },
  { id: 'st', term: 'ST（総合テスト）', reading: 'えすてぃー', fullName: 'System Test' }
];
const ids = (r) => r.map((t) => t.id);

test('fuzzySearch: 1 文字違いでヒット', () => {
  assert.equal(ids(L.fuzzySearch(FUZZY, 'くらうと'))[0], 'cloud');
  assert.equal(ids(L.fuzzySearch(FUZZY, 'えすかれーじょん'))[0], 'escalation');
  assert.equal(ids(L.fuzzySearch(FUZZY, 'ぶいしもでる'))[0], 'v-model');
});

test('fuzzySearch: 長い正式名称の一部の綴り違いでヒット', () => {
  assert.deepEqual(ids(L.fuzzySearch(FUZZY, 'aplication')), ['api']);
});

test('fuzzySearch: 2 文字以下はあいまい検索しない', () => {
  assert.deepEqual(L.fuzzySearch(FUZZY, 'ot'), []);
  assert.deepEqual(L.fuzzySearch(FUZZY, ''), []);
});

test('fuzzySearch: 違いが許容数を超えるとヒットしない、件数上限あり', () => {
  assert.deepEqual(L.fuzzySearch(FUZZY, 'まったく無関係'), []);
  assert.ok(L.fuzzySearch(FUZZY, 'くらうと', 1).length <= 1);
});

test('searchTerms: 読みの前方一致も優先する', () => {
  const T = [
    { id: 'wan', term: 'WAN', reading: 'わん', description: '通信エラーの原因になることもあります' },
    { id: 'error', term: 'ERROR（エラー）', reading: 'えらー', description: '処理が失敗したことを表します' }
  ];
  assert.equal(L.searchTerms(T, 'エラー')[0].id, 'error');
});

test('parseCSV: aliases 列がない古い CSV は空配列', () => {
  const r = L.parseCSV('id,term,category\na,A,c\n');
  assert.deepEqual(r[0].aliases, []);
});

test('validateTerms: aliases を文字列配列に整え、未指定は空配列', () => {
  const r = L.validateTerms([
    { id: 'a', term: 'A', category: 'c', aliases: [' ぽっく ', '', 'PoC'] },
    { id: 'b', term: 'B', category: 'c' }
  ]).valid;
  assert.deepEqual(r[0].aliases, ['ぽっく', 'PoC']);
  assert.deepEqual(r[1].aliases, []);
});

const AL = [
  { id: 'kickoff', term: 'キックオフ', reading: 'きっくおふ', aliases: [] },
  { id: 'poc', term: 'PoC', reading: 'ぴーおーしー', description: '概念実証です', aliases: ['ぽっく'] },
  { id: 'k8s', term: 'Kubernetes', reading: 'くーばねてぃす', aliases: ['くばねてす', 'k8s'] }
];

test('searchTerms: aliases でヒットし、前方一致として上位に並ぶ', () => {
  assert.deepEqual(L.searchTerms(AL, 'ぽっく').map((t) => t.id), ['poc']);
  assert.equal(L.searchTerms(AL, 'k8s')[0].id, 'k8s');
});

test('fuzzySearch: aliases も対象', () => {
  assert.equal(L.fuzzySearch(AL, 'ぽっぐ')[0].id, 'poc');
});

test('searchTerms: 完全一致を前方一致より先に並べる', () => {
  const T2 = [
    { id: 'javascript', term: 'JavaScript', reading: 'じゃばすくりぷと', aliases: [] },
    { id: 'java', term: 'Java', reading: 'じゃば', aliases: [] }
  ];
  assert.equal(L.searchTerms(T2, 'ジャバ')[0].id, 'java');
});

test('fuzzySearch: 同じ距離なら長さの近い候補を先に並べる', () => {
  const T3 = [
    { id: 'debug', term: 'デバッグ', reading: 'でばっぐ', aliases: [] },
    { id: 'poc', term: 'PoC', reading: 'ぴーおーしー', aliases: ['ぽっく'] }
  ];
  assert.equal(L.fuzzySearch(T3, 'ぽっぐ')[0].id, 'poc');
});
