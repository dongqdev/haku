'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CONFIG_PATH = '.ecc-harness/verify.json';
const DEFAULT_TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[a-z0-9]+$|_test\.[a-z0-9]+$/i;

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

// The command to run is read from the BASE branch, never from the worker's branch or
// the issue text. Otherwise a worker could edit verify.json to `true` and pass itself.
function loadConfig({ cwd, base, trustWorkingCopy = false }) {
  let raw;
  if (trustWorkingCopy) {
    raw = fs.readFileSync(path.join(cwd, CONFIG_PATH), 'utf8');
  } else {
    const r = git(['show', `${base}:${CONFIG_PATH}`], cwd);
    if (r.status !== 0) {
      throw new Error(`${CONFIG_PATH} not found on ${base}; commit it to the default branch first`);
    }
    raw = r.stdout;
  }
  const config = JSON.parse(raw);
  if (!config.profiles || typeof config.profiles !== 'object') {
    throw new Error(`${CONFIG_PATH}: "profiles" object is required`);
  }
  return config;
}

function checkTamper({ cwd, base, testFile = DEFAULT_TEST_FILE }) {
  const deleted = [];
  const weakened = [];
  const names = git(['diff', '--name-status', `${base}...HEAD`], cwd);
  if (names.status !== 0) throw new Error(`git diff against ${base} failed: ${names.stderr.trim()}`);
  for (const line of names.stdout.split('\n').filter(Boolean)) {
    const [code, file] = line.split('\t');
    if (code === 'D' && testFile.test(file)) deleted.push(file);
  }
  const nums = git(['diff', '--numstat', `${base}...HEAD`], cwd);
  for (const line of nums.stdout.split('\n').filter(Boolean)) {
    const [added, removed, file] = line.split('\t');
    if (!testFile.test(file) || deleted.includes(file)) continue;
    if (Number(removed) > Number(added)) weakened.push(file);
  }
  return { deleted, weakened };
}

function spawnProfile(cmd, cwd, timeoutMs) {
  const [bin, ...args] = cmd;
  // Windows ships npm/npx/pnpm/yarn as .cmd shims that cannot be spawned without a shell.
  // Commands come from the base-branch config (reviewed), not from issue text.
  const shim = process.platform === 'win32' && /^(npm|npx|pnpm|yarn)$/i.test(bin);
  return spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    shell: shim,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024
  });
}

function countTests(output, pattern) {
  if (!pattern) return null;
  const all = [...output.matchAll(new RegExp(pattern, 'g'))];
  return all.length ? Number(all[all.length - 1][1]) : 0;
}

// pass   : exit 0, enough tests ran, no test file deleted or net-shrunk
// review : exit 0 but a test file lost more lines than it gained (orchestrator must look)
// fail   : non-zero exit, too few tests ran, or a test file was deleted
function verify({ profile, cwd, base, trustWorkingCopy = false, timeoutMs = 600000 }) {
  const config = loadConfig({ cwd, base, trustWorkingCopy });
  const p = config.profiles[profile];
  if (!p) throw new Error(`unknown verify profile "${profile}" (defined: ${Object.keys(config.profiles).join(', ') || 'none'})`);
  if (!Array.isArray(p.cmd) || p.cmd.length === 0) throw new Error(`profile "${profile}": cmd must be a non-empty array`);
  if (p.minTests && !p.countPattern) {
    throw new Error(`profile "${profile}": minTests needs countPattern (regex with one capture group)`);
  }

  const run = spawnProfile(p.cmd, path.join(cwd, p.cwd || '.'), timeoutMs);
  const output = `${run.stdout || ''}${run.stderr || ''}`;
  const exitCode = run.status === null ? -1 : run.status;
  const testCount = countTests(output, p.countPattern);
  const tamper = checkTamper({ cwd, base, testFile: p.testFilePattern ? new RegExp(p.testFilePattern, 'i') : DEFAULT_TEST_FILE });

  const reasons = [];
  if (exitCode !== 0) reasons.push(`command exited ${exitCode}`);
  if (p.minTests && (testCount === null || testCount < p.minTests)) {
    reasons.push(`only ${testCount} test(s) ran, need at least ${p.minTests}`);
  }
  if (tamper.deleted.length) reasons.push(`test file(s) deleted: ${tamper.deleted.join(', ')}`);

  let status = 'pass';
  if (reasons.length) status = 'fail';
  else if (tamper.weakened.length) {
    status = 'review';
    reasons.push(`test file(s) lost more lines than they gained: ${tamper.weakened.join(', ')}`);
  }
  return { status, exitCode, testCount, tamper, reasons };
}

module.exports = { verify, loadConfig, checkTamper, countTests, CONFIG_PATH };
