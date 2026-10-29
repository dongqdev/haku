'use strict';

const { readableText } = require('./model');

// Files through which a change could make its own checks easier to pass: lint and format settings, type checks,
// test runner settings, CI, git hooks and haku's own settings. A change to one is not wrong, but the person who
// approves the merge should see it. This is a warning list, never a block (a broken block would lock people out).
// Patterns without a "/" match the file name anywhere in the tree.
const DEFAULT_PATTERNS = [
  '.eslintrc*', 'eslint.config.*', '.eslintignore', '.prettierrc*', 'prettier.config.*', '.prettierignore', '.editorconfig',
  'biome.json', 'biome.jsonc', '.stylelintrc*', 'stylelint.config.*', '.markdownlint*', '.golangci.*', '.rubocop.yml',
  'ruff.toml', '.ruff.toml', '.flake8', '.pylintrc', 'mypy.ini', 'tox.ini', 'setup.cfg', '.pre-commit-config.yaml', 'tslint.json',
  'tsconfig*.json', 'jsconfig*.json',
  'jest.config.*', 'vitest.config.*', 'vitest.workspace.*', '.mocharc*', 'karma.conf.*', 'playwright.config.*', 'cypress.config.*', 'pytest.ini', 'conftest.py', '.nycrc*', '.c8rc*', 'codecov.yml', '.codecov.yml',
  '.github/workflows/**', '.github/actions/**', '.gitlab-ci.yml', '.circleci/**', 'azure-pipelines.yml', 'Jenkinsfile', '.travis.yml',
  '.husky/**', '.githooks/**', 'lefthook.yml',
  '.haku/**'
];

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

function matcher(glob) {
  const g = String(glob).trim().replace(/^\.\//, '');
  const re = globToRegExp(g);
  // no "/": the name alone is matched, at any depth
  return g.includes('/') ? file => re.test(file) : file => re.test(file.split('/').pop());
}

const normalize = file => String(file).replace(/\\/g, '/').replace(/^\.\//, '');

// Extra patterns the repository adds in .haku/config.json ("watchFiles"). They only add to the defaults, so a
// pull request cannot switch a default off by editing the file.
function patternsFrom(config) {
  const extra = Array.isArray(config && config.watchFiles) ? config.watchFiles.filter(p => typeof p === 'string' && p.trim()) : [];
  return [...DEFAULT_PATTERNS, ...extra];
}

// "Scope:" of the task issue: comma separated globs. null when the issue declares none.
function scopeOf(body) {
  const m = readableText(body || '').match(/^Scope:\s*(.+)$/im);
  if (!m) return null;
  const globs = m[1].split(',').map(s => s.trim()).filter(Boolean);
  return globs.length ? globs : null;
}

// Changed files (a rename counts under both names) that touch a watched file, each with the rule that matched and
// whether the task's Scope allows it. `files` are {filename, previous_filename?} rows or plain paths.
function configChanges(files, { patterns = DEFAULT_PATTERNS, scope = null } = {}) {
  const watched = patterns.map(p => ({ p, test: matcher(p) }));
  const inScope = scope ? scope.map(matcher) : null;
  const found = [];
  const seen = new Set();
  for (const row of files) {
    const names = typeof row === 'string' ? [row] : [row.filename, row.previous_filename].filter(Boolean);
    for (const raw of names) {
      const file = normalize(raw);
      if (seen.has(file)) continue;
      const hit = watched.find(w => w.test(file));
      if (!hit) continue;
      seen.add(file);
      found.push({ file, rule: hit.p, inScope: inScope ? inScope.some(t => t(file)) : null });
    }
  }
  return found;
}

// Text for the merge-approval screen. Out-of-scope changes come first and are marked.
function renderChanges(found) {
  if (!found.length) return '검사 설정 변경: 없음\n';
  const rank = f => (f.inScope === false ? 0 : f.inScope === null ? 1 : 2);
  const rows = [...found].sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file));
  const mark = f => (f.inScope === false ? '범위 밖 ' : f.inScope === null ? '범위 미선언 ' : '범위 안 ');
  const lines = rows.map(f => `  - ${mark(f)}${f.file} (규칙: ${f.rule})`);
  const out = found.filter(f => f.inScope === false).length;
  const head = out ? `검사 설정 변경 ${found.length}개 (범위 밖 ${out}개: 태스크의 Scope에 없는 파일입니다, 먼저 확인하세요)` : `검사 설정 변경 ${found.length}개`;
  return `${head}\n${lines.join('\n')}\n`;
}

module.exports = { DEFAULT_PATTERNS, matcher, patternsFrom, scopeOf, configChanges, renderChanges };
