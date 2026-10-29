'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const cli = path.join(__dirname, '..', 'scripts', 'issues.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('pr-body prints the whole skeleton with the closing line', () => {
  const r = run('pr-body', '--issue', '12');
  assert.strictEqual(r.status, 0);
  for (const n of ['요약', '이유', '변경 내용', '테스트', '위험과 영향']) assert.match(r.stdout, new RegExp(`## ${n}`));
  assert.match(r.stdout, /Closes #12/);
});

test('pr-check exits 1 on the untouched skeleton and 0 on a complete body', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-prcheck-'));
  const file = path.join(dir, 'body.md');
  fs.writeFileSync(file, run('pr-body', '--issue', '3').stdout);
  const bad = run('pr-check', '--issue', '3', '--file', file);
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /비어 있습니다/);

  const sections = ['요약', '이유', '변경 내용', '테스트', '위험과 영향']
    .map(n => `## ${n}\n이 항목에는 한글로 쓴 충분한 설명이 들어 있습니다.\n`).join('\n');
  fs.writeFileSync(file, `${sections}\n## 닫히는 이슈\nCloses #3\n`);
  const good = run('pr-check', '--issue', '3', '--file', file);
  assert.strictEqual(good.status, 0, good.stdout + good.stderr);
});

test('pr-check without --file is an error', () => {
  const r = run('pr-check', '--issue', '3');
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /--file/);
});

test('pr-check needs a number for --pr, and --pr alone is enough input', () => {
  const r = run('pr-check', '--issue', '3', '--pr', 'abc');
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /pull request number/);
});
