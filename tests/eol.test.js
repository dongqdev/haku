'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseEol, checkEol } = require('../scripts/lib/eol-check');

const cli = path.join(__dirname, '..', 'scripts', 'check-eol.js');
const root = path.join(__dirname, '..');

// A throwaway repository; git settings are pinned so the machine's own autocrlf does not change the result.
function repo(files, { attributes = null, autocrlf = 'false' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-eol-'));
  const git = (...a) => {
    const r = spawnSync('git', ['-c', `core.autocrlf=${autocrlf}`, '-c', 'core.safecrlf=false', '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`);
    return r.stdout;
  };
  git('init', '-q', '-b', 'main');
  if (attributes !== null) fs.writeFileSync(path.join(dir, '.gitattributes'), attributes);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', 'x');
  return { dir, git };
}
const run = (dir, ...args) => spawnSync(process.execPath, [cli, '--cwd', dir, ...args], { encoding: 'utf8' });

test('the repository itself commits no CRLF, and has the attribute and editor files', () => {
  assert.deepStrictEqual(checkEol({ cwd: root }).problems, []);
  assert.match(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8'), /^\* text=auto eol=lf$/m);
  const editor = fs.readFileSync(path.join(root, '.editorconfig'), 'utf8');
  assert.match(editor, /^end_of_line = lf$/m);
  assert.match(editor, /^insert_final_newline = true$/m);
});

test('a committed file with CRLF fails the check and is named', () => {
  const { dir } = repo({ 'ok.txt': 'a\nb\n', 'bad.txt': 'a\r\nb\r\n' }, { attributes: '* -text\n' });
  const r = run(dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /i\/crlf  bad\.txt/);
  assert.doesNotMatch(r.stderr, /ok\.txt/);
});

test('a file that mixes both endings fails too', () => {
  const { dir } = repo({ 'mixed.txt': 'a\nb\r\nc\n' }, { attributes: '* -text\n' });
  const r = run(dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /i\/mixed  mixed\.txt/);
});

test('with the repository attributes git itself turns CRLF into LF when a file is added, so nothing bad is committed', () => {
  const { dir, git } = repo({ 'a.txt': 'a\r\nb\r\n' }, { attributes: '* text=auto eol=lf\n' });
  assert.strictEqual(run(dir).status, 0, 'the index holds LF');
  // the copy written by hand is still CRLF; a fresh checkout follows the attribute and is LF
  fs.rmSync(path.join(dir, 'a.txt'));
  git('-c', 'core.autocrlf=true', 'checkout', '--', 'a.txt');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'a\nb\n', 'eol=lf wins over core.autocrlf=true');
  assert.strictEqual(run(dir, '--worktree').status, 0);
});

test('a clean repository passes; binary files and an empty repository are not a problem', () => {
  const clean = repo({ 'a.txt': 'a\nb\n', 'x.bin': Buffer.from([0, 1, 2, 13, 10, 0]) }, { attributes: '*.bin binary\n' });
  const r = run(clean.dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /line endings ok/);
  const empty = repo({});
  assert.strictEqual(run(empty.dir).status, 0);
});

test('--worktree also fails for a file checked out with CRLF (what an unconfigured Windows runner does)', () => {
  const { dir, git } = repo({ 'a.txt': 'a\nb\n' }, { autocrlf: 'false' });
  fs.rmSync(path.join(dir, 'a.txt'));
  git('-c', 'core.autocrlf=true', 'checkout', '--', 'a.txt');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8'), 'a\r\nb\r\n', 'the checkout produced CRLF');
  assert.strictEqual(run(dir).status, 0, 'the index is still LF');
  const r = run(dir, '--worktree');
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /w\/crlf  a\.txt/);
});

test('a file that asks for CRLF on purpose is left alone in the worktree check', () => {
  const { dir, git } = repo({ 'run.bat': 'echo\nexit\n', 'a.txt': 'a\n' }, { attributes: '*.bat text eol=crlf\n' });
  fs.rmSync(path.join(dir, 'run.bat'));
  git('checkout', '--', 'run.bat');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'run.bat'), 'utf8'), 'echo\r\nexit\r\n', 'the attribute produced CRLF on purpose');
  const r = run(dir, '--worktree');
  assert.strictEqual(r.status, 0, r.stderr);
  // the same CRLF in a file nobody asked for it is a problem
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\r\n');
  assert.strictEqual(run(dir, '--worktree').status, 1);
});

test('names with spaces and odd characters are read correctly', () => {
  const { dir } = repo({ 'a b/c d.txt': 'x\r\n', 'ü.txt': 'y\r\n' }, { attributes: '* -text\n' });
  const r = run(dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /i\/crlf  a b\/c d\.txt/);
  assert.match(r.stderr, /i\/crlf  ü\.txt/);
});

test('outside a git repository the check is an error (exit 2), not a pass', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-eol-none-'));
  const r = run(dir);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /git ls-files --eol failed/);
});

test('the parser reads git\'s listing', () => {
  const out = 'i/lf    w/lf    attr/text=auto eol=lf \tsrc/a.js\0i/-text w/-text attr/                 \tlogo.png\0i/crlf  w/crlf  attr/\twith space.txt\0';
  assert.deepStrictEqual(parseEol(out), [
    { index: 'lf', work: 'lf', attr: 'text=auto eol=lf', file: 'src/a.js' },
    { index: '-text', work: '-text', attr: '', file: 'logo.png' },
    { index: 'crlf', work: 'crlf', attr: '', file: 'with space.txt' }
  ]);
  assert.deepStrictEqual(parseEol(''), []);
});

test('the workflow runs the check on every operating system, including the worktree', () => {
  const yml = fs.readFileSync(path.join(root, '.github', 'workflows', 'test.yml'), 'utf8');
  assert.match(yml, /node scripts\/check-eol\.js --worktree/);
  assert.match(yml, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.ok(yml.indexOf('check-eol.js') < yml.indexOf('node --test'), 'before the tests, so a line ending problem is named first');
});

test('check-eol with a missing --cwd value is an error', () => {
  const r = spawnSync(process.execPath, [cli, '--cwd'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 2);
});

test('setup proposes the attribute and editor files only when the repository has none, and never overwrites', () => {
  const setup = fs.readFileSync(path.join(root, 'skills', 'setup', 'SKILL.md'), 'utf8');
  assert.match(setup, /`\.gitattributes` and `\.editorconfig`, \*\*only when the repository has no `\.gitattributes`\*\*/);
  assert.match(setup, /never overwrite an existing one/);
  assert.match(setup, /check-eol\.js" --worktree/);
});
