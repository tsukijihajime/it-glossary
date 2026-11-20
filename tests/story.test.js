const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../lib.js');

const TERMS = {
  dns: { id: 'dns', term: 'DNS', reading: 'でぃーえぬえす', aliases: [] },
  ut: { id: 'ut', term: 'UT（単体テスト）', reading: 'ゆーてぃー', aliases: ['単体テスト'] },
  browser: { id: 'browser', term: 'ブラウザ', reading: 'ぶらうざ', aliases: [] },
  ec2: { id: 'ec2', term: 'EC2', reading: 'いーしーつー', aliases: ['インスタンス'] }
};

test('parseStory: [[id]] と [[id|表示名]] を用語として切り出す', () => {
  const seg = L.parseStory('まず[[browser]]が[[dns]]に問い合わせ、[[ut|単体テスト（UT）]]をします。', TERMS);
  assert.deepEqual(seg, [
    { type: 'text', text: 'まず' },
    { type: 'term', id: 'browser', label: 'ブラウザ' },
    { type: 'text', text: 'が' },
    { type: 'term', id: 'dns', label: 'DNS' },
    { type: 'text', text: 'に問い合わせ、' },
    { type: 'term', id: 'ut', label: '単体テスト（UT）' },
    { type: 'text', text: 'をします。' }
  ]);
});

test('parseStory: 存在しない id は表示名（なければ id）を普通の文字として残す', () => {
  assert.deepEqual(L.parseStory('[[nope]]と[[nope2|ラベル]]', TERMS), [
    { type: 'text', text: 'nope' }, { type: 'text', text: 'と' }, { type: 'text', text: 'ラベル' }
  ]);
});

test('storyTermIds: 本文中の用語 id を重複なく出現順に返す', () => {
  assert.deepEqual(L.storyTermIds('[[dns]]と[[browser]]と[[dns|DNS]]'), ['dns', 'browser']);
});

test('speechText: 英字の用語名は読みがなに置き換え、かなの用語はそのまま読む', () => {
  const seg = L.parseStory('[[browser]]で[[ec2]]と[[ut|単体テスト（UT）]]を確認。', TERMS);
  assert.equal(L.speechText(seg, TERMS), 'ブラウザでいーしーつーと単体テスト（ゆーてぃー）を確認。');
});
