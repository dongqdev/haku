'use strict';

const { readableText } = require('./model');

// Files through which a change could make its own checks easier to pass: lint and format settings, type checks,
// test runner settings, CI, git hooks, code owners and haku's own settings. A change to one is not wrong, but the
// person who approves the merge should see it. This is a warning list, never a block (a broken block would lock
// people out). Patterns without a "/" match the file name anywhere in the tree.
const DEFAULT_PATTERNS = [
  '.eslintrc*', 'eslint.config.*', '.eslintignore', '.prettierrc*', 'prettier.config.*', '.prettierignore', '.editorconfig',
  'biome.json', 'biome.jsonc', '.stylelintrc*', 'stylelint.config.*', '.markdownlint*', '.golangci.*', '.rubocop.yml',
  'ruff.toml', '.ruff.toml', '.flake8', '.pylintrc', 'mypy.ini', 'tox.ini', 'setup.cfg', '.pre-commit-config.yaml', 'tslint.json',
  'rustfmt.toml', '.rustfmt.toml', 'clippy.toml', '.clippy.toml', 'phpstan.neon*', 'phpunit.xml*', '.swiftlint.yml', 'deno.json', 'deno.jsonc',
  '.lintstagedrc*', 'lint-staged.config.*', '.babelrc*', 'babel.config.*', 'pyproject.toml', '.coveragerc',
  'tsconfig*.json', 'jsconfig*.json',
  'jest.config.*', 'vitest.config.*', 'vitest.workspace.*', 'vite.config.*', '.mocharc*', 'karma.conf.*', 'playwright.config.*', 'cypress.config.*', 'pytest.ini', 'conftest.py', '.nycrc*', '.c8rc*', 'codecov.yml', '.codecov.yml',
  'Makefile', 'justfile', 'Taskfile.yml', 'Taskfile.yaml',
  '.github/workflows/**', '.github/actions/**', '.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS',
  '.gitlab-ci.yml', '.circleci/**', 'azure-pipelines.yml', 'Jenkinsfile', '.travis.yml',
  '.husky/**', '.githooks/**', 'lefthook.yml',
  '.haku/**'
];

// package.json holds the test, lint and format settings of a JavaScript project next to ordinary dependencies, so
// it is reported only when a changed line touches such a key (or when GitHub gave no diff to look at).
const PACKAGE_JSON = 'package.json';
const PACKAGE_KEYS = /"(?:scripts|jest|eslintConfig|prettier|lint-staged|husky|mocha|ava|vitest|c8|nyc|babel|stylelint)"\s*:|"(?:test[^"]*|lint[^"]*|typecheck|check|verify|precommit|pretest|posttest|prepare)"\s*:/;

const escapeRe = s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

// glob -> RegExp: "**" crosses folders, "*" and "?" stay inside one name.
function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i += 1;
      if (glob[i + 1] === '/') { i += 1; out += '(?:.*/)?'; } else out += '.*';
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += escapeRe(c);
  }
  return new RegExp(`^${out}$`, 'i');
}

// One level of {a,b}: "x/{a,b}/**" -> ["x/a/**", "x/b/**"].
function expandBraces(glob) {
  const m = glob.match(/^(.*?)\{([^{}]*)\}(.*)$/);
  if (!m) return [glob];
  return m[2].split(',').flatMap(alt => expandBraces(`${m[1]}${alt.trim()}${m[3]}`));
}

