'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

test('worker pitfalls: no pinned version, guard word, Windows paths, no issue file in a subagent', () => {
  const w = read('agents/worker.md');
  assert.match(w, /A test never pins the current version to one value/);
  assert.match(w, /Write docs and test files with the Write tool/);
  assert.match(w, /fs\.realpathSync\.native/);
  assert.match(w, /`junction`/);
  assert.match(w, /subagent worktree has no `\.haku-issue\.md`/);
});

test('build: the brief carries criteria and scope, and repeats no standing worker rule', () => {
  const b = read('skills/build/SKILL.md');
  assert.match(b, /standing rules .* are in `agents\/worker\.md`/);
  assert.match(b, /write the acceptance criteria and the scope into the brief in full/);
});

test('build: CI watcher ends on the first result; merge wait is separate', () => {
  const b = read('skills/build/SKILL.md');
  assert.match(b, /ends as soon as every check has finished, pass or fail/);
  assert.match(b, /Waiting for the merge is a separate watcher started after CI passes/);
});

test('build: unexecuted data files may skip review with their own message', () => {
  const b = read('skills/build/SKILL.md');
  assert.match(b, /"리뷰 생략: 문서, 테스트, 실행되지 않는 데이터 파일만 바뀜"/);
});

test('plan and sniff: look for a built-in platform feature before designing', () => {
  for (const f of ['skills/plan/SKILL.md', 'skills/sniff/SKILL.md']) {
    const t = read(f);
    assert.match(t, /platform feature/, f);
    assert.match(t, /found \/ not found \/ could not check/, f);
    assert.match(t, /researcher/, f);
  }
});
