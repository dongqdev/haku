#!/usr/bin/env node
'use strict';

// Usage: check-eol.js [--worktree] [--cwd <dir>]
// Fails when a committed text file holds CRLF (or a mix of both). With --worktree the files as checked out must be
// LF too, which is what a Windows runner gets wrong when nothing tells git to keep LF. A file whose attributes ask
// for CRLF on purpose (`eol=crlf`) is left alone in the worktree check.
const { checkEol } = require('./lib/eol-check');

function main(argv) {
  const worktree = argv.includes('--worktree');
  const i = argv.indexOf('--cwd');
  const cwd = i >= 0 ? argv[i + 1] : process.cwd();
  if (i >= 0 && !cwd) throw new Error('--cwd needs a folder');
  const { problems, checked } = checkEol({ cwd, worktree });
  if (problems.length) {
    console.error(`${problems.length} file(s) with the wrong line endings (checked ${checked}):`);
    for (const p of problems) console.error(`  ${p.where}/${p.eol}  ${p.file}`);
    console.error('Fix: save the file with LF line endings (this repository keeps LF; see .gitattributes).');
    return 1;
  }
  console.log(`line endings ok (${checked} text files${worktree ? ', worktree included' : ''})`);
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
