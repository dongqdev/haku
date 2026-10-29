'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { findInLine, parseAllow, scanPersonalPaths, textOf, ALLOW_MARK } = require('../scripts/lib/personal-paths');

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

test('a root or home path is found at the start of a line and after the usual separators', () => {
  const home = unix('home', 'alice', 'project');
  for (const line of [unix('root', '.config'), `cd ${unix('root', 'x')}`, `"${unix('root', 'x')}"`, `'${home}'`, `path=${home}`, `(${home})`, `\`${home}\``, `[${home}]`, `a,${home}`]) {
    assert.ok(findInLine(line).length > 0, line);
  }
  assert.deepStrictEqual(rules(unix('root', 'a')), ['root home']);
  assert.deepStrictEqual(rules(home), ['/home/<name>']);
});

test('a path without a trailing slash counts: end of line, before a quote, after HOME=, in a host:path, in JSON', () => {
  const alice = unix('home', 'alice');
  const bob = win(BS + BS, 'Users', 'bob');
  for (const line of [alice, `"${alice}"`, `HOME=${alice}`, `user@host:${alice}`, `"cwd": "${bob}"`, win(BS, 'Users', 'bob'), `"${unix('root')}"`, `${unix('root')}\``, unix('root')]) {
    assert.ok(findInLine(line).length > 0, line);
  }
  assert.ok(findInLine(`path ${unix('Users', 'bob')}`).length > 0);
});

test('escaped and encoded spellings: JSON-escaped slashes, doubled backslashes, URL-encoded', () => {
  const jsonSlash = [BS + SL + 'home' + BS + SL + 'alice' + BS + SL + 'x', BS + SL + 'root' + BS + SL + 'x'];
  for (const line of jsonSlash) assert.ok(findInLine(line).length > 0, line);
  assert.ok(findInLine('%2F' + 'home%2Falice%2Fx').length > 0);
  assert.ok(findInLine('%2F' + 'Users%2Fbob').length > 0);
  assert.deepStrictEqual(findInLine('%2Fhome%2F%3Cname%3E'), []);
  assert.ok(findInLine(win(BS + BS, 'Users', 'bob', 'dev')).length > 0);
});

test('macOS, Windows, WSL and other Linux layouts, with either slash and letter case where the system ignores it', () => {
  const found = [
    unix('Users', 'bob', 'dev'), unix('users', 'bob', 'dev'), unix('USERS', 'bob', 'dev'),
    win(BS, 'Users', 'bob', 'dev'), win(SL, 'Users', 'bob', 'dev'), win(BS, 'users', 'bob', 'dev'), win(BS, 'USERS', 'BOB', 'dev'),
    'd:' + BS + 'Users' + BS + 'bob' + BS + 'x', unix('mnt', 'c', 'Users', 'alice', 'x'), unix('var', 'home', 'alice', 'x'), unix('data', 'home', 'alice', 'x'),
    'file://' + SL + win(SL, 'Users', 'alice', 'x')
  ];
  for (const line of found) assert.ok(findInLine(line).length > 0, line);
  assert.deepStrictEqual(rules(unix('mnt', 'c', 'Users', 'alice')), ['/mnt/<drive>/Users/<name>']);
  assert.deepStrictEqual(rules(win(BS + BS, 'Users', 'bob', 'dev')), ['C:\\Users\\<name>']);
});

test('Linux folders are case-sensitive (Home and Root are not machine paths); macOS and Windows ones are not', () => {
  assert.deepStrictEqual(findInLine(unix('Home', 'alice', 'x')), []);
  assert.deepStrictEqual(findInLine(unix('Root', 'x')), []);
  assert.deepStrictEqual(findInLine(unix('ROOT', 'x')), []);
  assert.ok(findInLine(unix('USERS', 'bob', 'x')).length > 0);
});

test('one path is reported once even when two rules see the name', () => {
  assert.strictEqual(findInLine('file://' + SL + win(SL, 'Users', 'alice', 'x')).length, 1);
});

test('placeholders, CI accounts and shared names are not personal', () => {
  const ok = [
    unix('home', '<name>', 'x'), unix('home', '$USER', 'x'), unix('home', '${USER}', 'x'), unix('home', '{user}', 'x'), unix('home', '*', 'x'),
    unix('home', '[user]', 'x'), unix('home', '\u2026', 'x'), unix('home', '...', 'x'),
    unix('home', 'runner', 'work'), unix('home', 'user', 'x'), unix('Users', 'Shared', 'x'), unix('Users', 'you', 'x'),
    unix('home', 'your_name', 'x'), unix('home', 'YOUR-NAME', 'x'), unix('home', 'testuser', 'x'), unix('home', 'ubuntu', 'x'), unix('home', 'vsts', 'x'),
    unix('home', 'node', 'x'), unix('home', 'ec2-user', 'x'), unix('home', 'example-user', 'x'),
    win(BS, 'Users', '<name>', 'x'), win(BS, 'Users', '%USERNAME%', 'x'), win(BS, 'Users', 'Public', 'x'), win(BS, 'Users', 'Default', 'x'),
    win(BS, 'Users', '{name}', 'x'), win(BS, 'Users', 'username', 'x'), unix('mnt', 'c', 'Users', 'Public', 'x')
  ];
  for (const line of ok) assert.deepStrictEqual(findInLine(line), [], line);
});

