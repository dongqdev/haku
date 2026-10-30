'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const HOOK = process.env.HOOK_SCRIPT || path.join(root, 'hooks', 'scope-check.js');
const common = require('../scripts/lib/hook-common');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'haku-hook-'));

// A fake haku checkout; `scope` is the text of the Scope line (null = no .haku-issue.md at all).
function repo(scope) {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, '.haku'));
  fs.writeFileSync(path.join(dir, '.haku', 'config.json'), '{}');
  fs.mkdirSync(path.join(dir, 'docs'));
  if (scope !== null) fs.writeFileSync(path.join(dir, '.haku-issue.md'), `# Task\n\nScope: ${scope}\n`);
  return dir;
}

function run(script, input, { cwd, data } = {}) {
  const env = { ...process.env };
  delete env.CLAUDE_PLUGIN_DATA;
  if (data) env.CLAUDE_PLUGIN_DATA = data;
  const r = spawnSync(process.execPath, [script], { input, cwd: cwd || os.tmpdir(), env, encoding: 'utf8', maxBuffer: 1 << 26 });
  return r;
}
const payload = (cwd, file) => JSON.stringify({ cwd, tool_name: 'Write', tool_input: { file_path: file, content: 'SECRET body' } });
const records = data => {
  const f = path.join(data, common.RECORD_FILE);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
};

// Every case of the acceptance list, run against one hook script. Returns the list of broken expectations, so the
// same cases also drive the mutation checks below.
function failures(script) {
  const bad = [];
  const expect = (name, ok) => { if (!ok) bad.push(name); };
  const data = tmp();
  const r = repo('docs/**, scripts/a.js');

  let res = run(script, payload(r, path.join(r, 'docs', 'x.md')), { cwd: r, data });
  expect('inside: exit 0', res.status === 0);
  expect('inside: nothing recorded', records(data).length === 0);

  res = run(script, payload(r, path.join(r, 'src', 'y.js')), { cwd: r, data });
  expect('outside: exit 0', res.status === 0);
  expect('outside: recorded', records(data).length === 1 && records(data)[0].file === 'src/y.js');

  res = run(script, payload(r, path.join(r, '.haku-issue.md')), { cwd: r, data });
  expect('issue file counts as outside', res.status === 0 && records(data).length === 2);

  res = run(script, payload(r, path.join(r, 'docs', '..', 'src', 'z.js')), { cwd: r, data });
  expect('dot-dot is resolved', res.status === 0 && records(data).length === 3);

  for (const junk of ['{not json', '', 'null', '[]', '"x"', '{"tool_input":5}', '{"tool_input":{"file_path":7}}']) {
    res = run(script, junk, { cwd: r, data });
    expect(`broken input ${JSON.stringify(junk)}: exit 0`, res.status === 0);
  }
  expect('broken input records nothing more', records(data).length === 3);

  const plain = tmp();
  res = run(script, payload(plain, path.join(plain, 'a.js')), { cwd: plain, data });
  expect('not a haku repo: exit 0, no record', res.status === 0 && res.stdout === '' && records(data).length === 3);

  const noScope = repo(null);
  res = run(script, payload(noScope, path.join(noScope, 'a.js')), { cwd: noScope, data });
  expect('no scope file: exit 0, no record', res.status === 0 && records(data).length === 3);

  // Windows shape: backslashes (a POSIX root written with backslashes) are the same file.
  const winOut = path.join(r, 'src', 'w.js').replace(/\//g, '\\');
  res = run(script, payload(r, winOut), { cwd: r, data });
  expect('windows path outside: recorded', res.status === 0 && records(data).length === 4 && records(data)[3].file === 'src/w.js');
  const winIn = path.join(r, 'docs', 'w.md').replace(/\//g, '\\');
  res = run(script, payload(r, winIn), { cwd: r, data });
  expect('windows path inside: not recorded', res.status === 0 && records(data).length === 4);

  const big = JSON.stringify({ cwd: r, tool_input: { file_path: path.join(r, 'src', 'big.js'), content: 'x'.repeat(3 * 1024 * 1024) } });
  res = run(script, big, { cwd: r, data });
  expect('big input: exit 0, ignored', res.status === 0 && records(data).length === 4);

  res = run(script, payload(r, path.join(r, 'src', 'n.js')), { cwd: r });
  expect('no CLAUDE_PLUGIN_DATA: exit 0, nothing written', res.status === 0 && records(data).length === 4);

  const inRepo = path.join(r, 'rec');
  res = run(script, payload(r, path.join(r, 'src', 'm.js')), { cwd: r, data: inRepo });
  expect('data dir inside the repo is refused', res.status === 0 && !fs.existsSync(inRepo));

  res = run(script, payload(r, path.join(r, 'src', 'k.js')), { cwd: r, data: r });
  expect('data dir equal to the repo root is refused', res.status === 0 && !fs.existsSync(path.join(r, common.RECORD_FILE)));

  try {
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(path.join(r, 'docs'), link);
    res = run(script, payload(r, path.join(r, 'src', 'l.js')), { cwd: r, data: link });
    expect('symlink into the repo is refused', res.status === 0 && !fs.existsSync(path.join(r, 'docs', common.RECORD_FILE)));
  } catch (err) { /* symlinks not available here */ }

  const wide = repo('**');
  const wdata = tmp();
  res = run(script, payload(wide, path.join(wide, '.claude', 'settings.json')), { cwd: wide, data: wdata });
  expect('.claude is outside even when Scope matches', res.status === 0 && records(wdata).length === 1 && records(wdata)[0].file === '.claude/settings.json');

  const f = path.join(data, common.RECORD_FILE);
  const line = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  expect('record holds paths only', line !== '' && !line.includes('SECRET') && Object.keys(JSON.parse(line.split('\n')[0])).sort().join() === 'file,scope,time');
  return bad;
}

test('the hook behaves on every listed case', () => {
  assert.deepStrictEqual(failures(HOOK), []);
});

test('the hook never uses a shell or the network', () => {
  const src = fs.readFileSync(HOOK, 'utf8') + fs.readFileSync(path.join(root, 'scripts', 'lib', 'hook-common.js'), 'utf8');
  assert.ok(!/child_process|https?:\/\/|require\(['"]https?['"]\)/.test(src));
});

test('path helpers: Windows shapes and drive letter case', () => {
  assert.strictEqual(common.normalizePath('C:\\Repo\\docs\\a.md'), 'c:/Repo/docs/a.md');
  assert.strictEqual(common.relativeTo('c:/Repo', 'C:\\repo\\docs\\a.md'), 'docs/a.md');
  assert.strictEqual(common.relativeTo('C:\\Repo', 'D:\\Repo\\a.md'), null);
  assert.strictEqual(common.relativeTo('/r', '/r/docs/../x.js'), 'x.js');
  assert.strictEqual(common.relativeTo('/r', '/r/../elsewhere/x.js'), null);
  assert.strictEqual(common.relativeTo('/r', '/rx/a.js'), null);
});

// Mutation checks: a broken copy of the hook must make the cases above fail.
function mutant(edit) {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'hooks'));
  fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'scripts', 'lib'))) fs.copyFileSync(path.join(root, 'scripts', 'lib', f), path.join(dir, 'scripts', 'lib', f));
  fs.copyFileSync(path.join(root, 'hooks', 'scope-check.js'), path.join(dir, 'hooks', 'scope-check.js'));
  edit(dir);
  return path.join(dir, 'hooks', 'scope-check.js');
}
const patch = (dir, rel, from, to) => {
  const f = path.join(dir, rel);
  const before = fs.readFileSync(f, 'utf8');
  assert.ok(before.includes(from), `mutation anchor missing: ${from}`);
  fs.writeFileSync(f, before.replace(from, to));
};

