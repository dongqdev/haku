#!/usr/bin/env node
'use strict';

// Usage: check-version.js <base-ref>   (run in a checkout that has <base-ref>, e.g. origin/main)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { manifestProblems, bumpProblems } = require('./lib/version-check');

const git = (...args) => {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr.trim()}`);
  return r.stdout;
};

function main(base) {
  if (!base) throw new Error('usage: check-version.js <base-ref>');
  const root = path.join(__dirname, '..');
  const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const plugin = read('.claude-plugin/plugin.json');
  const marketplace = read('.claude-plugin/marketplace.json');

  const baseVersion = JSON.parse(git('show', `${base}:.claude-plugin/plugin.json`)).version;
  const changedFiles = git('diff', '--name-only', '--no-renames', `${base}...HEAD`).split('\n').filter(Boolean);
  const problems = [
    ...manifestProblems(plugin, marketplace),
    ...bumpProblems({ changedFiles, baseVersion, version: plugin.version })
  ];
  if (problems.length) {
    for (const p of problems) console.error(`[version] ${p}`);
    return 1;
  }
  console.log(`[version] ok: ${baseVersion} -> ${plugin.version}`);
  return 0;
}

try {
  process.exit(main(process.argv[2]));
} catch (err) {
  console.error(`[version] ${err.message}`);
  process.exit(1);
}
