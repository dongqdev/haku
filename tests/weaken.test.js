'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_PATTERNS, matcher, patternsFrom, scopeOf, configChanges, renderChanges } = require('../scripts/lib/weaken');
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
  assert.match(lines[1], /범위 밖 \.haku\/verify\.json|범위 밖 a\/\.eslintrc/);
  assert.match(lines[3], /범위 안 \.github\/workflows\/test\.yml/);
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
  assert.deepStrictEqual(got[0], { filename: 'new.js', previous_filename: 'old.js', status: 'renamed' });
  assert.match(calls[0], /repos\/o\/r\/pulls\/7\/files/);
  assert.throws(() => host(rows(3000)).prFiles(7), /3000|partial|limit/);
});