test('mutation: exiting 2 on errors is caught', () => {
  const s = mutant(d => patch(d, 'hooks/scope-check.js', "() => process.exit(0));", "() => process.exit(2));"));
  assert.ok(failures(s).length > 0);
});
test('mutation: never recording is caught', () => {
  const s = mutant(d => patch(d, 'scripts/lib/hook-common.js', "if (!dataDir || typeof dataDir !== 'string') return false;", 'return false;'));
  assert.ok(failures(s).length > 0);
});
test('mutation: judging everything inside is caught', () => {
  const s = mutant(d => patch(d, 'scripts/lib/hook-common.js', "verdict: inside ? 'inside' : 'outside'", "verdict: 'inside'"));
  assert.ok(failures(s).length > 0);
});
test('mutation: no backslash normalization is caught', () => {
  const s = mutant(d => patch(d, 'scripts/lib/hook-common.js', "String(p).replace(/\\\\/g, '/')", 'String(p)'));
  assert.ok(failures(s).length > 0);
});
test('mutation: no input size cap is caught', () => {
  const s = mutant(d => patch(d, 'scripts/lib/hook-common.js', 'if (size > limit)', 'if (false)'));
  assert.ok(failures(s).length > 0);
});
test('mutation: recording prompt content is caught', () => {
  const s = mutant(d => patch(d, 'scripts/lib/hook-common.js', 'scope: entry.scope }', 'scope: entry.scope, content: "SECRET" }'));
  assert.ok(failures(s).length > 0);
});
test('mutation: allowing the repo root as data dir is caught', () => {
  const s = mutant(d => patch(d, 'scripts/lib/hook-common.js', "d.toLowerCase() === r.toLowerCase() || relativeTo(r, d) !== null", 'relativeTo(r, d) !== null'));
  assert.ok(failures(s).length > 0);
});
test('mutation: not resolving symlinks is caught', () => {
  const s = mutant(d => patch(d, 'scripts/lib/hook-common.js', 'return path.join(fs.realpathSync(cur), ...tail);', 'return path.join(cur, ...tail);'));
  assert.ok(failures(s).length > 0);
});
