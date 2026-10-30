'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const binary = f => fs.readFileSync(path.join(root, f));

const LOGO_DIR = 'assets/logo';
const SVGS = [
  'assets/haku.svg', 'assets/haku-lockup.svg', 'assets/haku-lockup-white.svg',
  ...fs.readdirSync(path.join(root, LOGO_DIR)).filter(f => f.endsWith('.svg')).map(f => `${LOGO_DIR}/${f}`)
];
const PALETTE = ['#4A2E20', '#F4ECE1', '#000000', '#FFFFFF'];
// #000 and #000000 are the same colour: expand the short form before comparing
const full = c => (c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c).toUpperCase();
const coloursOf = text => [...new Set((text.match(/#[0-9A-Fa-f]{3,6}\b/g) || []).map(full))];

test('the logo set has the master, the colour and small-size versions and the horizontal logo', () => {
  for (const f of ['haku-symbol.svg', 'haku-symbol-brown.svg', 'haku-symbol-white.svg', 'haku-symbol-small.svg',
    'haku-horizontal.svg', 'haku-horizontal-brown.svg', 'haku-horizontal-white.svg', 'haku-favicon.svg',
    'favicon.ico', 'apple-touch-icon.png']) {
    assert.ok(fs.existsSync(path.join(root, LOGO_DIR, f)), `${LOGO_DIR}/${f} missing`);
  }
});

test('every logo SVG is plain vector art: no live text, raster, outside references, script or style', () => {
  assert.ok(SVGS.length >= 10, 'expected the whole set');
  for (const f of SVGS) {
    const svg = read(f);
    assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, f);
    assert.match(svg, /viewBox="[-\d. ]+"/, f);
    assert.match(svg, /<title>[^<]+<\/title>/, `${f}: a <title> for accessibility`);
    assert.doesNotMatch(svg, /<text[\s>]/, `${f}: letters must be drawn as shapes (no font dependency)`);
    assert.doesNotMatch(svg, /<image[\s>]|data:|<script|<foreignObject|<style|<filter|<mask/i, f);
    assert.doesNotMatch(svg.replace('http://www.w3.org/2000/svg', ''), /https?:\/\//, `${f}: no outside references`);
    assert.ok(Buffer.byteLength(svg) < 4 * 1024, `${f} should stay small`);
  }
});

test('only the brand colours appear: brown #4A2E20 and cream #F4ECE1 (plus black and white for the one-colour versions)', () => {
  for (const f of SVGS) {
    for (const c of coloursOf(read(f))) assert.ok(PALETTE.includes(c), `${f} uses ${c}`);
  }
  assert.deepStrictEqual(coloursOf(read('assets/haku.svg')).sort(), ['#4A2E20', '#F4ECE1']);
  assert.deepStrictEqual(coloursOf(read('assets/haku-lockup.svg')), ['#4A2E20']);
  assert.deepStrictEqual(coloursOf(read(`${LOGO_DIR}/haku-symbol.svg`)), ['#000000']);
  assert.deepStrictEqual(coloursOf(read('assets/haku-lockup-white.svg')), ['#FFFFFF']);
});

test('the one-colour versions keep their holes (a real cut-out, not a white shape painted on top)', () => {
  for (const f of ['haku-symbol.svg', 'haku-symbol-small.svg', 'haku-symbol-white.svg', 'haku-symbol-brown.svg']) {
    assert.match(read(`${LOGO_DIR}/${f}`), /fill-rule="evenodd"/, `${f}: the blaze and the eyes must be real holes`);
  }
});

test('the plugin icon is a 512x512 PNG and the app-icon SVG draws the same tile', () => {
  const png = binary('.claude-plugin/icon.png');
  assert.deepStrictEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
  assert.strictEqual(png.readUInt32BE(16), 512, 'width');
  assert.strictEqual(png.readUInt32BE(20), 512, 'height');
  assert.match(read('assets/haku.svg'), /<rect [^>]*fill="#F4ECE1"/);
});

test('favicon.ico holds the 16, 32 and 48 pixel images and the touch icon is 180x180', () => {
  const ico = binary(`${LOGO_DIR}/favicon.ico`);
  assert.strictEqual(ico.readUInt16LE(0), 0, 'reserved');
  assert.strictEqual(ico.readUInt16LE(2), 1, 'type: icon');
  const count = ico.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i += 1) sizes.push(ico[6 + i * 16] || 256);
  assert.deepStrictEqual(sizes.sort((a, b) => a - b), [16, 32, 48]);
  const touch = binary(`${LOGO_DIR}/apple-touch-icon.png`);
  assert.strictEqual(touch.readUInt32BE(16), 180);
  assert.strictEqual(touch.readUInt32BE(20), 180);
});

test('both READMEs open with the horizontal logo, brown on light themes and white on dark ones', () => {
  for (const f of ['README.md', 'README.en.md']) {
    const top = read(f).split('\n').slice(0, 9).join('\n');
    assert.match(top, /<source media="\(prefers-color-scheme: dark\)" srcset="assets\/haku-lockup-white\.svg">/, f);
    assert.match(top, /<img src="assets\/haku-lockup\.svg"/, f);
  }
});

test("the horizontal logo's k sits on a clean angle (the audit flagged 132.4 degrees once)", () => {
  const letterK = read(`${LOGO_DIR}/haku-horizontal.svg`).match(/M410 150 V330 M(\d+) (\d+) L(\d+) (\d+)/);
  assert.ok(letterK, 'the k path');
  const [x1, y1, x2, y2] = letterK.slice(1).map(Number);
  assert.strictEqual(Math.abs(x1 - x2), Math.abs(y1 - y2), 'the upper arm of the k is exactly 45 degrees');
});

test('docs/logo.md is written in Korean and English and gives the colours, sizes and the do-nots', () => {
  const doc = read('docs/logo.md');
  assert.match(doc, /^## 한국어$/m);
  assert.match(doc, /^## English$/m);
  for (const c of ['#4A2E20', '#F4ECE1', '74, 46, 32', '244, 236, 225']) assert.ok(doc.includes(c), c);
  assert.match(doc, /하지 마세요/);
  assert.match(doc, /Do not/);
  for (const f of fs.readdirSync(path.join(root, LOGO_DIR))) {
    assert.ok(doc.includes(f.replace(/-(brown|white|black)\.svg$/, '*.svg')) || doc.includes(f) || /haku-horizontal/.test(f) || /haku-symbol/.test(f) || /icon|favicon/.test(f), `${f} is not described`);
  }
});
