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
  if ('workerMode' in config && !WORKER_MODES.includes(config.workerMode)) {
    warnings.push(`workerMode in ${file} must be one of ${WORKER_MODES.join(', ')}, not ${JSON.stringify(config.workerMode)}; "subagent" is used`);
  }
  if ('workerPermissionMode' in config && !SAFE_PERMISSION_MODES.includes(config.workerPermissionMode)) {
    warnings.push(`workerPermissionMode in ${file} must be one of ${SAFE_PERMISSION_MODES.join(', ')}, not ${JSON.stringify(config.workerPermissionMode)}; `
      + `the user's own setting is used (modes that skip approvals such as auto or bypassPermissions cannot be switched on from a file in the repository, because a pull request could change that file; set them in your own Claude settings if you really want them)`);
  }
  if ('mergeMode' in config && !['approve-each', 'auto-when-verified'].includes(config.mergeMode)) {
    warnings.push(`mergeMode in ${file} must be approve-each or auto-when-verified, not ${JSON.stringify(config.mergeMode)}; approve-each is used`);
  }
  if ('watchFiles' in config && !(Array.isArray(config.watchFiles) && config.watchFiles.every(p => typeof p === 'string' && p.trim()))) {
    warnings.push(`watchFiles in ${file} must be a list of path patterns; it is ignored`);
  }
  if ('workerRemoteControl' in config && typeof config.workerRemoteControl !== 'boolean') {
    warnings.push(`workerRemoteControl in ${file} must be true or false; it stays on`);
  }
  return { config, warnings, file };
}

const WORKER_MODES = ['subagent', 'session'];
// Modes that keep asking or restrict the worker. Approval-skipping modes are deliberately absent.
const SAFE_PERMISSION_MODES = ['manual', 'acceptEdits', 'plan', 'dontAsk'];

// How workers run. Defaults: a subagent of the orchestrator; as a session the user's own permission setting
// applies unless a mode is named, and the session also shows up in the Claude app.
function workerSettings(config) {
  return {
    mode: WORKER_MODES.includes(config.workerMode) ? config.workerMode : 'subagent',
    permissionMode: SAFE_PERMISSION_MODES.includes(config.workerPermissionMode) ? config.workerPermissionMode : null,
    remoteControl: config.workerRemoteControl !== false
  };
}

// Only a real boolean false switches the prefix off.
const titlePrefixOn = config => config.titlePrefix !== false;

module.exports = { readConfig, repoRoot, titlePrefixOn, workerSettings, WORKER_MODES, SAFE_PERMISSION_MODES };
