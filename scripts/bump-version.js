#!/usr/bin/env node
'use strict';

// Usage: bump-version.js [base-ref]   (default origin/main; run in a checkout that has <base-ref>)
// Sets plugin.json and marketplace.json to the base's patch + 1 when shipped files changed and the
// version does not already beat the base. Safe to run again after a rebase: it never lowers or double-bumps.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { targetVersion } = require('./lib/version-check');

const git = (...args) => {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout;
};

// Replace only the version value so the files keep their formatting.
const setVersion = (file, name, version) => {
  const text = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(text);
  const holder = json.plugins ? json.plugins.find(p => p.name === name) : json;
  if (!holder) throw new Error(`${file} has no entry for "${name}"`);
  const re = new RegExp(`("name"\\s*:\\s*"${name}"[^{}]*?"version"\\s*:\\s*")[^"]+(")`);
  const alt = /("version"\s*:\s*")[^"]+(")/;
  const next = re.test(text) ? text.replace(re, `$1${version}$2`) : text.replace(alt, `$1${version}$2`);
  fs.writeFileSync(file, next);
};

function main(base = 'origin/main') {
  const root = path.join(__dirname, '..');
  const pluginFile = path.join(root, '.claude-plugin/plugin.json');
  const marketFile = path.join(root, '.claude-plugin/marketplace.json');
  const plugin = JSON.parse(fs.readFileSync(pluginFile, 'utf8'));
  const baseVersion = JSON.parse(git('show', `${base}:.claude-plugin/plugin.json`)).version;
  const changedFiles = git('diff', '--name-only', '--no-renames', `${base}...HEAD`).split('\n').filter(Boolean);
  const version = targetVersion({ changedFiles, baseVersion, version: plugin.version });
  setVersion(pluginFile, plugin.name, version);
  setVersion(marketFile, plugin.name, version);
  console.log(`[version] ${baseVersion} (base) -> ${version}`);
  return 0;
}

try {
  process.exit(main(process.argv[2]));
} catch (err) {
  console.error(`[version] ${err.message}`);
  process.exit(1);
}
