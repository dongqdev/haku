'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_PATTERNS, matcher, patternsFrom, scopeOf, scopeParts, configChanges, renderChanges } = require('../scripts/lib/weaken');
const { createGitHubHost } = require('../scripts/lib/github-host');

const names = (files, opts) => configChanges(files, opts).map(f => f.file);

test('lint, format, type, test runner, CI, hook and haku settings are found, in any folder for bare names', () => {
  const touched = [
    '.eslintrc.json', 'packages/app/.eslintrc.js', 'eslint.config.mjs', 'prettier.config.cjs', 'tsconfig.json', 'apps/web/tsconfig.build.json',
    'jest.config.ts', 'vitest.config.js', 'pytest.ini', 'ruff.toml', '.github/workflows/test.yml', '.github/actions/setup/action.yml',
    '.gitlab-ci.yml', '.husky/pre-commit', '.haku/verify.json', '.haku/config.json', '.pre-commit-config.yaml'
  ];
  assert.deepStrictEqual(names(touched), touched);
});

test('ordinary files are not reported', () => {
  const plain = ['src/index.js', 'README.md', 'tests/a.test.js', 'docs/.haku-notes.md', 'src/.github/readme.md', 'lib/eslintrc.md', 'src/tsconfigs/a.txt'];
  assert.deepStrictEqual(names(plain), []);
});

test('only a workflow below .github/workflows counts for the path rule, and letter case does not matter', () => {
  assert.deepStrictEqual(names(['.GitHub/Workflows/Test.yml', 'sub/.github/workflows/test.yml']), ['.GitHub/Workflows/Test.yml']);
});

test('a rename is reported under the old and the new name; a file listed twice once', () => {
  const found = names([{ filename: 'src/x.js', previous_filename: '.eslintrc.json' }, { filename: '.eslintrc.json' }, { filename: 'src/y.js' }]);
  assert.deepStrictEqual(found, ['.eslintrc.json']);
  assert.deepStrictEqual(names([{ filename: '.eslintrc.yml', previous_filename: '.eslintrc.json' }]), ['.eslintrc.yml', '.eslintrc.json']);
});

test('windows separators and ./ prefixes are normalised', () => {
  assert.deepStrictEqual(names(['.github\\workflows\\test.yml', './.haku/verify.json']), ['.github/workflows/test.yml', '.haku/verify.json']);
});

test('the repository can add patterns but cannot switch a default off', () => {
  assert.deepStrictEqual(names(['build/ci.sh', '.eslintrc.json'], { patterns: patternsFrom({ watchFiles: ['build/**'] }) }), ['build/ci.sh', '.eslintrc.json']);
  assert.deepStrictEqual(patternsFrom({ watchFiles: [] }), DEFAULT_PATTERNS);
  assert.deepStrictEqual(patternsFrom({ watchFiles: 'nope', other: 1 }), DEFAULT_PATTERNS);
  assert.deepStrictEqual(patternsFrom({ watchFiles: [5, '', '  ', 'x/**'] }), [...DEFAULT_PATTERNS, 'x/**']);
  assert.deepStrictEqual(patternsFrom(undefined), DEFAULT_PATTERNS);
});

test('glob rules: ** crosses folders, * and ? stay inside a name', () => {
  assert.ok(matcher('src/**')('src/a/b/c.js'));
  assert.ok(matcher('src/**/x.js')('src/x.js'));
  assert.ok(matcher('src/**/x.js')('src/a/b/x.js'));
  assert.ok(!matcher('src/*')('src/a/b.js'));
  assert.ok(matcher('src/?.js')('src/a.js'));
  assert.ok(!matcher('src/?.js')('src/ab.js'));
  assert.ok(matcher('a.b')('a.b') && !matcher('a.b')('aXb'), 'a dot is a dot');
});

