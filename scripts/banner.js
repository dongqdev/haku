#!/usr/bin/env node
'use strict';

// Prints one ASCII-art banner with a speech-bubble label.
// Usage: node scripts/banner.js "<LABEL>" [--shape A|B|C|D|E]

const SHAPES = ['A', 'B', 'C', 'D', 'E'];

const FACES = {
  'SNIFF': '(´･ω･｀）',
  'START PLAN': '(｀･ω･´）',
  'BUILD START': '(｀∀´）',
  'LGTM!!!': '(≧∀≦）',
  'NACK': '(；´Д｀）',
  'MERGED!': '(＾∀＾）',
};
const DEFAULT_FACE = '(´∀｀）';
const WIDE = new Set(['SNIFF', 'START PLAN']);

const DOG = [
  '   /\\**/\\',
  '  ( o_o  )_',
  '   (u--u   \\_)',
  '    (||___   )==\\',
  '  ,dP"/b/=( /P"/b\\',
  '  |8 || 8\\=== || 8',
  '  `b,  ,P  `b,  ,P',
  '    """`     """`',
];

function centered(label, inner) {
  const left = Math.floor((inner - label.length) / 2);
  return ' '.repeat(left) + label + ' '.repeat(inner - label.length - left);
}

function dogSide(label, inner) {
  const pad = ' '.repeat(16);
  const out = [
    ' '.repeat(17) + '_'.repeat(inner),
    pad + '|' + ' '.repeat(inner) + '|',
    pad + '|' + centered(label, inner) + '|',
    pad + '|' + '_'.repeat(inner) + '|',
  ];
  out.push(DOG[0].padEnd(16) + '|');
  out.push(DOG[1].padEnd(16) + '|');
  out.push(DOG[2].padEnd(16) + '|');
  for (let i = 3; i < DOG.length; i++) out.push(DOG[i]);
  return out;
}

function dogAbove(label) {
  return [
    '   ' + '_'.repeat(12),
    '  |' + ' '.repeat(12) + '|',
    '  |' + centered(label, 12) + '|',
    '  |____    ____|',
    '       \\  /',
  ].concat(DOG);
}

function kaomojiD(label) {
  const face = FACES[label] || DEFAULT_FACE;
  if (WIDE.has(label)) {
    return [
      '∧＿＿∧  ＜ ' + label,
      face + '/|',
      'と　と　　ヽﾉ',
      ' ヽ　､　　　)',
      '　　>_/>_/',
    ];
  }
  return [
    '∧＿∧  ＜ ' + label,
    face + '/|',
    'と　と　ヽﾉ',
    ' ヽ　､　　)',
    '　　>_/>_/',
  ];
}

function kaomojiE(label) {
  const face = FACES[label] || DEFAULT_FACE;
  return [
    (WIDE.has(label) ? '∧＿＿∧' : '∧＿∧') + '  ＜ ' + label,
    face + ' /|',
    '|　 r- V ﾉ',
    'しゝしゝ_)',
  ];
}

function render(label, shape) {
  let lines;
  switch (shape) {
    case 'A': lines = dogSide(label, 16); break;
    case 'B': lines = dogSide(label, 12); break;
    case 'C': lines = dogAbove(label); break;
    case 'D': lines = kaomojiD(label); break;
    case 'E': lines = kaomojiE(label); break;
    default: throw new Error('Unknown shape: ' + shape);
  }
  return lines.join('\n') + '\n';
}

function pick(seed) {
  let n = Math.floor(Number(seed));
  if (!Number.isFinite(n)) n = 0;
  return SHAPES[((n % 5) + 5) % 5];
}

function validLabel(label) {
  return typeof label === 'string' && /^[\x20-\x7e]{1,12}$/.test(label);
}

function main(argv) {
  const args = argv.slice();
  let shape = null;
  const idx = args.indexOf('--shape');
  if (idx !== -1) {
    shape = args[idx + 1];
    args.splice(idx, 2);
    if (!SHAPES.includes(shape)) {
      process.stderr.write('Error: shape must be one of A, B, C, D, E\n');
      return 1;
    }
  }
  const label = args[0];
  if (args.length !== 1 || !validLabel(label)) {
    process.stderr.write('Error: label must be 1 to 12 printable ASCII characters\n');
    return 1;
  }
  process.stdout.write(render(label, shape || pick(Date.now())));
  return 0;
}

module.exports = { render, pick, SHAPES, FACES };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
