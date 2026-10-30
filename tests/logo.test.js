'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const SVGS = ['assets/haku.svg', 'assets/haku-lockup.svg'];

test('the logo SVGs are plain vector art: no live text, no raster, no outside references, no script', () => {
  for (const f of SVGS) {
    const svg = read(f);
    assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, f);
    assert.match(svg, /viewBox="0 0 \d+ \d+"/, f);
    assert.match(svg, /role="img"/, f);
    assert.match(svg, /aria-label="[^"]+"/, f);
    assert.doesNotMatch(svg, /<text[\s>]/, `${f}: letters must be drawn as shapes, not live text (no font dependency)`);
    assert.doesNotMatch(svg, /<image[\s>]|data:|<script|<foreignObject|<style/i, f);
    assert.doesNotMatch(svg.replace('http://www.w3.org/2000/svg', ''), /https?:\/\//, `${f}: no outside references`);
    assert.ok(Buffer.byteLength(svg) < 8 * 1024, `${f} should stay small`);
  }
});

test('the icon is a few flat colours (a logo, not an illustration)', () => {
  const colours = new Set((read('assets/haku.svg').match(/#[0-9A-Fa-f]{6}\b/g) || []).map(c => c.toUpperCase()));
  assert.ok(colours.size <= 8, `${colours.size} colours: ${[...colours].join(' ')}`);
  assert.ok(colours.size >= 3);
});

test('the plugin icon is a 512x512 PNG', () => {
  const buf = fs.readFileSync(path.join(root, '.claude-plugin', 'icon.png'));
  assert.deepStrictEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
  assert.strictEqual(buf.readUInt32BE(16), 512, 'width');
  assert.strictEqual(buf.readUInt32BE(20), 512, 'height');
});

test('both READMEs open with the horizontal logo, which exists', () => {
  for (const f of ['README.md', 'README.en.md']) {
    const top = read(f).split('\n').slice(0, 3).join('\n');
    assert.match(top, /<img src="assets\/haku-lockup\.svg"/, f);
  }
  assert.ok(fs.existsSync(path.join(root, 'assets', 'haku-lockup.svg')));
});

test('the lockup carries the icon and the same colours as the icon', () => {
  const icon = new Set((read('assets/haku.svg').match(/#[0-9A-Fa-f]{6}\b/g) || []).map(c => c.toUpperCase()));
  const lockup = new Set((read('assets/haku-lockup.svg').match(/#[0-9A-Fa-f]{6}\b/g) || []).map(c => c.toUpperCase()));
  for (const c of icon) assert.ok(lockup.has(c), `lockup lacks icon colour ${c}`);
});
