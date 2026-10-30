'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { findInLine } = require('./personal-paths');
const { findHakuRoot, normalizePath, relativeTo } = require('./hook-common');

// Correction sentences: one short sentence the user said to correct the agent, saved by hand (`corrections add`) so a
// retro can look at it later. Nothing is captured automatically. The file lives outside every repository.

const MAX_CHARS = 300;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FILE = 'corrections.jsonl';

// What must never be kept: tokens, keys and passwords (the class name is reported, never the match).
const SECRETS = [
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, 'a GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, 'a GitHub token'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'an API key'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\bBearer[ \t]+[A-Za-z0-9._~+\/=-]{16,}/i, 'a bearer token'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a JSON web token'],
  [/\b(?:password|passwd|pwd|secret|token|api[_-]?key)\b[ \t]*[:=][ \t]*["']?[^\s"']{6,}/i, 'a password, token or key assignment'],
  [/\b[0-9a-fA-F]{32,}\b/, 'a long hex string'],
  [/[A-Za-z0-9+\/_-]{32,}={0,2}/, 'a long base64-like string']
];

// Why a sentence must not be saved: null when it is fine, else a reason class (never the text itself).
function rejectReason(text) {
  if (typeof text !== 'string' || !text.trim()) return 'it is empty';
  if ([...text].length > MAX_CHARS) return `it is longer than ${MAX_CHARS} characters`;
  for (const [re, what] of SECRETS) if (re.test(text)) return `it looks like ${what}`;
  if (findInLine(text).length) return 'it names a personal path';
  return null;
}

function dataDir(env = process.env) {
  return env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.haku');
}

// Real path of the deepest existing part of `p` (symlinks resolved), the missing tail appended as written.
function realish(p) {
  let cur = path.resolve(p);
  const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync(cur), ...tail); } catch (err) { /* go up */ }
    const up = path.dirname(cur);
    if (up === cur) return path.resolve(p);
    tail.unshift(path.basename(cur));
    cur = up;
  }
}

function repoRoots(cwd) {
  const roots = [];
  const haku = findHakuRoot(cwd);
  if (haku) roots.push(haku);
  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  if (git.status === 0 && git.stdout.trim()) roots.push(git.stdout.trim());
  return roots;
}

function insideRoot(root, dir) {
  const r = normalizePath(realish(root));
  const d = normalizePath(realish(dir));
  return d.toLowerCase() === r.toLowerCase() || relativeTo(r, d) !== null;
}

// The folder to write into; throws when it lies inside the current repository (a record must not reach a commit).
function safeDir(cwd, env) {
  const dir = dataDir(env);
  if (repoRoots(cwd).some(root => insideRoot(root, dir))) {
    throw new Error('the corrections folder lies inside a repository; set CLAUDE_PLUGIN_DATA to a folder outside it');
  }
  return dir;
}

// Entries younger than 30 days; lines that cannot be read are dropped.
function readEntries(file, now = Date.now()) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (err) { return []; }
  const entries = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      const t = Date.parse(e.time);
      if (typeof e.text === 'string' && Number.isFinite(t) && now - t <= MAX_AGE_MS) entries.push({ time: e.time, text: e.text });
    } catch (err) { /* skip */ }
  }
  return entries;
}

// { saved: true } or { saved: false, reason }. Old lines are removed on every successful write.
function addCorrection(text, { cwd = process.cwd(), env = process.env, now = Date.now() } = {}) {
  const reason = rejectReason(text);
  if (reason) return { saved: false, reason };
  const dir = safeDir(cwd, env);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, FILE);
  const entries = readEntries(file, now);
  entries.push({ time: new Date(now).toISOString(), text });
  fs.writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n', { mode: 0o600 });
  return { saved: true };
}

function listCorrections({ cwd = process.cwd(), env = process.env, now = Date.now() } = {}) {
  return readEntries(path.join(safeDir(cwd, env), FILE), now);
}

function clearCorrections({ cwd = process.cwd(), env = process.env } = {}) {
  const file = path.join(safeDir(cwd, env), FILE);
  const existed = fs.existsSync(file);
  fs.rmSync(file, { force: true });
  return existed;
}

module.exports = { MAX_CHARS, MAX_AGE_MS, FILE, rejectReason, dataDir, addCorrection, listCorrections, clearCorrections };
