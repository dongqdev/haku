'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ko = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const en = fs.readFileSync(path.join(root, 'README.en.md'), 'utf8');

const headings = text => text.split('\n').filter(l => /^#{1,6}\s/.test(l)).map(l => l.match(/^#+/)[0]);
const codeBlocks = text => [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m => m[0].split('\n')[0] + '\n' + m[1].split('\n')
  // comments and the column of explanations are in each language; the commands and values are not
  .map(l => l.replace(/\s+#.*$/, '').replace(/^(\S+)\s{2,}\S.*$/, '$1').trimEnd()).join('\n'));

test('README.md is Korean and README.en.md is English, and each links to the other', () => {
  assert.ok((ko.match(/[가-힣]/g) || []).length > 500, 'README.md should be written in Korean');
  assert.ok((en.match(/[가-힣]/g) || []).length < 60, 'README.en.md should be English (a few Korean terms are quoted)');
  assert.match(ko, /href="README\.en\.md"/);
  assert.match(en, /href="README\.md"/);
});

test('both READMEs have the same sections in the same order', () => {
  assert.deepStrictEqual(headings(ko), headings(en), 'the number and the levels of the headings must match');
  assert.ok(headings(en).length >= 15);
});

test('both READMEs carry the same commands and files: every code block and every inline command matches', () => {
  assert.deepStrictEqual(codeBlocks(ko), codeBlocks(en));
  const inline = text => [...new Set([...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1]).filter(s => /^(\/haku:|issues\.js|node |\.haku|\.git|\.claude-plugin|scripts\/|skills\/|HAKU_|"[a-zA-Z]+": )/.test(s)))].sort();
  assert.deepStrictEqual(inline(ko), inline(en));
});
