#!/usr/bin/env node
'use strict';

// Usage: check-personal-paths.js [--cwd <dir>]
// Fails when a tracked text file names a person's machine (/root/, /home/<name>/, /Users/<name>/, C:\Users\<name>\). (haku:allow-personal-path)
// Exceptions: a line with `haku:allow-personal-path`, or a path listed in .haku/personal-paths-allow.txt.
const { scanPersonalPaths, ALLOW_MARK, ALLOW_FILE } = require('./lib/personal-paths');

function main(argv) {
  const i = argv.indexOf('--cwd');
  if (i >= 0 && !argv[i + 1]) throw new Error('--cwd needs a folder');
  const { hits, unchecked, scanned } = scanPersonalPaths({ cwd: i >= 0 ? argv[i + 1] : process.cwd() });
  if (hits.length || unchecked.length) {
    for (const h of hits) console.error(`${h.file}:${h.line}  ${h.rule}  "${h.match}"`);
    for (const u of unchecked) console.error(`${u.file}  not checked: ${u.why}`);
    console.error(`${hits.length} personal path(s), ${unchecked.length} file(s) not checked. Remove the path, or allow it on purpose: add ${ALLOW_MARK} to the line, or list the file in ${ALLOW_FILE}.`);
    return 1;
  }
  console.log(`no personal paths (${scanned} text files)`);
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error(`[haku] ${err.message}`);
    process.exit(2);
  }
}

module.exports = { main };
