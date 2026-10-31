'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('build SKILL.md points to docs/resume.md and the file exists', () => {
  assert.match(read('skills/build/SKILL.md'), /docs\/resume\.md/);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'resume.md')));
});

test('resume.md leads with events, names the constraints and never allows merging', () => {
  const t = read('docs/resume.md');
  for (const re of [/pull_request/, /claude-code-action@v1/, /\/loop/, /new session/, /research preview/i, /hourly limit/, /Do not add a merge permission/, /never merges/])
    assert.match(t, re, String(re));
  assert.doesNotMatch(t, /--admin|--force|auto-merge|merge on its own\b(?!.*never)/i);
});
