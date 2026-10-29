'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// The repository root of `cwd` (a worker worktree and a subfolder both resolve to their own checkout root).
function repoRoot(cwd) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : cwd;
}

// .haku/config.json of the checkout we run in. A missing file means defaults; a file that cannot be
// parsed, or a value of the wrong type, is reported instead of silently falling back.
function readConfig(cwd = process.cwd()) {
  const file = path.join(repoRoot(cwd), '.haku', 'config.json');
  const warnings = [];
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { config: {}, warnings, file };
  }
  let config = {};
  try {
    config = JSON.parse(raw);
  } catch (err) {
    warnings.push(`${file} is not valid JSON (${err.message}); defaults are used`);
    return { config: {}, warnings, file };
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    warnings.push(`${file} must contain a JSON object; defaults are used`);
    return { config: {}, warnings, file };
  }
  if ('titlePrefix' in config && typeof config.titlePrefix !== 'boolean') {
    warnings.push(`titlePrefix in ${file} must be true or false, not ${JSON.stringify(config.titlePrefix)}; the prefix stays on`);
  }
  return { config, warnings, file };
}

// Only a real boolean false switches the prefix off.
const titlePrefixOn = config => config.titlePrefix !== false;

module.exports = { readConfig, repoRoot, titlePrefixOn };
