'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'docs', 'self-improvement.md');
const exists = fs.existsSync(FILE);
const text = exists ? fs.readFileSync(FILE, 'utf8') : '';

// Split at the two level-two headings; each language section runs to the next one.
function section(title) {
  const m = new RegExp('^## ' + title + '\\s*$', 'm').exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

const LANGS = {
  ko: { title: '한국어', links: ['수집', '분류', '제안', '이슈 등록', '반영', '반영 뒤 원본에 알리기'], verdicts: ['된다', '부분적이다', '아니다'], verdictLine: /^\*\*판정:.*$/m },
  en: { title: 'English', links: ['Collect', 'Sort', 'Propose', 'Register', 'Apply', 'Notify the source'], verdicts: ['Yes', 'Partly', 'No'], verdictLine: /^\*\*Verdict:.*$/m },
};

test('the report exists with both language headings', () => {
  assert.ok(exists, 'docs/self-improvement.md is missing');
  assert.match(text, /^## 한국어\s*$/m);
  assert.match(text, /^## English\s*$/m);
  assert.ok(text.indexOf('## 한국어') < text.indexOf('## English'), 'Korean section must come first');
});

for (const [code, lang] of Object.entries(LANGS)) {
  test(`${code}: names the six loop links`, () => {
    const body = section(lang.title);
    assert.ok(body, `section ${lang.title} missing`);
    const lower = body.toLowerCase();
    for (const link of lang.links) {
      assert.ok(lower.includes(link.toLowerCase()), `${code}: link "${link}" is not named`);
    }
  });

  test(`${code}: has at least 3 case references with full addresses`, () => {
    const body = section(lang.title) || '';
    const refs = new Set(body.match(/https:\/\/github\.com\/dongqdev\/haku\/(?:issues|pull)\/\d+/g) || []);
    assert.ok(refs.size >= 3, `${code}: only ${refs.size} distinct addresses`);
  });

  test(`${code}: the verdict line has exactly one value`, () => {
    const body = section(lang.title) || '';
    const line = lang.verdictLine.exec(body);
    assert.ok(line, `${code}: no verdict line`);
    const found = lang.verdicts.filter(v => new RegExp('(?:^|[^A-Za-z])' + v + '(?![A-Za-z])').test(line[0].replace(/^\*\*(판정|Verdict):/, '')));
    assert.deepStrictEqual(found.length, 1, `${code}: verdict values found: ${found.join(', ')}`);
  });
}

test('no TODO, no placeholder, no emoji', () => {
  assert.ok(exists);
  assert.doesNotMatch(text, /TODO/i);
  assert.doesNotMatch(text, /<[A-Za-z][A-Za-z0-9 _-]*>/, 'placeholder like <name>');
  const ranges = [[0x1F000, 0x1FAFF], [0x2600, 0x27BF], [0x2B00, 0x2BFF], [0xFE00, 0xFE0F], [0x200D, 0x200D]];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    for (const [a, b] of ranges) assert.ok(cp < a || cp > b, `emoji-range character U+${cp.toString(16)}`);
  }
});
