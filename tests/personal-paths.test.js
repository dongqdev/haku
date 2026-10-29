'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { findInLine, parseAllow, scanPersonalPaths, ALLOW_MARK } = require('../scripts/lib/personal-paths');

const root = path.join(__dirname, '..');
const cli = path.join(root, 'scripts', 'check-personal-paths.js');
// Samples are put together from pieces so that this file does not hold a personal path itself.
const SL = '/';
const BS = '\\';
const unix = (top, ...rest) => [SL + top, ...rest].join(SL);
const win = (sep, ...parts) => `C:${sep}${parts.join(sep)}`;
const rules = line => findInLine(line).map(f => f.rule);

test('the repository itself holds no personal path', () => {
  const r = scanPersonalPaths({ cwd: root });
  assert.deepStrictEqual(r.hits, []);
  assert.deepStrictEqual(r.unchecked, []);
  assert.ok(r.scanned > 20);
});

test('/root/ and /home/<name>/ are found, at the start of a line and after the usual separators', () => { // haku:allow-personal-path
  const home = unix('home', 'alice', 'project');
  for (const line of [unix('root', '.config'), `cd ${unix('root', 'x')}`, `"${unix('root', 'x')}"`, `'${home}'`, `path=${home}`, `(${home})`, `\`${home}\``, `[${home}]`, `a,${home}`]) {
    assert.ok(findInLine(line).length > 0, line);
  }
  assert.deepStrictEqual(rules(unix('root', 'a')), ['/root/']); // haku:allow-personal-path
  assert.deepStrictEqual(rules(home), ['/home/<name>/']);
});

test('macOS and Windows paths, with either slash, doubled backslashes and any letter case', () => {
  const found = [
    unix('Users', 'bob', 'dev'), unix('users', 'bob', 'dev'), unix('USERS', 'bob', 'dev'),
    win(BS, 'Users', 'bob', 'dev'), win(BS + BS, 'Users', 'bob', 'dev'), win(SL, 'Users', 'bob', 'dev'),
    win(BS, 'users', 'bob', 'dev'), win(BS, 'USERS', 'BOB', 'dev'), 'd:' + BS + 'Users' + BS + 'bob' + BS + 'x',
    unix('Home', 'alice', 'x'), unix('ROOT', 'x')
  ];
  for (const line of found) assert.ok(findInLine(line).length > 0, line);
  assert.deepStrictEqual(rules(win(BS + BS, 'Users', 'bob', 'dev')), ['C:\\Users\\<name>\\']);
});

test('placeholders and shared names are not personal', () => {
  const ok = [
    unix('home', '<name>', 'x'), unix('home', '$USER', 'x'), unix('home', '${USER}', 'x'), unix('home', '{user}', 'x'), unix('home', '*', 'x'),
    unix('home', 'runner', 'work'), unix('home', 'user', 'x'), unix('Users', 'Shared', 'x'), unix('Users', 'you', 'x'),
    win(BS, 'Users', '<name>', 'x'), win(BS, 'Users', '%USERNAME%', 'x'), win(BS, 'Users', 'Public', 'x'), win(BS, 'Users', 'Default', 'x'),
    win(BS, 'Users', '{name}', 'x'), win(BS, 'Users', 'username', 'x')
  ];
  for (const line of ok) assert.deepStrictEqual(findInLine(line), [], line);
});

test('relative paths and look-alikes that are not a machine path are not found', () => {
  const ok = [
    'abc' + win(BS, 'Users', 'bob', 'x'), 'src' + unix('root', 'x'), '.' + unix('root', 'x'), '~' + unix('root', 'x'), 'a-' + unix('root', 'x'), 'docs' + unix('home', 'alice', 'x'),
    'the root of the repository', unix('root'), '/rooted/x', '/homer/alice/x', 'Users' + SL + 'bob' + SL, 'https://example.com' + unix('Users', 'bob', 'x').replace('/Users', '/users-guide')
  ];
  for (const line of ok) assert.deepStrictEqual(findInLine(line), [], line);
});

