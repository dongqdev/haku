'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { render, pick, SHAPES, FACES } = require('../scripts/banner.js');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'banner.js');
const LABELS = ['SETUP', 'SNIFF', 'START PLAN', 'BUILD START', 'RETRO', 'STATUS', 'TRIAGE', 'LGTM!!!', 'NACK', 'MERGED!'];
const LINES = { A: 12, B: 12, C: 13, D: 5, E: 4 };
const INNER = { A: 16, B: 12, C: 12 };

// Returns a list of structure problems; empty list means the art looks whole.
function structureProblems(text, shape) {
  const problems = [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] !== '') problems.push('missing final LF');
  if (lines.length - 1 !== LINES[shape]) problems.push('line count ' + (lines.length - 1));
  if (INNER[shape]) {
    for (const part of ['(||___', '( o_o  )_', '(u--u', '"""`']) {
      if (!text.includes(part)) problems.push('missing ' + part);
    }
  }
  return problems;
}

for (const shape of SHAPES) {
  for (const label of LABELS) {
    test('render ' + shape + ' ' + label, () => {
      const out = render(label, shape);
      assert.ok(out.endsWith('\n') && !out.endsWith('\n\n'), 'exactly one final LF');
      assert.ok(!out.includes('\r'), 'no CR');
      assert.ok(!out.includes('&lt;'), 'no html entity');
      assert.strictEqual(out.split('\n').length - 1, LINES[shape]);
      assert.ok(out.includes(label));
      if (INNER[shape]) {
        const line = out.split('\n')[2];
        const m = line.match(/\|(.*)\|/);
        assert.ok(m, 'label line between pipes');
        assert.strictEqual(m[1].length, INNER[shape]);
        assert.ok(m[1].includes(label));
        const left = Math.floor((INNER[shape] - label.length) / 2);
        assert.strictEqual(m[1].indexOf(label), left);
      }
      assert.deepStrictEqual(structureProblems(out, shape), []);
    });
  }
}

test('faces table', () => {
  const expected = {
    'SNIFF': '(´･ω･｀）',
    'START PLAN': '(｀･ω･´）',
    'BUILD START': '(｀∀´）',
    'LGTM!!!': '(≧∀≦）',
    'NACK': '(；´Д｀）',
    'MERGED!': '(＾∀＾）',
  };
  for (const [label, face] of Object.entries(expected)) {
    assert.strictEqual(FACES[label], face);
    for (const shape of ['D', 'E']) {
      const out = render(label, shape);
      assert.ok(out.split('\n')[1].startsWith(face), label + ' ' + shape);
    }
  }
  for (const label of ['SETUP', 'RETRO', 'STATUS', 'TRIAGE']) {
    for (const shape of ['D', 'E']) {
      assert.ok(render(label, shape).split('\n')[1].startsWith('(´∀｀）'));
    }
  }
});

test('wide ear only for SNIFF and START PLAN', () => {
  for (const label of LABELS) {
    const wide = label === 'SNIFF' || label === 'START PLAN';
    for (const shape of ['D', 'E']) {
      const first = render(label, shape).split('\n')[0];
      assert.strictEqual(first.startsWith('∧＿＿∧  ＜ '), wide, label + ' ' + shape);
      if (!wide) assert.ok(first.startsWith('∧＿∧  ＜ ' + label));
    }
  }
});

test('pick', () => {
  assert.deepStrictEqual([0, 1, 2, 3, 4].map(pick).sort(), ['A', 'B', 'C', 'D', 'E']);
  for (let i = -20; i < 200; i++) assert.ok(['A', 'B', 'C', 'D', 'E'].includes(pick(i)));
  for (const s of [-1, -7, 2.5, -2.5, NaN, Infinity, 1e15, Date.now()]) {
    assert.doesNotThrow(() => pick(s));
    assert.ok(['A', 'B', 'C', 'D', 'E'].includes(pick(s)));
  }
});

test('CLI output equals render', () => {
  for (const shape of SHAPES) {
    const out = execFileSync(process.execPath, [SCRIPT, 'START PLAN', '--shape', shape], { encoding: 'utf8' });
    assert.strictEqual(out, render('START PLAN', shape));
  }
  const noShape = execFileSync(process.execPath, [SCRIPT, 'SETUP'], { encoding: 'utf8' });
  assert.ok(noShape.includes('SETUP') && noShape.endsWith('\n'));
});