test('scope: files inside, outside, and no Scope declared', () => {
  const scope = scopeOf('Parent: #1\nScope: scripts/**, .github/workflows/test.yml\n');
  assert.deepStrictEqual(scope, ['scripts/**', '.github/workflows/test.yml']);
  const found = configChanges(['.github/workflows/test.yml', '.github/workflows/release.yml', '.haku/verify.json'], { scope });
  assert.deepStrictEqual(found.map(f => [f.file, f.inScope]), [['.github/workflows/test.yml', true], ['.github/workflows/release.yml', false], ['.haku/verify.json', false]]);
  assert.deepStrictEqual(configChanges(['.haku/verify.json']).map(f => f.inScope), [null]);
  assert.strictEqual(scopeOf('no scope here'), null);
  assert.strictEqual(scopeOf('Scope:   \n'), null);
  assert.strictEqual(scopeOf('Scope:\nVerify-Kind: T1'), null, 'an empty Scope does not read the next line');
  assert.strictEqual(scopeOf('Scope:\nsrc/**'), null, 'not even a line that looks like a pattern');
});

test('a Scope line hidden in a comment or a code block is not read', () => {
  assert.strictEqual(scopeOf('<!--\nScope: **\n-->\nbody'), null);
  assert.strictEqual(scopeOf('```\nScope: **\n```'), null);
});

