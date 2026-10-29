'use strict';

const { spawnSync } = require('child_process');

// `git ls-files --eol -z` lists, per file, the line endings in the index (i/), in the working tree (w/) and the
// attributes that decide them: "i/lf    w/lf    attr/text=auto eol=lf \tpath". Binary files show "-text", which
// is not a line ending problem.
function parseEol(output) {
  const rows = [];
  for (const entry of String(output).split('\0')) {
    const m = entry.match(/^i\/(\S+)\s+w\/(\S+)\s+attr\/(.*?)\s*\t([\s\S]+)$/);
    if (m) rows.push({ index: m[1], work: m[2], attr: m[3], file: m[4] });
  }
  return rows;
}

const wrong = eol => eol === 'crlf' || eol === 'mixed';

function checkEol({ cwd = process.cwd(), worktree = false } = {}) {
  const r = spawnSync('git', ['ls-files', '--eol', '-z'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ls-files --eol failed: ${String(r.stderr).trim()}`);
  const rows = parseEol(r.stdout);
  const problems = [];
  for (const row of rows) {
    if (wrong(row.index)) problems.push({ file: row.file, where: 'i', eol: row.index });
    else if (worktree && wrong(row.work) && !/\beol=crlf\b/.test(row.attr)) problems.push({ file: row.file, where: 'w', eol: row.work });
  }
  return { problems, checked: rows.filter(r => r.index !== '-text' || r.work !== '-text').length };
}

module.exports = { parseEol, checkEol };