// A tidy glob: no quotes or backticks, no leading "/" or "./", a trailing "/" means everything below. null when
// nothing usable is left.
function tidy(raw) {
  let g = String(raw).trim().replace(/^[`'"]+|[`'"]+$/g, '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (!g) return null;
  if (g.endsWith('/')) g += '**';
  return g;
}

// Matches a path. A name without "/" matches at any depth when `anywhere` is set (watch patterns); for a task's
// Scope it is a path from the root, so `*.json` does not cover every folder. A scope entry that is a plain name
// (no wildcard) also covers the folder of that name.
function matcher(glob, { anywhere = true } = {}) {
  const g = tidy(glob);
  if (g === null) return () => false;
  const tests = expandBraces(g).flatMap(one => {
    const list = [globToRegExp(one)];
    if (!anywhere && !/[*?]/.test(one)) list.push(globToRegExp(`${one}/**`));
    return list.map(re => (one.includes('/') || !anywhere ? file => re.test(file) : file => re.test(file.split('/').pop())));
  });
  return file => tests.some(t => t(file));
}

const normalize = file => String(file).replace(/\\/g, '/').replace(/^\.\//, '');

// Extra patterns the repository adds in .haku/config.json ("watchFiles"). They only add to the defaults, so a
// pull request cannot switch a default off by editing the file.
function patternsFrom(config) {
  const extra = Array.isArray(config && config.watchFiles) ? config.watchFiles.filter(p => typeof p === 'string' && tidy(p)).map(tidy) : [];
  return [...DEFAULT_PATTERNS, ...extra];
}

// "Scope:" of the task issue: comma separated globs (a comma inside braces or a bracketed remark stays put).
// `ignored` are entries that cannot be read as a path pattern (a sentence, for example). globs is null when the
// issue declares none.
function scopeParts(body) {
  const m = readableText(body || '').match(/^Scope:[ \t]*(.+)$/im);
  if (!m) return { globs: null, ignored: [] };
  const text = m[1].replace(/\([^)]*\)/g, ' ');
  const entries = [];
  let depth = 0;
  let cur = '';
  for (const c of text) {
    if (c === '{') depth += 1;
    if (c === '}') depth = Math.max(0, depth - 1);
    if (c === ',' && depth === 0) { entries.push(cur); cur = ''; } else cur += c;
  }
  entries.push(cur);
  const globs = [];
  const ignored = [];
  for (const raw of entries) {
    const g = tidy(raw);
    if (g === null) continue;
    if (/\s/.test(g)) ignored.push(raw.trim()); else globs.push(g);
  }
  return { globs: globs.length ? globs : null, ignored };
}

const scopeOf = body => scopeParts(body).globs;

// Changed files (a rename counts under both names) that touch a watched file, each with the rule that matched, how
// it changed and whether the task's Scope allows it. `files` are {filename, previous_filename?, status?, patch?}
// rows or plain paths.
function configChanges(files, { patterns = DEFAULT_PATTERNS, scope = null } = {}) {
  const watched = patterns.map(p => ({ p, test: matcher(p) }));
  const inScope = scope ? scope.map(g => matcher(g, { anywhere: false })) : null;
  const found = [];
  const seen = new Set();
  for (const row of files) {
    const plain = typeof row === 'string';
    const status = plain ? 'modified' : (row.status || 'modified');
    const names = plain ? [row] : [row.filename, row.previous_filename].filter(Boolean);
    for (const raw of names) {
      const file = normalize(raw);
      if (seen.has(file)) continue;
      let rule = (watched.find(w => w.test(file)) || {}).p;
      if (!rule && file.split('/').pop().toLowerCase() === PACKAGE_JSON) {
        const patch = plain ? null : row.patch;
        const changedLines = typeof patch === 'string' ? patch.split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)) : null;
        if (changedLines === null || changedLines.some(l => PACKAGE_KEYS.test(l)) || status === 'removed') rule = `${PACKAGE_JSON} (test, lint or format settings)`;
      }
      if (!rule) continue;
      seen.add(file);
      found.push({ file, rule, status: raw === row.previous_filename ? 'renamed-from' : status, inScope: inScope ? inScope.some(t => t(file)) : null });
    }
  }
  return found;
}

const HOW = { removed: '삭제 ', 'renamed-from': '이름 변경(이전 이름) ', renamed: '이름 변경 ', added: '추가 ' };

// Text for the merge-approval screen. Out-of-scope changes come first and are marked; a deleted check is named.
function renderChanges(found) {
  if (!found.length) return '검사 설정 변경: 없음\n';
  const rank = f => (f.inScope === false ? 0 : f.inScope === null ? 1 : 2);
  const rows = [...found].sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file));
  const mark = f => (f.inScope === false ? '범위 밖 ' : f.inScope === null ? '범위 미선언 ' : '범위 안 ');
  const lines = rows.map(f => `  - ${mark(f)}${HOW[f.status] || ''}${f.file} (규칙: ${f.rule})`);
  const out = found.filter(f => f.inScope === false).length;
  const removed = found.filter(f => f.status === 'removed').length;
  const extra = [out ? `범위 밖 ${out}개: 태스크의 Scope에 없는 파일입니다, 먼저 확인하세요` : '', removed ? `삭제 ${removed}개: 검사 자체를 없애는 변경일 수 있습니다` : ''].filter(Boolean);
  const head = `검사 설정 변경 ${found.length}개${extra.length ? ` (${extra.join('; ')})` : ''}`;
  return `${head}\n${lines.join('\n')}\n`;
}

module.exports = { DEFAULT_PATTERNS, matcher, patternsFrom, scopeOf, scopeParts, configChanges, renderChanges };