test('the approval text puts out-of-scope files first and says so', () => {
  const found = configChanges(['.haku/verify.json', '.github/workflows/test.yml', 'a/.eslintrc'], { scope: ['.github/workflows/**'] });
  const text = renderChanges(found);
  assert.match(text, /^검사 설정 변경 3개 \(범위 밖 2개/);
  const lines = text.trim().split('\n');
  assert.deepStrictEqual(lines.slice(1), ['  - 범위 밖 .haku/verify.json (규칙: .haku/**)', '  - 범위 밖 a/.eslintrc (규칙: .eslintrc*)', '  - 범위 안 .github/workflows/test.yml (규칙: .github/workflows/**)']);
  assert.strictEqual(renderChanges([]), '검사 설정 변경: 없음\n');
  assert.match(renderChanges(configChanges(['.haku/config.json'])), /범위 미선언 \.haku\/config\.json/);
});

test('the host lists every changed file of a pull request, with renames, and refuses a full list', () => {
  const rows = n => Array.from({ length: n }, (_, i) => ({ filename: `f${i}.js`, status: 'modified' }));
  const host = (all, calls = []) => createGitHubHost({ repo: 'o/r', perPage: 100, exec: (bin, args) => {
    calls.push(args[1]);
    const page = Number(/[&?]page=(\d+)/.exec(args[1])[1]);
    return JSON.stringify(all.slice((page - 1) * 100, page * 100));
  } });
  const calls = [];
  const got = host([{ filename: 'new.js', previous_filename: 'old.js', status: 'renamed' }, ...rows(120)], calls).prFiles(7);
  assert.strictEqual(got.length, 121, 'both pages are read');
  assert.deepStrictEqual(got[0], { filename: 'new.js', previous_filename: 'old.js', status: 'renamed', patch: null });
  assert.match(calls[0], /repos\/o\/r\/pulls\/7\/files/);
  assert.throws(() => host(rows(3000)).prFiles(7), /3000|partial|limit/);
});

test('more places a check can be weakened are watched, and package.json only for test, lint or format settings', () => {
  const places = ['Makefile', 'justfile', '.github/CODEOWNERS', 'CODEOWNERS', 'pyproject.toml', 'vite.config.ts', 'babel.config.js', 'rustfmt.toml', 'phpunit.xml.dist', '.coveragerc', 'lint-staged.config.js'];
  assert.deepStrictEqual(names(places), places);
  const patch = lines => `@@ -1,3 +1,3 @@\n context\n${lines.join('\n')}\n context`;
  const pkg = lines => configChanges([{ filename: 'package.json', status: 'modified', patch: patch(lines) }]).map(f => f.file);
  assert.deepStrictEqual(pkg(['-    "test": "jest"', '+    "test": "echo skipped"']), ['package.json']);
  assert.deepStrictEqual(pkg(['+  "eslintConfig": {}']), ['package.json']);
  assert.deepStrictEqual(pkg(['-    "left-pad": "1.0.0"', '+    "left-pad": "1.1.0"']), [], 'a dependency bump is not a settings change');
  assert.deepStrictEqual(pkg(['+++ b/package.json', '--- a/package.json']), []);
  assert.deepStrictEqual(configChanges([{ filename: 'package.json', status: 'modified', patch: null }]).map(f => f.file), ['package.json'], 'no diff given: reported');
  assert.deepStrictEqual(configChanges([{ filename: 'pkg/package.json', status: 'removed' }]).map(f => f.file), ['pkg/package.json']);
});

test('a deletion is named, because deleting a check is the strongest weakening', () => {
  const found = configChanges([{ filename: '.github/workflows/test.yml', status: 'removed' }, { filename: '.eslintrc.json', status: 'modified' }]);
  assert.deepStrictEqual(found.map(f => f.status), ['removed', 'modified']);
  const text = renderChanges(found);
  assert.match(text, /삭제 \.github\/workflows\/test\.yml/);
  assert.match(text, /삭제 1개: 검사 자체를 없애는 변경일 수 있습니다/);
  const renamed = renderChanges(configChanges([{ filename: '.eslintrc.yml', previous_filename: '.eslintrc.json', status: 'renamed' }]));
  assert.match(renamed, /이름 변경 \.eslintrc\.yml/);
  assert.match(renamed, /이름 변경\(이전 이름\) \.eslintrc\.json/);
});

test('Scope written the usual ways: trailing slash, leading slash, backticks, braces, remarks in brackets', () => {
  const inside = (scopeLine, file) => configChanges([file], { patterns: ['**'], scope: scopeOf(`Scope: ${scopeLine}`) })[0].inScope;
  assert.strictEqual(inside('scripts/', 'scripts/a.js'), true);
  assert.strictEqual(inside('scripts', 'scripts/a.js'), true, 'a plain folder name covers the folder');
  assert.strictEqual(inside('`scripts/**`', 'scripts/a/b.js'), true);
  assert.strictEqual(inside('/scripts/**', 'scripts/a.js'), true);
  assert.strictEqual(inside('{scripts,tests}/**', 'tests/x.js'), true);
  assert.strictEqual(inside('{scripts,tests}/**', 'docs/x.md'), false);
  assert.strictEqual(inside('scripts/** (only scripts, tests)', 'scripts/a.js'), true);
  assert.strictEqual(inside('scripts/** (only scripts, tests)', 'tests/a.js'), false, 'the remark is not a pattern');
  assert.strictEqual(inside('scripts/**', 'scripts2/a.js'), false);
});

test('in a Scope a name without "/" is a root path: *.json does not cover every folder', () => {
  const scope = scopeOf('Scope: *.json');
  const found = configChanges(['package.json', '.haku/verify.json', 'a/b/tsconfig.json'], { patterns: ['**'], scope });
  assert.deepStrictEqual(found.map(f => [f.file, f.inScope]), [['package.json', true], ['.haku/verify.json', false], ['a/b/tsconfig.json', false]]);
});

test('Scope entries that are sentences are reported as ignored and never match', () => {
  const { globs, ignored } = scopeParts('Scope: scripts/**, the whole thing, tests/**');
  assert.deepStrictEqual(globs, ['scripts/**', 'tests/**']);
  assert.deepStrictEqual(ignored, ['the whole thing']);
  assert.deepStrictEqual(scopeParts('Scope: only words here').globs, null);
});

test('watchFiles entries with a leading or trailing slash still match', () => {
  const patterns = patternsFrom({ watchFiles: ['/build/**', 'ci/', './tools/x.sh'] });
  assert.deepStrictEqual(names(['build/a.js', 'ci/run.sh', 'tools/x.sh'], { patterns }), ['build/a.js', 'ci/run.sh', 'tools/x.sh']);
});

// ---- the command's logic, through a fake host and a real worker record --------------------------------------------

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { prConfigChanges } = require('../scripts/lib/pr-config');

function repoWithWorker(record, config) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-prconfig-'));
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  const gitDir = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
  const dir = path.join(path.resolve(repo, gitDir), 'haku');
  fs.mkdirSync(dir, { recursive: true });
  if (record) fs.writeFileSync(path.join(dir, 'worker-5.json'), JSON.stringify(record));
  if (config) {
    fs.mkdirSync(path.join(repo, '.haku'));
    fs.writeFileSync(path.join(repo, '.haku', 'config.json'), JSON.stringify(config));
  }
  return repo;
}
const fakePrHost = (body, files) => ({ getIssue: () => ({ body }), prFiles: () => files });