test('relative paths and look-alikes that are not a machine path are not found', () => {
  const ok = [
    'abc' + win(BS, 'Users', 'bob', 'x'), 'src' + unix('root', 'x'), '.' + unix('root', 'x'), '~' + unix('root', 'x'), 'a-' + unix('root', 'x'), 'docs' + unix('home', 'alice', 'x'),
    'the root of the repository', '/rooted/x', '/homer/alice/x', 'Users' + SL + 'bob' + SL,
    'https://example.com' + unix('Users', 'bob', 'x'), 'https://example.com' + unix('home', 'alice', 'x'), 'https://example.com' + unix('root', 'x')
  ];
  for (const line of ok) assert.deepStrictEqual(findInLine(line), [], line);
});

test('a line with the allow mark is never reported, even with several paths on it', () => {
  const line = `${unix('root', 'a')} and ${unix('home', 'alice', 'b')} // ${ALLOW_MARK}`;
  assert.deepStrictEqual(findInLine(line), []);
  assert.strictEqual(findInLine(`${unix('root', 'a')} and ${unix('home', 'alice', 'b')}`).length, 2);
});

test('the allow list reads paths and globs, comments and blank lines; its glob rules are the ones the help promises', () => {
  const allow = parseAllow('# explained\ndocs/example.md   # a sample\n\ntests/fixtures/**\r\n*.md\ndocs-folder\n**/*.snap\n');
  const hit = f => allow.some(t => t(f));
  assert.ok(hit('docs/example.md'));
  assert.ok(hit('tests/fixtures/a/b.txt'));
  assert.ok(!hit('docs/other.md'));
  assert.ok(!hit('src/tests/fixtures/a.txt'), 'a path is from the root');
  assert.ok(hit('README.md') && !hit('x/README.md'), '*.md means root-level files only');
  assert.ok(hit('docs-folder/a/b.txt'), 'a plain folder name covers the folder');
  assert.ok(hit('a/b/c.snap') && hit('c.snap'), '**/ crosses folders');
  assert.ok(hit('DOCS/Example.MD'), 'letter case does not matter');
  assert.deepStrictEqual(parseAllow(''), []);
  assert.deepStrictEqual(parseAllow(undefined), []);
});

test('UTF-16 text (with a byte order mark) is decoded; a NUL file without one is binary', () => {
  const text = unix('home', 'alice', 'x');
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  const be = Buffer.from(le);
  be.subarray(2).swap16();
  const beFile = Buffer.concat([Buffer.from([0xfe, 0xff]), be.subarray(2)]);
  assert.strictEqual(textOf(le), text);
  assert.strictEqual(textOf(beFile), text);
  assert.strictEqual(textOf(Buffer.from('plain')), 'plain');
  assert.strictEqual(textOf(Buffer.concat([Buffer.from('abc'), Buffer.from([0, 1, 2])])), null);
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
  assert.ok(r.stderr.includes('docs/a.md:2  /home/<name>  "' + unix('home', 'alice') + '"'), r.stderr);
  assert.doesNotMatch(r.stderr, /ok\.md/);
});

test('an untracked file is not scanned, a clean repository passes, an empty one passes', () => {
  const dir = repo({ 'a.md': 'ok\n' });
  fs.writeFileSync(path.join(dir, 'untracked.md'), unix('root', 'x'));
  const r = run(dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /no personal paths \(1 text files, 0 binary skipped\)/);
  assert.strictEqual(run(repo({})).status, 0);
});

test('binary files are skipped and counted, text files with CRLF are read, UTF-16 files are read', () => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`log ${unix('home', 'alice', 'x')}\r\n`, 'utf16le')]);
  const dir = repo({ 'bin.dat': Buffer.concat([Buffer.from(unix('root', 'x')), Buffer.from([0, 1, 2])]), 'win.txt': `a\r\nb ${unix('root', 'x')}\r\n`, 'out.ps1': utf16 });
  const r = run(dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /win\.txt:2/);
  assert.match(r.stderr, /out\.ps1:1/);
  assert.doesNotMatch(r.stderr, /bin\.dat/);
  assert.strictEqual(run(repo({ 'bin.dat': Buffer.from([0, 1, 2]), 'a.txt': 'ok\n' })).stdout.includes('1 binary skipped'), true);
});

