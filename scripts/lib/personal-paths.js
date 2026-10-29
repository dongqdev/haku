'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { matcher } = require('./weaken');

// Personal paths in a tracked file: the home of the root user, of a named user on Linux, macOS, WSL and Windows
// (a "home", "var/home", "Users" or "mnt/<drive>/Users" folder followed by a user name). A path like that names a
// person's machine; it must not reach a repository that may become public. It counts without a trailing slash too,
// written with JSON-escaped slashes or URL-encoded. Placeholders (<name>, $USER, %USERNAME%, {user}, [user]) are not
// matched at all because of the characters they contain, and a list of ordinary names (CI accounts, `Public`,
// `your_name` ...) is not people. The Linux folders are case-sensitive; the macOS and Windows ones are not.
const NAME = '([^\\s/\\\\\'"`<>()$%{}*,;|\\[\\]…]+)';
const SEP = '\\\\?\\/'; // a slash, or a JSON-escaped one
const BEFORE = '(?<![\\w.~-])';
const SHARED = new Set([
  'user', 'username', 'you', 'yourname', 'yourusername', 'name', 'me', 'myname', 'myuser', 'example', 'exampleuser', 'testuser',
  'someone', 'runner', 'public', 'default', 'shared', 'all', 'ubuntu', 'vsts', 'node', 'ec2user'
]);
// your_name, Your-Name and yourname are the same placeholder.
const placeholder = n => SHARED.has(n.toLowerCase().replace(/[_-]/g, '')) || /^\.+$/.test(n);
const person = n => !placeholder(n);

const RULES = [
  { rule: 'root home', re: new RegExp(`${BEFORE}${SEP}root(?=${SEP}|\\\\|$|["'\`])`, 'g'), personal: () => true },
  { rule: '/home/<name>', re: new RegExp(`${BEFORE}${SEP}home${SEP}${NAME}`, 'g'), personal: person },
  { rule: '/var/home/<name>', re: new RegExp(`${BEFORE}${SEP}(?:var|data)${SEP}home${SEP}${NAME}`, 'g'), personal: person },
  { rule: '/Users/<name>', re: new RegExp(`${BEFORE}${SEP}Users${SEP}${NAME}`, 'gi'), personal: person },
  { rule: '/mnt/<drive>/Users/<name>', re: new RegExp(`${BEFORE}${SEP}mnt${SEP}[a-z]${SEP}Users${SEP}${NAME}`, 'gi'), personal: person },
  { rule: 'C:\\Users\\<name>', re: new RegExp('(?<![\\w])[A-Za-z]:[\\\\/]+Users[\\\\/]+' + NAME, 'gi'), personal: person }
];
// The same paths URL-encoded.
const ENCODED = [
  { rule: '/home/<name> (URL-encoded)', re: /%2F(?:home|Users)%2F([A-Za-z0-9._-]+)/gi, personal: person }
];

const ALLOW_MARK = 'haku:allow-personal-path';
const ALLOW_FILE = '.haku/personal-paths-allow.txt';
const MAX_BYTES = 20 * 1024 * 1024;
const SNIFF_BYTES = 8192;

// Matches in one line of text: [{rule, match}]. A line carrying the allow mark is never reported (the caller counts
// them). One path is reported once even when two rules see the same name (a file: URL of a Windows path).
function findInLine(line) {
  if (line.includes(ALLOW_MARK)) return [];
  const found = [];
  const seen = new Set();
  for (const { rule, re, personal } of [...RULES, ...ENCODED]) {
    for (const m of line.matchAll(re)) {
      const name = (m[1] || '').toLowerCase();
      if (!personal(m[1] || '')) continue;
      const key = name || '(root)';
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ rule, match: m[0] });
    }
  }
  return found;
}

// The allow list: one path or glob per line, from the repository root ("docs/a.md", "tests/fixtures/**", "docs" for a
// whole folder; `*.md` means root-level files only, `**/*.md` every folder), "#" starts a comment. Letter case does
// not matter. Nothing else exempts a file.
function parseAllow(text) {
  return String(text || '').split(/\r?\n/).map(l => l.replace(/#.*$/, '').trim()).filter(Boolean).map(g => matcher(g, { anywhere: false }));
}

function trackedFiles(cwd) {
  const r = spawnSync('git', ['ls-files', '-z'], { cwd, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ls-files failed: ${String(r.stderr).trim()}`);
  return r.stdout.toString('utf8').split('\0').filter(Boolean);
}

// Text of a file, or null when it is binary. A UTF-16 file (BOM) is decoded; a file with NUL bytes and no BOM is binary.
function textOf(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  return buf.includes(0) ? null : buf.toString('utf8');
}

function sniff(full) {
  const fd = fs.openSync(full, 'r');
  try {
    const buf = Buffer.alloc(SNIFF_BYTES);
    const n = fs.readSync(fd, buf, 0, SNIFF_BYTES, 0);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

// Scans every tracked file. A symbolic link is checked by its target text (git stores that text in the repository).
// Binary files are skipped and counted; a file that cannot be read, or is too large to read as text, is a problem of
// its own rather than a silent pass.
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
  let binary = 0;
  let marked = 0;
  const lineHits = (file, text) => {
    const seen = new Set();
    text.split(/\r?\n/).forEach((line, i) => {
      // A marked line is exempt; it is counted only when it really held a path, so the number tells how many were allowed.
      if (line.includes(ALLOW_MARK)) {
        if (findInLine(line.split(ALLOW_MARK).join('')).length) marked += 1;
        return;
      }
      for (const f of findInLine(line)) {
        const key = `${i}:${f.match.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ file, line: i + 1, rule: f.rule, match: f.match });
      }
    });
  };
  for (const file of trackedFiles(cwd)) {
    if (allow.some(t => t(file))) continue;
    if (file.includes('\uFFFD')) { unchecked.push({ file, why: 'the file name is not valid UTF-8' }); continue; }
    const full = path.join(cwd, file);
    try {
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) {
        scanned += 1;
        lineHits(file, fs.readlinkSync(full));
        continue;
      }
      if (!stat.isFile()) continue; // a submodule
      const head = sniff(full);
      const isUtf16 = head.length >= 2 && ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff));
      if (!isUtf16 && head.includes(0)) { binary += 1; continue; }
      if (stat.size > MAX_BYTES) { unchecked.push({ file, why: `a text file larger than ${MAX_BYTES} bytes` }); continue; }
      const text = textOf(fs.readFileSync(full));
      if (text === null) { binary += 1; continue; }
      scanned += 1;
      lineHits(file, text);
    } catch (err) {
      if (err.code === 'ENOENT') continue; // deleted in the working tree
      unchecked.push({ file, why: `could not be read (${err.code || err.message})` });
    }
  }
  return { hits, unchecked, scanned, binary, marked };
}

module.exports = { findInLine, parseAllow, scanPersonalPaths, textOf, ALLOW_MARK, ALLOW_FILE, SHARED };