test('the Scope recorded when the worker started wins over the issue text now, and the change is reported', () => {
  const repo = repoWithWorker({ issue: 5, branch: 'task/5-x', path: '/x', base: 'main', scope: ['src/**'] });
  const notes = [];
  const found = prConfigChanges({ host: fakePrHost('Scope: **', ['.github/workflows/test.yml']), cwd: repo, pr: 9, issue: 5, warn: m => notes.push(m) });
  assert.deepStrictEqual(found.map(f => [f.file, f.inScope]), [['.github/workflows/test.yml', false]], 'a widened Scope does not hide the file');
  assert.match(notes.join('\n'), /Scope on the issue changed/);
});

test('without a worker record the issue text is used; without an issue every file is "not declared"', () => {
  const repo = repoWithWorker(null);
  const files = ['.github/workflows/test.yml'];
  assert.deepStrictEqual(prConfigChanges({ host: fakePrHost('Scope: .github/**', files), cwd: repo, pr: 9, issue: 5 }).map(f => f.inScope), [true]);
  assert.deepStrictEqual(prConfigChanges({ host: fakePrHost('Scope: src/**', files), cwd: repo, pr: 9, issue: 5 }).map(f => f.inScope), [false]);
  assert.deepStrictEqual(prConfigChanges({ host: fakePrHost('', files), cwd: repo, pr: 9 }).map(f => f.inScope), [null]);
});

test('watchFiles of the repository are added; a Scope entry that is a sentence is reported', () => {
  const repo = repoWithWorker(null, { watchFiles: ['build/**'] });
  const notes = [];
  const found = prConfigChanges({ host: fakePrHost('Scope: build/**, whatever this is', ['build/x.sh', 'src/a.js']), cwd: repo, pr: 9, issue: 5, warn: m => notes.push(m) });
  assert.deepStrictEqual(found.map(f => f.file), ['build/x.sh']);
  assert.match(notes.join('\n'), /"whatever this is" is not a path pattern/);
});

test('a bad watchFiles value is reported by the config reader and ignored', () => {
  const repo = repoWithWorker(null, { watchFiles: 'build/**' });
  const notes = [];
  prConfigChanges({ host: fakePrHost('', []), cwd: repo, pr: 9, warn: m => notes.push(m) });
  assert.match(notes.join('\n'), /watchFiles .* must be a list/);
});

test('startWorker records the Scope the task declares', () => {
  const { startWorker } = require('../scripts/lib/worker');
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-startscope-'));
  const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'x');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
  const host = { getIssue: () => ({ number: 5, url: 'https://github.com/o/r/issues/5', state: 'open', body: 'Scope: src/**, tests/**', labels: [{ name: 'haku' }, { name: 'type:task' }] }) };
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-home-'));
  const record = startWorker({ cwd: repo, issue: 5, title: 'x', base: 'main', home, host });
  assert.deepStrictEqual(record.scope, ['src/**', 'tests/**']);
});
