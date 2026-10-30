'use strict';

const fs = require('fs');
const path = require('path');
const { matcher, scopeOf } = require('./weaken');

// Shared pieces of haku's Claude Code hooks. Each function is pure or touches only the folders it is given, so the
// thin hook scripts in hooks/ stay testable. Nothing here runs a shell or reads the network.

const MAX_INPUT = 1024 * 1024;
const RECORD_FILE = 'scope-violations.jsonl';

// Forward slashes, no "./" and a lower-case drive letter ("C:\Repo\a.md" and "c:/Repo/a.md" are the same file).
function normalizePath(p) {
  let s = String(p).replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  s = s.replace(/^([A-Za-z]):/, (m, d) => `${d.toLowerCase()}:`);
  return s.replace(/^\.\//, '').replace(/(.)\/+$/, '$1');
}

// "/" at the start or "x:" means an absolute path (either operating system's shape).
const isAbsolute = p => /^(?:\/|[a-z]:\/)/.test(normalizePath(p));

// Path of `file` below `root`, or null when it lies outside (or cannot be told). ".." parts are resolved first so
// "docs/../scripts/x.js" is judged as scripts/x.js.
function relativeTo(root, file) {
  const r = normalizePath(root);
  let f = normalizePath(file);
  if (!isAbsolute(f)) f = `${r}/${f}`;
  const parts = [];
  for (const part of f.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  const resolved = parts.join('/');
  const prefix = `${r}/`;
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  if (resolved.length <= prefix.length || !same(resolved.slice(0, prefix.length), prefix)) return null;
  return resolved.slice(prefix.length);
}

// The nearest folder at or above `cwd` that holds .haku/config.json, or null (not a haku repository).
function findHakuRoot(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    try {
      if (fs.statSync(path.join(dir, '.haku', 'config.json')).isFile()) return dir;
    } catch (err) { /* keep walking up */ }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// Scope globs of the task in `root`, from the "Scope:" line of .haku-issue.md; null when absent or unreadable.
function readScope(root) {
  try {
    return scopeOf(fs.readFileSync(path.join(root, '.haku-issue.md'), 'utf8'));
  } catch (err) {
    return null;
  }
}

// The task issue file and Claude's own settings are never inside a task's scope, whatever the Scope line says.
const ALWAYS_OUT = [/^\.haku-issue\.md$/i, /^\.claude(?:\/|$)/i];

// Judge one write. { verdict: 'skip' | 'inside' | 'outside', root, rel, scope }. 'outside' is returned only for a
// confirmed violation: haku repository found, scope declared, path below the root and matching nothing.
function judge({ cwd, file }) {
  const skip = { verdict: 'skip' };
  if (typeof file !== 'string' || !file || typeof cwd !== 'string' || !cwd) return skip;
  const root = findHakuRoot(cwd);
  if (!root) return skip;
  const scope = readScope(root);
  if (!scope) return skip;
  const rel = relativeTo(root, file);
  if (rel === null) return skip;
  const inside = !ALWAYS_OUT.some(re => re.test(rel)) && scope.map(g => matcher(g, { anywhere: false })).some(t => t(rel));
  return { verdict: inside ? 'inside' : 'outside', root, rel, scope };
}

// Read stdin up to `limit` bytes. { text, tooBig }.
function readLimited(stream, limit = MAX_INPUT) {
  return new Promise(resolve => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = tooBig => {
      if (done) return;
      done = true;
      resolve({ text: tooBig ? '' : Buffer.concat(chunks).toString('utf8'), tooBig });
    };
    stream.on('data', c => {
      size += c.length;
      if (size > limit) { finish(true); return; }
      chunks.push(c);
    });
    stream.on('end', () => finish(false));
    stream.on('error', () => finish(true));
  });
}

// Append one JSON line with the path only (no prompt text, no tool content). Nothing is written when `dataDir` is
// empty or lies inside the repository, so a record never ends up in a commit. Returns whether it wrote.
function recordViolation(dataDir, root, entry) {
  if (!dataDir || typeof dataDir !== 'string') return false;
  if (relativeTo(root, path.resolve(dataDir)) !== null) return false;
  fs.mkdirSync(dataDir, { recursive: true });
  const line = JSON.stringify({ time: new Date().toISOString(), file: entry.file, scope: entry.scope }) + '\n';
  fs.appendFileSync(path.join(dataDir, RECORD_FILE), line, { mode: 0o600 });
  return true;
}

module.exports = { MAX_INPUT, RECORD_FILE, normalizePath, relativeTo, findHakuRoot, readScope, judge, readLimited, recordViolation };
