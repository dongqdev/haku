'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FILE = process.env.IDEAS_DOC_FILE || path.join(__dirname, '..', 'docs', 'ideas-from-others.md');
const exists = fs.existsSync(FILE);
const text = exists ? fs.readFileSync(FILE, 'utf8') : '';

const LANGS = {
  ko: {
    title: '한국어', heading: /^### 후보 (\d+)\. (.+)$/gm,
    fields: ['주제', '무엇인지', '출처', '이미 있는가', '비용', '위험', '추천'],
    themes: ['자가개선 고리', '안전망과 훅', '평가와 시험', '계획과 요구 명료화', '리뷰와 검증', '기억과 교훈'],
    rec: ['넣기', '보류', '버리기'], cost: ['작음', '중간', '큼'], have: ['있음', '일부', '없음'],
    limits: /^### 한계\s*$/m, suspicious: /^### 의심스러운 글\s*$/m,
    toc: /목차/, next: '### 후보 ',
  },
  en: {
    title: 'English', heading: /^### Candidate (\d+)\. (.+)$/gm,
    fields: ['Theme', 'What it is', 'Sources', 'Already in haku', 'Cost', 'Risk', 'Recommendation'],
    themes: ['Self-improvement loop', 'Safety net and hooks', 'Evaluation and testing', 'Planning and clarifying requirements', 'Review and verification', 'Memory and lessons'],
    rec: ['adopt', 'hold', 'drop'], cost: ['small', 'medium', 'large'], have: ['yes', 'partly', 'no'],
    limits: /^### Limits\s*$/m, suspicious: /^### Suspicious text\s*$/m,
    toc: /Table of contents/, next: '### Candidate ',
  },
};

