const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../lib.js');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const terms = read('terms.json');
const stories = read('stories.json');
const ids = new Set(terms.map((t) => t.id));

test('ストーリー: id が一意で、必須項目がそろっている', () => {
  assert.equal(new Set(stories.map((s) => s.id)).size, stories.length);
  stories.forEach((s) => {
    assert.match(s.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, s.id);
    assert.ok(s.title && s.summary, s.id);
    assert.ok(Array.isArray(s.paragraphs) && s.paragraphs.length >= 3, s.id);
  });
});

test('ストーリー: 本文の [[id]] はすべて実在する用語', () => {
  stories.forEach((s) => s.paragraphs.forEach((p) => L.storyTermIds(p).forEach((id) => {
    assert.ok(ids.has(id), s.id + ' -> ' + id);
  })));
});

test('ストーリー: 1 本あたり 5 語以上の用語をつなげている', () => {
  stories.forEach((s) => {
    const used = new Set(s.paragraphs.flatMap((p) => L.storyTermIds(p)));
    assert.ok(used.size >= 5, s.id + ': ' + used.size);
  });
});

test('ストーリー: 閉じ忘れなどで [[ や ]] が本文に残らない', () => {
  const byId = Object.fromEntries(terms.map((t) => [t.id, t]));
  stories.forEach((s) => s.paragraphs.forEach((p) => {
    const plain = L.parseStory(p, byId).map((x) => x.type === 'term' ? x.label : x.text).join('');
    assert.ok(!/\[\[|\]\]/.test(plain), s.id + ': ' + p.slice(0, 20));
  }));
});
