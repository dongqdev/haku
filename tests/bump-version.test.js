'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { targetVersion } = require('../scripts/lib/version-check');

const scripts = path.join(__dirname, '..', 'scripts');

test('targetVersion: base patch + 1 only for shipped changes that do not already beat the base', () => {
  const shipped = ['skills/build/SKILL.md'];
  assert.strictEqual(targetVersion({ changedFiles: shipped, baseVersion: '0.2.0', version: '0.2.0' }), '0.2.1');
  assert.strictEqual(targetVersion({ changedFiles: shipped, baseVersion: '0.2.5', version: '0.2.3' }), '0.2.6');
  assert.strictEqual(targetVersion({ changedFiles: shipped, baseVersion: '0.2.0', version: '0.2.1' }), '0.2.1');
  assert.strictEqual(targetVersion({ changedFiles: ['README.md'], baseVersion: '0.2.0', version: '0.2.0' }), '0.2.0');
});

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
}

const write = (repo, file, content) => {
  const full = path.join(repo, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
};

const manifests = v => ({
  plugin: `{\n  "name": "p",\n  "version": "${v}"\n}\n`,
  market: `{\n  "name": "m",\n  "plugins": [\n    { "name": "p", "description": "d", "version": "${v}" }\n  ]\n}\n`
});

test('bump-version.js fixes both manifests, then check-version.js passes; a rerun changes nothing', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-bump-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.cpSync(scripts, path.join(repo, 'scripts'), { recursive: true });
  const m = manifests('0.2.0');
  write(repo, '.claude-plugin/plugin.json', m.plugin);
  write(repo, '.claude-plugin/marketplace.json', m.market);
  write(repo, 'skills/build/SKILL.md', 'build');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'checkout', '-q', '-b', 'pr');
  write(repo, 'skills/build/SKILL.md', 'changed');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'change');
  const run = script => spawnSync(process.execPath, [path.join(repo, 'scripts', script), 'main'], { cwd: repo, encoding: 'utf8' });

  const bad = run('check-version.js');
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stderr, /bump-version\.js/);

  assert.strictEqual(run('bump-version.js').status, 0);
  const after = manifests('0.2.1');
  assert.strictEqual(fs.readFileSync(path.join(repo, '.claude-plugin/plugin.json'), 'utf8'), after.plugin);
  assert.strictEqual(fs.readFileSync(path.join(repo, '.claude-plugin/marketplace.json'), 'utf8'), after.market);
  assert.strictEqual(run('check-version.js').status, 0);

  run('bump-version.js');
  assert.strictEqual(fs.readFileSync(path.join(repo, '.claude-plugin/plugin.json'), 'utf8'), after.plugin);
});
