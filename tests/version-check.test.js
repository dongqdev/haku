'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { needsBump, compareVersions, manifestProblems, bumpProblems } = require('../scripts/lib/version-check');

test('everything except docs, tests and CI requires a version bump', () => {
  assert.strictEqual(needsBump(['hooks/hooks.json']), true);
  assert.strictEqual(needsBump(['commands/x.md']), true);
  assert.strictEqual(needsBump(['.mcp.json']), true);
  assert.strictEqual(needsBump(['skills/plan/SKILL.md']), true);
  assert.strictEqual(needsBump(['agents/worker.md']), true);
  assert.strictEqual(needsBump(['scripts/lib/model.js']), true);
  assert.strictEqual(needsBump(['.claude-plugin/plugin.json']), true);
  assert.strictEqual(needsBump(['scripts\\lib\\model.js']), true);
  assert.strictEqual(needsBump(['LICENSE-extra.sh']), true);
  assert.strictEqual(needsBump(['README.md.js']), true);
  assert.strictEqual(needsBump(['LICENSES/a.txt']), true);
  assert.strictEqual(needsBump(['.gitignore-x/a']), true);
  assert.strictEqual(needsBump(['README.md', 'LICENSE', 'tests/a.test.js', '.github/workflows/test.yml']), false);
});

test('translated READMEs are documentation, look-alikes are not', () => {
  assert.strictEqual(needsBump(['README.en.md', 'README.ko-KR.md', 'README.zh-Hans.md']), false);
  for (const f of ['README.en.md.js', 'README.en.sh', 'README.english.md', 'docs/README.en.md', 'READMEen.md', 'README..md']) {
    assert.strictEqual(needsBump([f]), true, f);
  }
});

test('a shipped change with an unchanged version is a problem, a raised version is not', () => {
  const changedFiles = ['skills/plan/SKILL.md'];
  assert.match(bumpProblems({ changedFiles, baseVersion: '0.2.0', version: '0.2.0' })[0], /still 0\.2\.0/);
  assert.deepStrictEqual(bumpProblems({ changedFiles, baseVersion: '0.2.0', version: '0.2.1' }), []);
  assert.deepStrictEqual(bumpProblems({ changedFiles: ['README.md'], baseVersion: '0.2.0', version: '0.2.0' }), []);
});

test('manifest versions must match', () => {
  const plugin = { name: 'p', version: '1.0.0' };
  assert.deepStrictEqual(manifestProblems(plugin, { plugins: [{ name: 'p', version: '1.0.0' }] }), []);
  assert.match(manifestProblems(plugin, { plugins: [{ name: 'p', version: '0.9.0' }] })[0], /mismatch/);
  assert.match(manifestProblems(plugin, { plugins: [] })[0], /no entry/);
});

test('this repository\'s own manifests agree', () => {
  const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  assert.deepStrictEqual(manifestProblems(read('.claude-plugin/plugin.json'), read('.claude-plugin/marketplace.json')), []);
});

test('the version may not go down or stop being x.y.z', () => {
  const changedFiles = ['skills/plan/SKILL.md'];
  assert.match(bumpProblems({ changedFiles, baseVersion: '0.2.0', version: '0.1.9' })[0], /lower/);
  assert.match(bumpProblems({ changedFiles, baseVersion: '0.2.0', version: 'banana' })[0], /not x\.y\.z/);
  assert.match(bumpProblems({ changedFiles: ['README.md'], baseVersion: '0.2.0', version: '0.1.0' })[0], /lower/);
  assert.strictEqual(compareVersions('0.10.0', '0.9.0') > 0, true);
});
