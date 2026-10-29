'use strict';

const { spawnSync } = require('child_process');

// `git ls-files --eol -z` lists, per file, the line endings in the index (i/), in the working tree (w/) and the
// attributes that decide them: "i/lf    w/lf    attr/text=auto eol=lf \tpath". Binary files show "-text", which
// is not a line ending problem. A file missing from the working tree (deleted, sparse checkout) has an empty "w/";
// a symlink or a submodule has an empty "i/" as well and is not text at all.
//
// A file with `-text` or `binary` in its attributes, or with `eol=crlf`, was marked on purpose (a .bat file, a
// fixture that must stay CRLF) and is left alone. A file git itself takes for binary because of a lone CR or a NUL
// byte shows as "-text" in the index and is skipped in the same way.
function parseEol(output) {
  const rows = [];
  for (const entry of String(output).split('\0')) {
    const m = entry.match(/^i\/(\S*)\s+w\/(\S*)\s+attr\/(.*?)\s*\t([\s\S]+)$/);
    if (m) rows.push({ index: m[1], work: m[2], attr: m[3], file: m[4] });
  }
  return rows;
}

const wrong = eol => eol === 'crlf' || eol === 'mixed';
const onPurpose = attr => /(?:^|\s)-text(?:\s|$)|(?:^|\s)binary(?:\s|$)|\beol=crlf\b/.test(attr);

function checkEol({ cwd = process.cwd(), worktree = false } = {}) {
  const r = spawnSync('git', ['ls-files', '--eol', '-z'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ls-files --eol failed: ${String(r.stderr).trim()}`);
  const rows = parseEol(r.stdout);
  const problems = [];
  let checked = 0;
  for (const row of rows) {
    if (row.index === '') continue; // symlink or submodule
    if (row.index === '-text' && row.work === '-text') continue; // binary
    checked += 1;
    if (onPurpose(row.attr)) continue;
    if (wrong(row.index)) problems.push({ file: row.file, where: 'i', eol: row.index });
    else if (worktree && wrong(row.work)) problems.push({ file: row.file, where: 'w', eol: row.work });
  }
  return { problems, checked };
}

module.exports = { parseEol, checkEol };
