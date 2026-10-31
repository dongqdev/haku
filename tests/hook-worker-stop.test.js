'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'hooks', 'worker-stop.js');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-ws-'));
const run = input => spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8', env: { ...process.env, HAKU_WORKER_STOP_DIR: DIR } });
let n = 0;
const ev = o => JSON.stringify({ agent_id: 'a' + (n++), agent_type: 'worker', stop_hook_active: false, last_assistant_message: 'done.', ...o });

test('a worker that ends with no pull request and no summary is sent back once (exit 2, reason on stderr)', () => {
  const r = run(ev({}));
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /pull request/);
  assert.strictEqual(run(ev({ agent_type: 'haku:worker' })).status, 2);
});

test('stop_hook_active is checked first: a second stop always passes', () => {
  assert.strictEqual(run(ev({ stop_hook_active: true })).status, 0);
});

test('a report with a pull request address, a summary, a question or a block passes', () => {
  for (const m of ['https://github.com/o/r/pull/12', 'PR opened', '요약: 끝', 'Summary: x', 'blocked on a permission', '어떻게 할까요?'])
    assert.strictEqual(run(ev({ last_assistant_message: m })).status, 0, m);
});

test('not a worker, or nothing to judge, passes', () => {
  for (const o of [{ agent_type: 'reviewer' }, { agent_type: 'myworker' }, { agent_type: undefined }, { last_assistant_message: undefined }, { last_assistant_message: 5 }])
    assert.strictEqual(run(ev(o)).status, 0, JSON.stringify(o));
});

test('broken input, empty input and an oversized input pass', () => {
  for (const i of ['', 'not json', 'null', '[]', '"x"', 'x'.repeat(1100 * 1024)]) assert.strictEqual(run(i).status, 0, i.slice(0, 10));
});

test('without stop_hook_active in the input it blocks an agent once, then passes; no id means no block', () => {
  const one = JSON.stringify({ agent_id: 'same', agent_type: 'worker', last_assistant_message: 'done.' });
  assert.strictEqual(run(one).status, 2);
  assert.strictEqual(run(one).status, 0);
  assert.strictEqual(run(JSON.stringify({ agent_type: 'worker', last_assistant_message: 'done.' })).status, 0);
});
