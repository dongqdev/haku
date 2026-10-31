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

  const exact = n => 'ab cd '.repeat(60).slice(0, n - 1) + 'z';
  expect('exactly 300 ok', exact(300).length === 300 && add(exact(300)).status === 0);
  r = add(exact(301));
  expect('301 rejected', exact(301).length === 301 && r.status !== 0 && /longer/.test(r.stderr));
  const count = fs.readFileSync(file(data), 'utf8').trim().split('\n').length;
  expect('two entries kept', count === 2);

  const secrets = ['ghp_', 'sk-', 'AKIA', 'Bearer '].map((p, i) => [
    p + ['abcdefghijklmnopqrstuvwx', 'abcdefghijklmnopqrstuvwx', 'ABCDEFGHIJKLMNOP', 'abcdefghijklmnop1234'][i]]);
  secrets.push(['password' + '=' + 'hunter22xx'], ['0123456789abcdef'.repeat(3)],
    ['DB_PASS' + 'WORD=' + 'hunter22xx'], ['MY_API_' + 'KEY: ' + 'hunter22xx'],
    ['https' + '://bob:' + 'hunter22xx' + '@host.example'], ['glp' + 'at-' + 'abcdefghijklmnopqrstu'],
    ['pass' + 'word is ' + 'hunter22xx'], ['pass' + 'wd: ' + 'hunter22xx'], ['비밀' + '번호는 ' + 'hunter22xx']);
  for (const [s] of secrets) {
    r = add(`please never do this ${s} again`);
    expect(`secret rejected: ${s.slice(0, 4)}`, r.status !== 0 && !(r.stdout + r.stderr).includes(s) && !fs.readFileSync(file(data), 'utf8').includes(s));
    expect(`secret reason named: ${s.slice(0, 4)}`, /looks like/.test(r.stderr));
  }
  const personal = '/ho' + 'me/' + 'someperson' + '/proj';
  r = add(`it edited ${personal} by mistake`);
  expect('personal path rejected', r.status !== 0 && /personal path/.test(r.stderr) && !(r.stdout + r.stderr).includes('someperson'));
  r = add(`it edited ${personal} haku:allow-personal-path by mistake`);
  expect('allow mark does not bypass', r.status !== 0 && /personal path/.test(r.stderr));
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
  try {
    const g2 = tmp();
    spawnSync('git', ['init', '-q'], { cwd: g2 });
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(g2, link, 'junction'); // a junction needs no special right on Windows; ignored elsewhere
    r = add('fine sentence', { data: path.join(link, 'viaLink'), cwd: g2 });
    expect('symlink into repo refused', r.status !== 0 && !fs.existsSync(path.join(g2, 'viaLink')));
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'EACCES') throw err; // no symlink right on this system: skipped
  }
  expect('repo stays empty', fs.readdirSync(repo).join() === '.haku');

  // a data folder inside some other git work tree is refused even when cwd is elsewhere
  if (spawnSync('git', ['--version']).status === 0) {
    const g = tmp();
    spawnSync('git', ['init', '-q'], { cwd: g });
    r = add('fine sentence', { data: path.join(g, 'sub', 'd'), cwd: os.tmpdir() });
    expect('data folder in a git work tree refused', r.status !== 0 && !fs.existsSync(path.join(g, 'sub')));
  }

  // ~/.haku/config.json is the user config, not a repository marker
  const home2 = tmp();
  fs.mkdirSync(path.join(home2, '.haku'));
  fs.writeFileSync(path.join(home2, '.haku', 'config.json'), '{}');
  r = run(scripts, ['add', '--text', 'with user config'], { home: home2, cwd: home2 });
  expect('default under a home with config.json', r.status === 0 && fs.existsSync(path.join(home2, '.haku', 'corrections.jsonl')));
  const underHome = path.join(home2, 'plugin-data');
  r = run(scripts, ['add', '--text', 'data under home'], { home: home2, data: underHome, cwd: home2 });
  expect('CLAUDE_PLUGIN_DATA under home', r.status === 0 && fs.existsSync(path.join(underHome, 'corrections.jsonl')));
  expect('no temp file left', fs.existsSync(underHome) && fs.readdirSync(underHome).join() === 'corrections.jsonl');

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
  assert.ok(failures(mutant(C, "if (findInLine(text.split(ALLOW_MARK).join('')).length)", 'if (false)')).length > 0);
});
test('mutation: never pruning old lines is caught', () => {
  assert.ok(failures(mutant(C, 'now - t <= MAX_AGE_MS', 'true')).length > 0);
});
test('mutation: writing inside the repository is caught', () => {
  assert.ok(failures(mutant(C, 'if (!insideRoot(root, dir)) continue;', 'continue;')).length > 0);
});
test('mutation: not resolving symlinks is caught', () => {
  assert.ok(failures(mutant(C, 'try { return path.join(trueName(cur), ...tail); }', 'try { throw new Error("x"); }')).length > 0);
});
test('mutation: clear that keeps the file is caught', () => {
  assert.ok(failures(mutant(C, "fs.rmSync(file, { force: true });", '')).length > 0);
});
test('mutation: ignoring that home is not a repository is caught', () => {
  assert.ok(failures(mutant(C, 'if (haku && !same(haku, os.homedir()))', 'if (haku)')).length > 0);
});
test('mutation: not checking the data folder own work tree is caught', () => {
  assert.ok(failures(mutant(C, 'roots.push(...repoRoots(near));', '')).length > 0);
});
test('mutation: letting the allow mark bypass is caught', () => {
  assert.ok(failures(mutant(C, "findInLine(text.split(ALLOW_MARK).join(''))", 'findInLine(text)')).length > 0);
});
test('mutation: dropping the spoken password rule is caught', () => {
  assert.ok(failures(mutant(C, '(?:is|', '(?:zzzz|')).length > 0);
});
