'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = ['README.md', 'README.en.md'];
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');

// pictograph and symbol ranges, as numbers so this file holds no emoji itself
const RANGES = [[0x1F000, 0x1FAFF], [0x2600, 0x27BF], [0x2B00, 0x2BFF], [0x2300, 0x23FF], [0xFE00, 0xFE0F], [0x200D, 0x200D], [0x20E3, 0x20E3], [0x1F1E6, 0x1F1FF]];
const ALLOWED_HOSTS = ['img.shields.io', 'github.com'];

test('both READMEs have the same number of collapsible topics, each with a non-empty summary', () => {
  const summaries = text => [...text.matchAll(/<details>\n<summary>([\s\S]*?)<\/summary>\n\n/g)].map(m => m[1].trim());
  const [ko, en] = files.map(f => summaries(read(f)));
  assert.strictEqual(ko.length, 12);
  assert.strictEqual(en.length, ko.length);
  for (const s of [...ko, ...en]) assert.ok(s.length > 0);
  for (const f of files) {
    const t = read(f);
    assert.strictEqual((t.match(/<details>/g) || []).length, (t.match(/<\/details>/g) || []).length, f);
  }
});

test('no emoji or pictograph in either README', () => {
  for (const f of files) {
    for (const ch of read(f)) {
      const cp = ch.codePointAt(0);
      assert.ok(!RANGES.some(([a, b]) => cp >= a && cp <= b), `${f}: pictograph code point 0x${cp.toString(16)}`);
    }
  }
});

test('the badge row: every image up top has alt text and comes from an allowed host', () => {
  for (const f of files) {
    const top = read(f).split('\n').slice(0, 20).join('\n');
    const imgs = [...top.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
    assert.ok(imgs.length >= 6, `${f}: logo plus five badges`);
    for (const img of imgs) {
      const alt = img.match(/\balt="([^"]*)"/);
      assert.ok(alt && alt[1].trim(), `${f}: alt text missing in ${img}`);
      const src = img.match(/\bsrc="([^"]+)"/)[1];
      if (/^https?:/.test(src)) {
        assert.strictEqual(new URL(src).protocol, 'https:', `${f}: ${src}`);
        assert.ok(ALLOWED_HOSTS.includes(new URL(src).hostname), `${f}: host not allowed: ${src}`);
      } else {
        assert.match(src, /^assets\/haku-lockup\.svg$/, f);
      }
    }
    const badges = imgs.filter(i => /img\.shields\.io/.test(i)).join('\n');
    assert.match(badges, /dynamic\/json\?url=https%3A%2F%2Fraw\.githubusercontent\.com%2Fdongqdev%2Fhaku%2Fmain%2F\.claude-plugin%2Fplugin\.json&query=%24\.version/, f);
    assert.match(badges, /workflow\/status\/dongqdev\/haku\/test\.yml\?branch=main/, f);
    assert.match(badges, /license-MIT/, f);
    assert.match(badges, /node-18/, f);
    assert.match(badges, /Linux%20%7C%20macOS%20%7C%20Windows/, f);
  }
});

test('the top reads in order: logo, language switch, the four initials, one sentence, the badge row', () => {
  for (const f of files) {
    const t = read(f);
    const at = re => { const m = re.exec(t); assert.ok(m, `${f}: ${re}`); return m.index; };
    const logo = at(/<picture>/);
    const sw = at(/<p align="center">(<b>[^<]+<\/b> \| <a href="README\.en\.md">English<\/a>|<a href="README\.md">[^<]+<\/a> \| <b>English<\/b>)<\/p>/);
    const h3 = at(/<h3 align="center"><b>H<\/b>arness <b>A<\/b>ssistant <b>K<\/b>eeping <b>U<\/b>sers in the loop<\/h3>/);
    const sentence = at(/<p align="center">haku[^<]*<\/p>/);
    const badges = at(/<p align="center">\n  <a href="[^"]+"><img src="https:\/\/img\.shields\.io/);
    const firstH2 = at(/^## /m);
    assert.ok(logo < sw && sw < h3 && h3 < sentence && sentence < badges && badges < firstH2, `${f}: order`);
    assert.strictEqual((t.slice(0, badges).match(/<h3\b/g) || []).length, 1, f);
  }
});
