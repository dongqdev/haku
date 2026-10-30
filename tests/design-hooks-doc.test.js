'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const FILE = process.env.DESIGN_DOC_FILE || path.join(root, 'docs', 'design', 'hooks-and-capture.md');
const text = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';

const LANGS = {
  ko: {
    title: '한국어',
    sections: ['전제와 현재 상태', '훅의 종류와 목적', '훅을 어디에 둘 것인가', '교정 자동 감지의 개인정보 규칙', '만드는 법과 시험', '위험: 훅이 구멍이 되는 경우', '단계별 도입 순서', '사용자가 고를 결정 목록'],
    rec: /^- 권장:\s*\S/m, kinds: ['작업 파일 범위 검사', '푸시 차단', '검사 약화 감지', '세션 종료 교정 수집'],
    fail: ['fail open', 'fail closed', '미확인'],
    question: /^- 질문:/m, options: /^- 선택지: .*\(a\).*\(b\)/m,
  },
  en: {
    title: 'English',
    sections: ['Premises and current state', 'Hook kinds and purposes', 'Where hooks should live', 'Privacy rules for correction capture', 'How to build and test', 'Risks: when a hook becomes a hole', 'Staged rollout order', 'Decision list for the user'],
    rec: /^- Recommendation:\s*\S/m, kinds: ['Task file-scope check', 'Push block', 'Weakened-check detection', 'Session-end correction capture'],
    fail: ['fail open', 'fail closed', 'unverified'],
    question: /^- Question:/m, options: /^- Options: .*\(a\).*\(b\)/m,
  },
};

// A part runs from its level-two heading to the next level-two heading (or the end).
function part(title) {
  const m = new RegExp('^## ' + title + '\\s*$', 'm').exec(text);
  if (!m) return '';
  const rest = text.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}
const headings = s => s.split('\n').filter(l => /^#{3,6}\s/.test(l)).map(l => l.match(/^#+/)[0]);
const level3 = s => s.split('\n').filter(l => /^### /.test(l)).map(l => l.replace(/^### \d+\.\s*/, '').trim());

test('the design document exists and has exactly the two language parts', () => {
  assert.ok(text.length > 0, 'docs/design/hooks-and-capture.md is missing');
  assert.deepStrictEqual([...text.matchAll(/^## (.+)$/gm)].map(m => m[1].trim()), ['한국어', 'English']);
  assert.ok((part('한국어').match(/[가-힣]/g) || []).length > 800, 'the first part is Korean');
  assert.ok((part('English').match(/[가-힣]/g) || []).length < 80, 'the English part is English (a few quoted Korean words)');
});

test('both parts have the same heading structure and the required sections in order', () => {
  assert.deepStrictEqual(headings(part('한국어')), headings(part('English')), 'heading levels and counts must match');
  for (const L of Object.values(LANGS)) assert.deepStrictEqual(level3(part(L.title)), L.sections, L.title + ' sections');
});

test('the hook table names the four hooks, with fail open or fail closed and an unverified marker', () => {
  for (const [k, L] of Object.entries(LANGS)) {
    const p = part(L.title);
    for (const kind of L.kinds) assert.ok(p.includes(kind), `${k}: missing hook kind ${kind}`);
    for (const word of L.fail) assert.ok(p.includes(word), `${k}: missing "${word}"`);
    const rows = p.split('\n').filter(l => /^\| [A-D]\. /.test(l));
    assert.strictEqual(rows.length, 4, k + ': one table row per hook');
    for (const r of rows) assert.strictEqual(r.split('|').length - 2, 5, k + ': five columns: ' + r.slice(0, 30));
    for (const r of rows) assert.match(r, /fail (open|closed)/, k + ': each hook row says fail open or closed: ' + r.slice(0, 30));
  }
});

test('the placement comparison covers the three options with blast radius and how to turn off', () => {
  const need = { ko: ['hooks/hooks.json', '저장소 로컬', '선택 설치', '영향 범위', '끄는 방법', 'disableAllHooks'], en: ['hooks/hooks.json', 'Repository-local', 'Opt-in install', 'Blast radius', 'How to turn off', 'disableAllHooks'] };
  for (const k of ['ko', 'en']) for (const w of need[k]) assert.ok(part(LANGS[k].title).includes(w), `${k}: missing ${w}`);
});

test('the privacy section states what is stored, never stored, where, how deleted and the retro/triage flow', () => {
  const need = { ko: ['저장하는 것', '절대 저장하지 않는 것', '비밀값', '개인 경로', '대화 전체', '로컬 파일', 'GitHub 이슈', '지우기', 'corrections clear', '`retro`', '`triage`'], en: ['Stored', 'Never stored', 'Secret values', 'personal paths', 'whole conversation', 'local file', 'GitHub issue', 'Deleting', 'corrections clear', '`retro`', '`triage`'] };
  for (const k of ['ko', 'en']) for (const w of need[k]) assert.ok(part(LANGS[k].title).includes(w), `${k}: missing ${w}`);
});

test('the build section covers zero-dependency Node, stdin JSON and the three operating systems', () => {
  const need = { ko: ['의존성 0개', '표준입력', 'Windows', 'macOS|macos', 'Linux', '`node:test`'], en: ['zero-dependency', 'standard input', 'Windows', 'macOS|macos', 'Linux', '`node:test`'] };
  for (const k of ['ko', 'en']) for (const w of need[k]) assert.match(part(LANGS[k].title), new RegExp(w), `${k}: ${w}`);
});

test('the decision list is last, numbered the same in both parts, and every item has options and a recommendation', () => {
  const ids = {};
  for (const [k, L] of Object.entries(LANGS)) {
    const p = part(L.title);
    const starts = [...p.matchAll(/^### /gm)];
    const tail = p.slice(starts[starts.length - 1].index);
    assert.ok(tail.split('\n')[0].includes(L.sections[7]), k + ': the decision list is the last section');
    const items = tail.split(/^(?=#### )/m).filter(b => b.startsWith('#### '));
    ids[k] = items.map(b => Number(b.match(/(\d+)\./)[1]));
    assert.ok(items.length >= 6, k + ': at least six decisions');
    for (const b of items) {
      const name = b.split('\n')[0];
      assert.match(b, L.rec, k + ': recommendation missing in ' + name);
      assert.match(b, L.question, k + ': question line in ' + name);
      assert.match(b, L.options, k + ': options a and b in ' + name);
      assert.match(b.match(L.options)[0], /^[^\n]*\(a\)[^\n]*\(Recommended\)[^\n]*?\(b\)/, k + ': option (a) is marked Recommended in ' + name);
    }
  }
  assert.deepStrictEqual(ids.ko, ids.en);
  assert.deepStrictEqual(ids.ko, ids.ko.map((_, i) => i + 1));
});

test('the unverified items are marked as open points in both languages', () => {
  assert.match(part('한국어'), /stop_hook_active[^\n]*미확인/);
  assert.match(part('English'), /stop_hook_active[^\n]*unverified/);
  assert.match(part('한국어'), /승인 절차[^\n]*미확인/);
  assert.match(part('English'), /approval step[^\n]*\(\*\*unverified\*\*\)/);
});

test('the version files agree and equal 0.16.7', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.ok(Array.isArray(market.plugins) && market.plugins.length >= 1);
  for (const v of [plugin.version, ...market.plugins.map(p => p.version)]) assert.strictEqual(v, '0.16.7');
});
