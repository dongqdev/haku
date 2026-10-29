'use strict';

// Runs scripts/check-version.js against real git history: base commit on main, then a PR branch.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const scripts = path.join(__dirname, '..', 'scripts');

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
}

function write(repo, file, content) {
  const full = path.join(repo, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

const manifests = version => ({
  plugin: JSON.stringify({ name: 'p', version }),
  market: JSON.stringify({ plugins: [{ name: 'p', version }] })
});

// A repo whose main has the checker, both manifests at 0.2.0 and one skill; the caller edits a branch.
function prRepo(edit) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-version-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.cpSync(scripts, path.join(repo, 'scripts'), { recursive: true });
  const m = manifests('0.2.0');
  write(repo, '.claude-plugin/plugin.json', m.plugin);
  write(repo, '.claude-plugin/marketplace.json', m.market);
  write(repo, 'skills/build/SKILL.md', 'build');
  write(repo, 'README.md', 'readme');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  git(repo, 'checkout', '-q', '-b', 'pr');
  edit(repo);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'change');
  return spawnSync(process.execPath, [path.join(repo, 'scripts', 'check-version.js'), 'main'], { cwd: repo, encoding: 'utf8' });
}

const setVersion = (repo, v) => {
  const m = manifests(v);
  write(repo, '.claude-plugin/plugin.json', m.plugin);
  write(repo, '.claude-plugin/marketplace.json', m.market);
};

test('a README-only change needs no bump', () => {
  assert.strictEqual(prRepo(r => write(r, 'README.md', 'changed')).status, 0);
});

test('a skill change with the same version fails; with a higher version passes', () => {
  const bad = prRepo(r => write(r, 'skills/build/SKILL.md', 'changed'));
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stderr, /still 0\.2\.0/);
  const good = prRepo(r => { write(r, 'skills/build/SKILL.md', 'changed'); setVersion(r, '0.2.1'); });
  assert.strictEqual(good.status, 0, good.stderr);
});

test('moving a skill out of the plugin counts as a change', () => {
  const r = prRepo(repo => {
    fs.mkdirSync(path.join(repo, 'docs'));
    fs.renameSync(path.join(repo, 'skills/build/SKILL.md'), path.join(repo, 'docs/x.md'));
  });
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
});

test('a new top-level directory counts as shipped', () => {
  assert.strictEqual(prRepo(r => write(r, 'hooks/hooks.json', '{}')).status, 1);
});

test('lowering the version or using a non-semver string fails', () => {
  const lower = prRepo(r => { write(r, 'skills/build/SKILL.md', 'changed'); setVersion(r, '0.1.9'); });
  assert.strictEqual(lower.status, 1);
  assert.match(lower.stderr, /lower/);
  const junk = prRepo(r => { write(r, 'skills/build/SKILL.md', 'changed'); setVersion(r, 'banana'); });
  assert.strictEqual(junk.status, 1);
  assert.match(junk.stderr, /not x\.y\.z/);
});

test('differing manifest versions fail', () => {
  const r = prRepo(repo => {
    write(repo, 'skills/build/SKILL.md', 'changed');
    write(repo, '.claude-plugin/plugin.json', manifests('0.3.0').plugin);
  });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /mismatch/);
});