test('CLI rejects bad input with exit 1', () => {
  const bad = [
    ['ABCDEFGHIJKLM'],
    ['한글'],
    [''],
    ['SETUP', '--shape', 'Z'],
  ];
  for (const args of bad) {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.strictEqual(r.status, 1, JSON.stringify(args));
    assert.strictEqual(r.stdout, '');
    assert.ok(r.stderr.length > 0);
  }
});

test('structure check catches a missing legs line', () => {
  const good = render('LGTM!!!', 'A');
  assert.deepStrictEqual(structureProblems(good, 'A'), []);
  const broken = good.split('\n').filter((l) => !l.includes('(||___')).join('\n');
  assert.ok(structureProblems(broken, 'A').length > 0);
});

const DOG_BODY = [
  '   /\\**/\\       |',
  '  ( o_o  )_     |',
  '   (u--u   \\_)  |',
  '    (||___   )==\\',
  '  ,dP"/b/=( /P"/b\\',
  '  |8 || 8\\=== || 8',
  '  `b,  ,P  `b,  ,P',
  '    """`     """`',
];
const DOG_PLAIN = [
  '   /\\**/\\',
  '  ( o_o  )_',
  '   (u--u   \\_)',
  '    (||___   )==\\',
  '  ,dP"/b/=( /P"/b\\',
  '  |8 || 8\\=== || 8',
  '  `b,  ,P  `b,  ,P',
  '    """`     """`',
];

const GOLDEN = [
  ['A LGTM!!!', 'LGTM!!!', 'A', [
    '                 ________________',
    '                |                |',
    '                |    LGTM!!!     |',
    '                |________________|',
  ].concat(DOG_BODY)],
  ['B LGTM!!!', 'LGTM!!!', 'B', [
    '                 ____________',
    '                |            |',
    '                |  LGTM!!!   |',
    '                |____________|',
  ].concat(DOG_BODY)],
  ['C LGTM!!!', 'LGTM!!!', 'C', [
    '   ____________',
    '  |            |',
    '  |  LGTM!!!   |',
    '  |____    ____|',
    '       \\  /',
  ].concat(DOG_PLAIN)],
  ['D narrow LGTM!!!', 'LGTM!!!', 'D', [
    '∧＿∧  ＜ LGTM!!!',
    '(≧∀≦）/|',
    'と　と　ヽﾉ',
    ' ヽ　､　　)',
    '　　>_/>_/',
  ]],
  ['D wide SNIFF', 'SNIFF', 'D', [
    '∧＿＿∧  ＜ SNIFF',
    '(´･ω･｀）/|',
    'と　と　　ヽﾉ',
    ' ヽ　､　　　)',
    '　　>_/>_/',
  ]],
  ['E narrow NACK', 'NACK', 'E', [
    '∧＿∧  ＜ NACK',
    '(；´Д｀） /|',
    '|　 r- V ﾉ',
    'しゝしゝ_)',
  ]],
  ['E wide START PLAN', 'START PLAN', 'E', [
    '∧＿＿∧  ＜ START PLAN',
    '(｀･ω･´） /|',
    '|　 r- V ﾉ',
    'しゝしゝ_)',
  ]],
].map(([name, label, shape, lines]) => ({ name, label, shape, text: lines.join('\n') + '\n' }));

// Returns a list of problems found when comparing art with its golden text.
function goldenProblems(text, golden) {
  return text === golden ? [] : ['differs from golden'];
}

for (const g of GOLDEN) {
  test('golden ' + g.name, () => {
    assert.strictEqual(render(g.label, g.shape), g.text);
  });
}

test('golden check catches character-level changes that keep the line count', () => {
  const a = GOLDEN[0];
  assert.deepStrictEqual(goldenProblems(render(a.label, a.shape), a.text), []);
  const brokenA = a.text.replace('"/b\\\n', '"/b/\n');
  assert.notStrictEqual(brokenA, a.text);
  assert.strictEqual(brokenA.split('\n').length, a.text.split('\n').length);
  assert.ok(goldenProblems(brokenA, a.text).length > 0);

  const d = GOLDEN.find((g) => g.name === 'D wide SNIFF');
  const brokenD = d.text.replace('と　と　　ヽﾉ', 'と　と　ヽﾉ');
  assert.notStrictEqual(brokenD, d.text);
  assert.ok(goldenProblems(brokenD, d.text).length > 0);
});

test('pick order', () => {
  ['A', 'B', 'C', 'D', 'E'].forEach((s, i) => assert.strictEqual(pick(i), s));
  assert.strictEqual(pick(5), 'A');
});
