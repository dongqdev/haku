'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'haku-corr-'));

function fakeRepo() {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.haku'));
  fs.writeFileSync(path.join(dir, '.haku', 'config.json'), '{}');
  return dir;
}

// Runs `issues.js corrections ...` of the given scripts folder.
function run(scripts, args, { data, home, cwd } = {}) {
  const env = { ...process.env };
  delete env.CLAUDE_PLUGIN_DATA;
  if (data) env.CLAUDE_PLUGIN_DATA = data;
  if (home) { env.HOME = home; env.USERPROFILE = home; }
  return spawnSync(process.execPath, [path.join(scripts, 'issues.js'), 'corrections', ...args], { cwd: cwd || os.tmpdir(), env, encoding: 'utf8' });
}
const file = data => path.join(data, 'corrections.jsonl');

// Every case of the acceptance list against one copy of scripts/; returns the broken expectations.
function failures(scripts) {
  const bad = [];
  const expect = (name, ok) => { if (!ok) bad.push(name); };
  const data = tmp();
  const add = (text, o) => run(scripts, ['add', '--text', text], { data, ...o });

  let r = add('use the plain word, not the long one');
  expect('save: exit 0', r.status === 0);
  r = run(scripts, ['list'], { data });
  expect('list shows it', r.status === 0 && r.stdout.includes('use the plain word'));

  expect('300 chars ok', add('a '.repeat(150).trim().padEnd(300, 'b')).status === 0);
  r = add('x'.repeat(10) + ' ' + 'y '.repeat(145) + 'zzzzzz');
  expect('301 chars rejected', r.status !== 0 && !fs.readFileSync(file(data), 'utf8').includes('zzzzzz'));
  const count = fs.readFileSync(file(data), 'utf8').trim().split('\n').length;
  expect('two entries kept', count === 2);

  const secrets = ['ghp_', 'sk-', 'AKIA', 'Bearer '].map((p, i) => [
    p + ['abcdefghijklmnopqrstuvwx', 'abcdefghijklmnopqrstuvwx', 'ABCDEFGHIJKLMNOP', 'abcdefghijklmnop1234'][i]]);
  secrets.push(['password' + '=' + 'hunter22xx'], ['0123456789abcdef'.repeat(3)]);
  for (const [s] of secrets) {
    r = add(`please never do this ${s} again`);
    expect(`secret rejected: ${s.slice(0, 4)}`, r.status !== 0 && !(r.stdout + r.stderr).includes(s) && !fs.readFileSync(file(data), 'utf8').includes(s));
    expect(`secret reason named: ${s.slice(0, 4)}`, /looks like/.test(r.stderr));
  }
  const personal = '/ho' + 'me/' + 'someperson' + '/proj';
  r = add(`it edited ${personal} by mistake`);
  expect('personal path rejected', r.status !== 0 && /personal path/.test(r.stderr) && !(r.stdout + r.stderr).includes('someperson'));
  expect('personal path not stored', !fs.readFileSync(file(data), 'utf8').includes('someperson'));
  expect('still two entries', fs.readFileSync(file(data), 'utf8').trim().split('\n').length === 2);

  // 30 days
  const old = new Date(Date.now() - 31 * 86400000).toISOString();
  const fresh = new Date(Date.now() - 29 * 86400000).toISOString();
  fs.writeFileSync(file(data), JSON.stringify({ time: old, text: 'ancient lesson' }) + '\n' + JSON.stringify({ time: fresh, text: 'recent lesson' }) + '\n');
  r = run(scripts, ['list'], { data });
  expect('old ignored by list', !r.stdout.includes('ancient') && r.stdout.includes('recent'));
  add('a new sentence here');
  const body = fs.readFileSync(file(data), 'utf8');
  expect('old removed on write', !body.includes('ancient') && body.includes('recent') && body.includes('a new sentence'));

  r = run(scripts, ['clear'], { data });
  expect('clear deletes file', r.status === 0 && !fs.existsSync(file(data)));

  // inside the repo: refused, also through a symlink
  const repo = fakeRepo();
  const inside = path.join(repo, 'data');
  r = add('fine sentence', { data: inside, cwd: repo });
  expect('inside repo refused', r.status !== 0 && !fs.existsSync(inside));
  const link = path.join(tmp(), 'link');
  fs.symlinkSync(repo, link);
  r = add('fine sentence', { data: path.join(link, 'viaLink'), cwd: repo });
  expect('symlink into repo refused', r.status !== 0 && !fs.existsSync(path.join(repo, 'viaLink')));
  expect('repo stays empty', fs.readdirSync(repo).join() === '.haku');

  // default location under HOME
  const home = tmp();
  r = run(scripts, ['add', '--text', 'home default sentence'], { home });
  expect('home default', r.status === 0 && fs.existsSync(path.join(home, '.haku', 'corrections.jsonl')));
  return bad;
}

test('corrections: all cases pass on the real code', () => {
  assert.deepStrictEqual(failures(path.join(root, 'scripts')), []);
});

function mutant(rel, from, to) {
  const dir = tmp();
  fs.cpSync(path.join(root, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  const f = path.join(dir, 'scripts', 'lib', rel);
  const before = fs.readFileSync(f, 'utf8');
  assert.ok(before.includes(from), `mutation anchor missing: ${from}`);
  fs.writeFileSync(f, before.replace(from, to));
  return path.join(dir, 'scripts');
}
const C = 'corrections.js';
test('mutation: no length limit is caught', () => {
  assert.ok(failures(mutant(C, '> MAX_CHARS) return', '> 99999) return')).length > 0);
});
test('mutation: skipping the secret check is caught', () => {
  assert.ok(failures(mutant(C, 'for (const [re, what] of SECRETS) if (re.test(text))', 'for (const [re, what] of []) if (re.test(text))')).length > 0);
});
test('mutation: skipping the personal path check is caught', () => {
  assert.ok(failures(mutant(C, 'if (findInLine(text).length)', 'if (false)')).length > 0);
});
test('mutation: never pruning old lines is caught', () => {
  assert.ok(failures(mutant(C, 'now - t <= MAX_AGE_MS', 'true')).length > 0);
});
test('mutation: writing inside the repository is caught', () => {
  assert.ok(failures(mutant(C, 'if (repoRoots(cwd).some(root => insideRoot(root, dir)))', 'if (false)')).length > 0);
});
test('mutation: not resolving symlinks is caught', () => {
  assert.ok(failures(mutant(C, 'try { return path.join(fs.realpathSync(cur), ...tail); }', 'try { throw new Error("x"); }')).length > 0);
});
test('mutation: clear that keeps the file is caught', () => {
  assert.ok(failures(mutant(C, "fs.rmSync(file, { force: true });", '')).length > 0);
});
