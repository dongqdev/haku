'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { verify } = require('../scripts/lib/verify');

function sh(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

function write(repo, file, content) {
  const full = path.join(repo, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

// profile "unit" runs a node one-liner that prints the TAP-style count line.
function makeRepo(profileOverrides = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-verify-'));
  sh(repo, 'init', '-q', '-b', 'main');
  const profile = {
    cmd: ['node', 'run-tests.js'],
    countPattern: 'tests (\\d+)',
    minTests: 1,
    ...profileOverrides
  };
  write(repo, '.ecc-harness/verify.json', JSON.stringify({ profiles: { unit: profile } }));
  write(repo, 'run-tests.js', "console.log('tests 3'); process.exit(0);");
  write(repo, 'tests/a.test.js', 'one\ntwo\nthree\n');
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-q', '-m', 'base');
  sh(repo, 'checkout', '-q', '-b', 'task/1-x');
  return repo;
}

function commit(repo, msg = 'work') {
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-q', '-m', msg);
}

const run = repo => verify({ profile: 'unit', cwd: repo, base: 'main' });

test('exit 0 with enough tests passes', () => {
  const repo = makeRepo();
  write(repo, 'src.js', 'x');
  commit(repo);
  const r = run(repo);
  assert.strictEqual(r.status, 'pass');
  assert.strictEqual(r.testCount, 3);
});

test('non-zero exit fails', () => {
  const repo = makeRepo();
  write(repo, 'run-tests.js', "console.log('tests 3'); process.exit(1);");
  commit(repo);
  // run-tests.js is not a test file; the base-branch config still points at it, so the
  // failing script on the branch is what runs.
  const r = run(repo);
  assert.strictEqual(r.status, 'fail');
  assert.match(r.reasons.join(), /exited 1/);
});

test('exit 0 but zero tests ran fails', () => {
  const repo = makeRepo();
  write(repo, 'run-tests.js', "console.log('tests 0'); process.exit(0);");
  commit(repo);
  const r = run(repo);
  assert.strictEqual(r.status, 'fail');
  assert.match(r.reasons.join(), /only 0 test/);
});

test('deleting a test file fails even when the command exits 0', () => {
  const repo = makeRepo();
  fs.rmSync(path.join(repo, 'tests/a.test.js'));
  commit(repo);
  const r = run(repo);
  assert.strictEqual(r.status, 'fail');
  assert.deepStrictEqual(r.tamper.deleted, ['tests/a.test.js']);
});

test('a test file that shrinks asks for review instead of passing', () => {
  const repo = makeRepo();
  write(repo, 'tests/a.test.js', 'one\n');
  commit(repo);
  const r = run(repo);
  assert.strictEqual(r.status, 'review');
  assert.deepStrictEqual(r.tamper.weakened, ['tests/a.test.js']);
});

test('the command comes from the base branch, not the worker branch', () => {
  const repo = makeRepo();
  // The worker rewrites the config so its "tests" are `true`; it must be ignored.
  write(repo, '.ecc-harness/verify.json', JSON.stringify({ profiles: { unit: { cmd: ['node', '-e', ''] } } }));
  write(repo, 'run-tests.js', "console.log('tests 0'); process.exit(0);");
  commit(repo);
  const r = run(repo);
  assert.strictEqual(r.status, 'fail');
  assert.match(r.reasons.join(), /only 0 test/);
});

test('unknown profile is a hard error', () => {
  const repo = makeRepo();
  assert.throws(() => verify({ profile: 'nope', cwd: repo, base: 'main' }), /unknown verify profile/);
});

test('minTests without countPattern is a config error', () => {
  const repo = makeRepo({ countPattern: undefined });
  assert.throws(() => run(repo), /countPattern/);
});

test('a real `npm test` profile runs and its test count is read (covers the Windows .cmd shim)', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-verify-npm-'));
  sh(repo, 'init', '-q', '-b', 'main');
  write(repo, 'package.json', JSON.stringify({ name: 'p', version: '0.0.0', scripts: { test: 'node --test tests/a.test.js' } }));
  write(repo, 'tests/a.test.js', "const t = require('node:test'); t('one', () => {}); t('two', () => {});\n");
  write(repo, '.ecc-harness/verify.json', JSON.stringify({
    profiles: { unit: { cmd: ['npm', 'test'], countPattern: 'tests (\\d+)', minTests: 2 } }
  }));
  sh(repo, 'add', '-A');
  sh(repo, 'commit', '-q', '-m', 'base');
  const r = verify({ profile: 'unit', cwd: repo, base: 'main' });
  assert.strictEqual(r.status, 'pass', JSON.stringify(r));
  assert.strictEqual(r.testCount, 2);
});