test('a line with the allow mark is never reported, even with several paths on it', () => {
  const line = `${unix('root', 'a')} and ${unix('home', 'alice', 'b')} // ${ALLOW_MARK}`;
  assert.deepStrictEqual(findInLine(line), []);
  assert.strictEqual(findInLine(`${unix('root', 'a')} and ${unix('home', 'alice', 'b')}`).length, 2);
});

test('the allow list reads paths and globs, comments and blank lines', () => {
  const allow = parseAllow('# explained\ndocs/example.md   # a sample\n\ntests/fixtures/**\r\n');
  assert.ok(allow.some(t => t('docs/example.md')));
  assert.ok(allow.some(t => t('tests/fixtures/a/b.txt')));
  assert.ok(!allow.some(t => t('docs/other.md')));
  assert.ok(!allow.some(t => t('src/tests/fixtures/a.txt')), 'a path is from the root');
  assert.deepStrictEqual(parseAllow(''), []);
  assert.deepStrictEqual(parseAllow(undefined), []);
});

function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-pp-'));
  const git = (...a) => {
    const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', ...a], { cwd: dir, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
  };
  git('init', '-q', '-b', 'main');
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  git('add', '-A');
  git('commit', '-q', '--allow-empty', '-m', 'x');
  return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [cli, '--cwd', dir, ...args], { encoding: 'utf8' });

test('a tracked file with a personal path fails, naming file, line and rule', () => {
  const dir = repo({ 'ok.md': 'fine\n', 'docs/a.md': `line one\nsee ${unix('home', 'alice', 'x')}\n` });
  const r = run(dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /docs\/a\.md:2  \/home\/<name>\/  "\/home\/alice\/"/);
  assert.doesNotMatch(r.stderr, /ok\.md/);
});

test('an untracked file is not scanned, a clean repository passes, an empty one passes', () => {
  const dir = repo({ 'a.md': 'ok\n' });
  fs.writeFileSync(path.join(dir, 'untracked.md'), unix('root', 'x'));
  const r = run(dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /no personal paths \(1 text files\)/);
  assert.strictEqual(run(repo({})).status, 0);
});

test('binary files (a NUL byte) are skipped, text files with CRLF are read', () => {
  const dir = repo({ 'bin.dat': Buffer.concat([Buffer.from(unix('root', 'x')), Buffer.from([0, 1, 2])]), 'win.txt': `a\r\nb ${unix('root', 'x')}\r\n` });
  const r = run(dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /win\.txt:2/);
  assert.doesNotMatch(r.stderr, /bin\.dat/);
});

test('the allow file and the allow mark let a file through; a file not on the list still fails', () => {
  const dir = repo({
    '.haku/personal-paths-allow.txt': '# the docs show a sample path\ndocs/sample.md\n',
    'docs/sample.md': unix('root', 'x') + '\n',
    'src/a.js': `const p = '${unix('root', 'x')}'; // ${ALLOW_MARK}\n`,
    'src/b.js': `const p = '${unix('root', 'y')}';\n`
  });
  const r = run(dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /src\/b\.js:1/);
  assert.doesNotMatch(r.stderr, /docs\/sample\.md|src\/a\.js/);
  assert.match(r.stderr, /1 personal path\(s\)/);
});

test('a file deleted from the working tree and a symlink do not break the scan', { skip: process.platform === 'win32' }, () => {
  const dir = repo({ 'gone.md': 'x\n', 'real.md': 'ok\n' });
  fs.rmSync(path.join(dir, 'gone.md'));
  fs.symlinkSync(path.join(dir, 'real.md'), path.join(dir, 'link.md'));
  spawnSync('git', ['add', '-A'], { cwd: dir });
  assert.strictEqual(run(dir).status, 0);
});

test('outside a git repository, or with a missing --cwd value, the check is an error, not a pass', () => {
  const none = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-pp-none-'));
  const r = run(none);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /git ls-files failed/);
  assert.strictEqual(spawnSync(process.execPath, [cli, '--cwd'], { encoding: 'utf8' }).status, 2);
});

test('the workflow runs the check', () => {
  const yml = fs.readFileSync(path.join(root, '.github', 'workflows', 'test.yml'), 'utf8');
  assert.match(yml, /node scripts\/check-personal-paths\.js/);
});
