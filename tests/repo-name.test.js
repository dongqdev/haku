'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// The repository was renamed to "haku"; the previous name is built from parts so this file does not contain it.
const OLD_NAME = 'haku' + '-harness';

test('no tracked text file still uses the repository\'s previous name', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.ok(files.length > 50, 'expected the whole file list');
  const hits = [];
  for (const f of files) {
    let buf;
    try { buf = fs.readFileSync(path.join(root, f)); } catch (e) { continue; } // symlink to nowhere, deleted in the working tree
    if (buf.includes(0)) continue; // binary
    buf.toString('utf8').split('\n').forEach((line, i) => { if (line.includes(OLD_NAME)) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepStrictEqual(hits, [], `the old name is still used in: ${hits.join(', ')}`);
});

test('the install lines in the READMEs and the upgrade guide point at the new repository', () => {
  for (const f of ['README.md', 'README.en.md', 'docs/upgrading.md']) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(text, /plugin marketplace add https:\/\/github\.com\/<owner>\/haku\.git/, f);
  }
});
