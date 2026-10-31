'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const EVALS = path.join(root, 'evals');

// Allowlists drawn from the research report on `claude plugin eval` (docs/skill-evals.md lists what is unverified).
const CASE_KEYS = ['schema_version', 'name', 'description', 'tags', 'plugins', 'runs', 'expected_outcome', 'model',
  'max_turns', 'timeout_seconds', 'allowed_tools', 'append_system_prompt', 'env'];
const GRADER_KEYS = ['type', 'weight', 'arm', 'tool', 'input_match', 'min', 'max', 'pattern', 'flags', 'match', 'target',
  'criteria', 'focus'];
const GRADER_TYPES = ['regex', 'tool_used', 'tool_order', 'file_exists', 'llm', 'baseline'];

// Top-level keys of the front matter between the first two '---' lines; null when there is no front matter.
function frontMatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const keys = [];
  for (const l of lines.slice(1, end)) {
    const m = /^([A-Za-z_][\w-]*)\s*:/.exec(l);
    if (m) keys.push(m[1]);
  }
  return { keys, body: lines.slice(end + 1).join('\n') };
}

// Returns the list of format problems under an evals dir (empty = fine). No model call, no shell.
function problems(dir) {
  const bad = [];
  if (!fs.existsSync(dir)) return ['no evals dir'];
  const cases = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory());
  if (cases.length === 0) bad.push('no cases');
  for (const c of cases) {
    const cdir = path.join(dir, c.name);
    const pf = path.join(cdir, 'prompt.md');
    if (!fs.existsSync(pf)) { bad.push(`${c.name}: missing prompt.md`); } else {
      const fm = frontMatter(fs.readFileSync(pf, 'utf8'));
      if (!fm) bad.push(`${c.name}: prompt.md has no front matter`);
      else {
        for (const k of fm.keys) if (!CASE_KEYS.includes(k)) bad.push(`${c.name}: unknown key ${k}`);
        if (!fm.keys.includes('name')) bad.push(`${c.name}: no name`);
        if (!fm.body.trim()) bad.push(`${c.name}: empty prompt body`);
      }
    }
    const gdir = path.join(cdir, 'graders');
    const graders = fs.existsSync(gdir) ? fs.readdirSync(gdir).filter(f => f.endsWith('.md')) : [];
    if (graders.length === 0) bad.push(`${c.name}: no grader`);
    for (const g of graders) {
      const text = fs.readFileSync(path.join(gdir, g), 'utf8');
      const fm = frontMatter(text);
      if (!fm) { bad.push(`${c.name}/${g}: no front matter`); continue; }
      for (const k of fm.keys) if (!GRADER_KEYS.includes(k)) bad.push(`${c.name}/${g}: unknown key ${k}`);
      if (!fm.keys.includes('type')) bad.push(`${c.name}/${g}: no type`);
      const t = /^type\s*:\s*(\S+)/m.exec(text);
      if (t && !GRADER_TYPES.includes(t[1])) bad.push(`${c.name}/${g}: unknown type ${t[1]}`);
    }
  }
  return bad;
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) copyTree(s, d); else fs.copyFileSync(s, d);
  }
}
function tmpCopy() {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'haku-evals-')), 'evals');
  copyTree(EVALS, dir);
  return dir;
}

test('shipped eval cases are well formed', () => {
  assert.deepStrictEqual(problems(EVALS), []);
});

test('there is a should-trigger and a should-not-trigger case for sniff', () => {
  const names = fs.readdirSync(EVALS);
  assert.ok(names.some(n => n.startsWith('sniff-')) && names.length >= 2);
});

test('mutation: missing grader is caught', () => {
  const d = tmpCopy();
  fs.rmSync(path.join(d, 'sniff-vague-request', 'graders'), { recursive: true });
  assert.ok(problems(d).some(p => /no grader/.test(p)));
});

test('mutation: unknown key is caught (case and grader)', () => {
  let d = tmpCopy();
  const pf = path.join(d, 'sniff-vague-request', 'prompt.md');
  fs.writeFileSync(pf, fs.readFileSync(pf, 'utf8').replace('runs: 3', 'runs: 3\nbogus_key: 1'));
  assert.ok(problems(d).some(p => /unknown key bogus_key/.test(p)));
  d = tmpCopy();
  const gf = path.join(d, 'sniff-concrete-edit', 'graders', 'skill-not-fired.md');
  fs.writeFileSync(gf, fs.readFileSync(gf, 'utf8').replace('max: 0', 'max: 0\nbogus_key: 1'));
  assert.ok(problems(d).some(p => /unknown key bogus_key/.test(p)));
});

test('mutation: missing prompt and missing grader type are caught', () => {
  let d = tmpCopy();
  fs.rmSync(path.join(d, 'sniff-vague-request', 'prompt.md'));
  assert.ok(problems(d).some(p => /missing prompt\.md/.test(p)));
  d = tmpCopy();
  const gf = path.join(d, 'sniff-vague-request', 'graders', 'skill-fired.md');
  fs.writeFileSync(gf, fs.readFileSync(gf, 'utf8').replace('type: tool_used\n', ''));
  assert.ok(problems(d).some(p => /no type/.test(p)));
});