// A section runs from its level-two heading to the next level-two heading.
function section(title) {
  const m = new RegExp('^## ' + title + '\\s*$', 'm').exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

// Candidate blocks: from a candidate heading to the next level-three heading.
function candidates(lang) {
  const body = section(lang.title) || '';
  const out = [];
  const re = new RegExp(lang.heading.source, 'gm');
  let m;
  while ((m = re.exec(body))) {
    const rest = body.slice(m.index + m[0].length);
    const next = /^### /m.exec(rest);
    out.push({ n: Number(m[1]), name: m[2], block: next ? rest.slice(0, next.index) : rest });
  }
  return out;
}

// The value of a field: the first word after the label.
function field(block, label) {
  const m = new RegExp('^- \\*\\*' + label + '\\*\\*:\\s*(.*)$', 'm').exec(block);
  return m ? m[1] : null;
}
const firstWord = v => (v || '').split(/[\s.,]/)[0];

test('the document exists with Korean first and English second', () => {
  assert.ok(exists, 'docs/ideas-from-others.md is missing');
  assert.match(text, /^## 한국어\s*$/m);
  assert.match(text, /^## English\s*$/m);
  assert.ok(text.indexOf('## 한국어') < text.indexOf('## English'), 'Korean section must come first');
});

test('both languages list the same number of candidates, at least 8', () => {
  const ko = candidates(LANGS.ko), en = candidates(LANGS.en);
  assert.ok(ko.length >= 8, `Korean has ${ko.length}`);
  assert.strictEqual(ko.length, en.length);
});

for (const [code, lang] of Object.entries(LANGS)) {
  test(`${code}: headings are numbered 1, 2, 3 ... without gaps`, () => {
    const list = candidates(lang);
    assert.ok(list.length > 0);
    list.forEach((c, i) => assert.strictEqual(c.n, i + 1, `heading ${i + 1} is numbered ${c.n}`));
  });

  test(`${code}: every candidate has a name and every field label`, () => {
    for (const c of candidates(lang)) {
      assert.ok(c.name.trim().length > 0, `candidate ${c.n} has no name`);
      for (const label of lang.fields) {
        assert.ok(field(c.block, label) !== null, `candidate ${c.n}: field "${label}" missing`);
        assert.ok(field(c.block, label).length > 0 || label === '출처' || label === 'Sources', `candidate ${c.n}: field "${label}" is empty`);
      }
    }
  });

  test(`${code}: theme, recommendation, cost and "already in haku" use only the allowed words`, () => {
    for (const c of candidates(lang)) {
      const theme = field(c.block, lang.fields[0]);
      assert.ok(lang.themes.includes(theme), `candidate ${c.n}: theme "${theme}"`);
      const rec = firstWord(field(c.block, lang.fields[6]));
      assert.ok(lang.rec.includes(rec), `candidate ${c.n}: recommendation "${rec}"`);
      const cost = firstWord(field(c.block, lang.fields[4]));
      assert.ok(lang.cost.includes(cost), `candidate ${c.n}: cost "${cost}"`);
      const have = firstWord(field(c.block, lang.fields[3]));
      assert.ok(lang.have.includes(have), `candidate ${c.n}: already-in-haku "${have}"`);
    }
  });

  test(`${code}: every candidate has a source address, the date read and a quote`, () => {
    for (const c of candidates(lang)) {
      assert.match(c.block, /https:\/\/[^\s)]+/, `candidate ${c.n}: no https address`);
      assert.ok(c.block.includes('2026-10-30'), `candidate ${c.n}: no date read`);
      const lines = c.block.split('\n').filter(l => /^\s+- https:\/\//.test(l));
      assert.ok(lines.length > 0, `candidate ${c.n}: no source line`);
      for (const l of lines) {
        assert.ok(l.includes('2026-10-30'), `candidate ${c.n}: source without the date read: ${l.slice(0, 60)}`);
        assert.match(l, /"[^"]{8,}"/, `candidate ${c.n}: source without a quote: ${l.slice(0, 60)}`);
      }
    }
  });

  test(`${code}: the "already in haku" evidence cites a repository path`, () => {
    for (const c of candidates(lang)) {
      const v = field(c.block, lang.fields[3]);
      assert.match(v, /`[A-Za-z0-9_.\/-]+\.(?:md|js|json|yml)`|`[a-z]+\/`/, `candidate ${c.n}: no path in the evidence`);
    }
  });

  test(`${code}: the table of contents lists every candidate number with its name`, () => {
    const body = section(lang.title) || '';
    assert.match(body, lang.toc);
    const tocStart = body.search(lang.toc);
    const tocEnd = body.indexOf(lang.next, tocStart);
    const toc = body.slice(tocStart, tocEnd);
    for (const c of candidates(lang)) {
      assert.ok(new RegExp('^' + c.n + '\\. ' + c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' - ', 'm').test(toc), `candidate ${c.n} is not in the table of contents`);
    }
    const lines = toc.split('\n').filter(l => /^\d+\. /.test(l));
    assert.strictEqual(lines.length, candidates(lang).length);
  });

  test(`${code}: the table of contents shows the same recommendation as the candidate`, () => {
    const body = section(lang.title) || '';
    for (const c of candidates(lang)) {
      const rec = firstWord(field(c.block, lang.fields[6]));
      const line = new RegExp('^' + c.n + '\\. .* - (\\S+)$', 'm').exec(body);
      assert.ok(line && line[1] === rec, `candidate ${c.n}: table of contents says ${line && line[1]}, block says ${rec}`);
    }
  });

  test(`${code}: has a limits section and a suspicious-text section`, () => {
    const body = section(lang.title) || '';
    const lim = lang.limits.exec(body), sus = lang.suspicious.exec(body);
    assert.ok(lim, 'limits section missing');
    assert.ok(sus, 'suspicious-text section missing');
    assert.ok(sus.index > lim.index);
    assert.ok(body.slice(lim.index, sus.index).trim().split('\n').length >= 4, 'limits section is too short');
    assert.ok(body.slice(sus.index).trim().split('\n').length >= 2, 'suspicious-text section is empty');
  });
}

test('the sources name at least 5 distinct projects', () => {
  const pairs = new Set();
  for (const m of text.matchAll(/https:\/\/(?:github\.com|raw\.githubusercontent\.com)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g)) {
    pairs.add((m[1] + '/' + m[2]).toLowerCase());
  }
  assert.ok(pairs.size >= 5, `only ${pairs.size} distinct projects: ${[...pairs].join(', ')}`);
});

test('no TODO, no <name> placeholder, no emoji', () => {
  assert.ok(exists);
  assert.doesNotMatch(text, /TODO/i);
  assert.doesNotMatch(text, /<[A-Za-z][A-Za-z0-9 _-]*>/, 'placeholder like <name>');
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const emoji = (cp >= 0x1F000 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0x2B00 && cp <= 0x2BFF) || cp === 0xFE0F || cp === 0x200D;
    assert.ok(!emoji, `emoji or pictograph U+${cp.toString(16)}`);
  }
});