test('the allow file and the allow mark let a file through; a file not on the list still fails; marked lines are counted', () => {
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
  const marked = repo({ 'src/a.js': `const p = '${unix('root', 'x')}'; // ${ALLOW_MARK}\n` });
  assert.match(run(marked).stdout, /1 line\(s\) allowed by haku:allow-personal-path/);
  const mention = repo({ 'doc.md': `the mark is ${ALLOW_MARK}\n` });
  assert.doesNotMatch(run(mention).stdout, /allowed by/, 'a line that only mentions the mark holds no path and is not counted');
});

test('a symbolic link is checked by its target text; a file deleted from the working tree does not break the scan', { skip: process.platform === 'win32' }, () => {
  const dir = repo({ 'gone.md': 'x\n', 'real.md': 'ok\n' });
  fs.rmSync(path.join(dir, 'gone.md'));
  fs.symlinkSync('real.md', path.join(dir, 'link.md'));
  spawnSync('git', ['add', '-A'], { cwd: dir });
  assert.strictEqual(run(dir).status, 0);
  fs.symlinkSync(unix('home', 'alice', 'secret'), path.join(dir, 'leak'));
  spawnSync('git', ['add', '-A'], { cwd: dir });
  const r = run(dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /leak:1  \/home\/<name>/);
});

test('a big binary file is skipped, not a failure; a big text file is "not checked" and fails', () => {
  const big = Buffer.alloc(21 * 1024 * 1024, 65);
  const bin = Buffer.from(big);
  bin[10] = 0;
  const okDir = repo({ 'video.bin': bin, 'a.txt': 'ok\n' });
  const r = run(okDir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 binary skipped/);
  const textDir = repo({ 'big.txt': big });
  const t = run(textDir);
  assert.strictEqual(t.status, 1);
  assert.match(t.stderr, /big\.txt  not checked: a text file larger than/);
});

test('a file that cannot be read is "not checked", not a silent pass', { skip: process.platform === 'win32' || (process.getuid && process.getuid() === 0) }, () => {
  const dir = repo({ 'secret.txt': 'x\n' });
  fs.chmodSync(path.join(dir, 'secret.txt'), 0);
  const r = run(dir);
  fs.chmodSync(path.join(dir, 'secret.txt'), 0o644);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /secret\.txt  not checked: could not be read \(EACCES\)/);
});

test('outside a git repository, or with a missing --cwd value, the check is an error, not a pass', () => {
  const none = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-pp-none-'));
  const r = run(none);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /git ls-files failed/);
  assert.strictEqual(spawnSync(process.execPath, [cli, '--cwd'], { encoding: 'utf8' }).status, 2);
});

test('the workflow runs the check, and the README and setup say how to use and allow', () => {
  const yml = fs.readFileSync(path.join(root, '.github', 'workflows', 'test.yml'), 'utf8');
  assert.match(yml, /node scripts\/check-personal-paths\.js/);
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /check-personal-paths\.js/);
  assert.match(readme, /haku:allow-personal-path/);
  assert.match(readme, /personal-paths-allow\.txt/);
  assert.match(fs.readFileSync(path.join(root, 'skills', 'setup', 'SKILL.md'), 'utf8'), /check-personal-paths\.js/);
});

test('a file deleted from the working tree is skipped, any other read error is not (a missing file is not a pass for a broken one)', () => {
  const dir = repo({ 'gone.md': 'x\n', 'ok.md': 'fine\n' });
  fs.rmSync(path.join(dir, 'gone.md'));
  const r = run(dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout + r.stderr, /not checked/);
  // a tracked path that is a folder in the working tree (not a file, not a link) is a submodule-like entry: skipped
  const dir2 = repo({ 'a.txt': 'ok\n' });
  assert.strictEqual(run(dir2).status, 0);
});

test('a file name that is not valid UTF-8 is reported as not checked', { skip: process.platform === 'win32' || process.platform === 'darwin' }, () => {
  const dir = repo({ 'ok.txt': 'ok\n' });
  const name = Buffer.concat([Buffer.from(dir + '/bad-'), Buffer.from([0xff, 0xfe]), Buffer.from('.txt')]);
  fs.writeFileSync(name, 'x\n');
  spawnSync('git', ['add', '-A'], { cwd: dir });
  const r = run(dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /not checked: the file name is not valid UTF-8/);
});

test('a tracked path that cannot be reached (a folder replaced by a file) is "not checked", not skipped like a deleted file', { skip: process.platform === 'win32' }, () => {
  const dir = repo({ 'a/b.txt': 'x\n', 'ok.txt': 'ok\n' });
  fs.rmSync(path.join(dir, 'a'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'a'), 'now a file');
  const r = run(dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /a\/b\.txt  not checked: could not be read \(ENOTDIR\)/);
});
