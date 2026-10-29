'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { matcher } = require('./weaken');

// Personal paths in a tracked file: /root/..., /home/<name>/..., /Users/<name>/..., C:\Users\<name>\... . A path (haku:allow-personal-path)
// like that names a person's machine; it must not reach a repository that may become public. Placeholders
// (<name>, $USER, %USERNAME%, {user}) are not matched at all because of the characters they contain, and a few
// ordinary names (the GitHub runner's `runner`, `Public`, ...) are not people.
const NAME = '([^\\s/\\\\\'"`<>()$%{}*,;|]+)';
const RULES = [
  { rule: '/root/', re: /(?<![\w.~-])\/root\//gi, personal: () => true }, // haku:allow-personal-path
  { rule: '/home/<name>/', re: new RegExp(`(?<![\\w.~-])\\/home\\/${NAME}\\/`, 'gi'), personal: n => !SHARED.has(n.toLowerCase()) },
  { rule: '/Users/<name>/', re: new RegExp(`(?<![\\w.~-])\\/Users\\/${NAME}\\/`, 'gi'), personal: n => !SHARED.has(n.toLowerCase()) },
  { rule: 'C:\\Users\\<name>\\', re: new RegExp(`(?<![\\w])[A-Za-z]:[\\\\/]+Users[\\\\/]+${NAME}[\\\\/]`, 'gi'), personal: n => !SHARED.has(n.toLowerCase()) }
];
// Names in those folders that are not a person.
const SHARED = new Set(['user', 'username', 'you', 'yourname', 'your-name', 'name', 'me', 'example', 'runner', 'public', 'default', 'shared', 'all']);

const ALLOW_MARK = 'haku:allow-personal-path';
const ALLOW_FILE = '.haku/personal-paths-allow.txt';
const MAX_BYTES = 20 * 1024 * 1024;

// Matches in one line of text: [{rule, match}]. A line carrying the allow mark is never reported.
function findInLine(line) {
  if (line.includes(ALLOW_MARK)) return [];
  const found = [];
  for (const { rule, re, personal } of RULES) {
    re.lastIndex = 0;
    for (const m of line.matchAll(re)) {
      if (personal(m[1] || '')) found.push({ rule, match: m[0] });
    }
  }
  return found;
}

// The allow list: one path or glob per line (root relative), "#" starts a comment. Nothing else exempts a file.
function parseAllow(text) {
  return String(text || '').split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean).map(g => matcher(g, { anywhere: false }));
}

function trackedFiles(cwd) {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ls-files failed: ${String(r.stderr).trim()}`);
  return r.stdout.split('\0').filter(Boolean);
}

// Scans every tracked text file. Binary files (a NUL byte) and links are skipped; a file too large to read is a
// problem of its own rather than a silent pass.
function scanPersonalPaths({ cwd = process.cwd() } = {}) {
  let allow = [];
  try {
    allow = parseAllow(fs.readFileSync(path.join(cwd, ALLOW_FILE), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const hits = [];
  const unchecked = [];
  let scanned = 0;
  for (const file of trackedFiles(cwd)) {
    if (allow.some(t => t(file))) continue;
    const full = path.join(cwd, file);
    let stat;
    try {
      stat = fs.lstatSync(full);
    } catch (err) {
      continue; // deleted in the working tree
    }
    if (!stat.isFile()) continue;
    if (stat.size > MAX_BYTES) { unchecked.push({ file, why: `larger than ${MAX_BYTES} bytes` }); continue; }
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) continue;
    scanned += 1;
    buf.toString('utf8').split(/\r?\n/).forEach((line, i) => {
      for (const f of findInLine(line)) hits.push({ file, line: i + 1, rule: f.rule, match: f.match });
    });
  }
  return { hits, unchecked, scanned };
}

module.exports = { findInLine, parseAllow, scanPersonalPaths, ALLOW_MARK, ALLOW_FILE, SHARED };
