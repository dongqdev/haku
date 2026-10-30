'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const FILE = process.env.DESIGN_DOC_FILE || path.join(root, 'docs', 'design', 'skill-evals.md');
const text = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';

const LANGS = {
  ko: {
    title: '한국어',
    sections: ['전제와 현재 상태', '평가의 종류 비교', '공식 `claude plugin eval`과 직접 만들기', 'CI와 로컬의 분리', '사례의 위치·형식과 통과 기준', '스킬을 바꾼 PR에서의 쓰임', '평가가 재는 것과 재지 못하는 것', '위험', '단계별 도입 순서', '사용자가 고를 결정 목록'],
    rec: /^- 권장:\s*\S/m, kinds: ['문구·스크립트 결정적 검사', '스킬 발동 시험', '결정적 채점기', '모델이 대화 기록을 채점', '정적 검증'],
    cols: ['비용', '신뢰도', '비결정성', 'CI에서'],
    question: /^- 질문:/m, options: /^- 선택지: .*\(a\).*\(b\)/m,
  },
  en: {
    title: 'English',
    sections: ['Premises and current state', 'Kinds of evaluation compared', 'Official `claude plugin eval` versus building our own', 'Split between CI and local', 'Case location, format and pass criteria', 'Use in pull requests that change a skill', 'What evaluation measures and does not measure', 'Risks', 'Staged rollout order', 'Decision list for the user'],
    rec: /^- Recommendation:\s*\S/m, kinds: ['Deterministic wording and script checks', 'Skill trigger tests', 'Deterministic graders', 'Model-graded transcript', 'Static validation'],
    cols: ['Cost', 'Reliability', 'Non-determinism', 'In CI'],
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
  assert.ok(text.length > 0, 'docs/design/skill-evals.md is missing');
  assert.deepStrictEqual([...text.matchAll(/^## (.+)$/gm)].map(m => m[1].trim()), ['한국어', 'English']);
  assert.ok((part('한국어').match(/[가-힣]/g) || []).length > 800, 'the first part is Korean');
  assert.ok((part('English').match(/[가-힣]/g) || []).length < 80, 'the English part is English (a few quoted Korean words)');
});

test('both parts have the same heading structure and the required sections in order', () => {
  assert.deepStrictEqual(headings(part('한국어')), headings(part('English')), 'heading levels and counts must match');
  for (const L of Object.values(LANGS)) assert.deepStrictEqual(level3(part(L.title)), L.sections, L.title + ' sections');
});

test('the comparison table has the five kinds with cost, reliability, non-determinism and CI columns', () => {
  for (const [k, L] of Object.entries(LANGS)) {
    const p = part(L.title);
    for (const kind of L.kinds) assert.ok(p.includes(kind), `${k}: missing kind ${kind}`);
    const head = p.split('\n').find(l => /^\| Kind|^\| 종류/.test(l));
    assert.ok(head, k + ': comparison table header');
    for (const c of L.cols) assert.ok(head.includes(c), `${k}: column ${c}`);
    const rows = p.split('\n').filter(l => /^\| [A-E]\. /.test(l));
    assert.strictEqual(rows.length, 5, k + ': one table row per kind');
    for (const r of rows) assert.strictEqual(r.split('|').length - 2, 5, k + ': five columns: ' + r.slice(0, 30));
  }
});

test('the official tool, its facts and what is unverified are covered in both languages', () => {
  const need = {
    ko: ['claude plugin eval', 'v2.1.269', 'early access', 'claude plugin validate', '/skill-doctor', 'evals/<사례>/prompt.md', 'graders', '`--threshold`', '의존성 0개', '2026-10-30'],
    en: ['claude plugin eval', 'v2.1.269', 'early access', 'claude plugin validate', '/skill-doctor', 'evals/<case>/prompt.md', 'graders', '`--threshold`', 'zero-dependency', '2026-10-30'],
  };
  for (const k of ['ko', 'en']) for (const w of need[k]) assert.ok(part(LANGS[k].title).includes(w), `${k}: missing ${w}`);
  assert.match(part('한국어'), /켜져 있는지[^\n]*\*\*미확인\*\*|\*\*미확인\*\*: 관리자의 계정/);
  assert.match(part('English'), /unverified\*\*: whether it is on for the maintainer's account/);
  assert.match(part('한국어'), /validate[^\n]*\*\*미확인\*\*/);
  assert.match(part('English'), /validate[^\n]*\*\*unverified\*\*/);
});

test('the CI versus local split states there is no model key and no secret in the repository', () => {
  const need = { ko: ['모델 키', '비밀값', '로컬 전용', 'Node 22', '--max-cost-usd'], en: ['model key', 'secret', 'local only', 'Node 22', '--max-cost-usd'] };
  for (const k of ['ko', 'en']) {
    const p = part(LANGS[k].title);
    for (const w of need[k]) assert.ok(p.includes(w), `${k}: missing ${w}`);
  }
});

test('the case section names the location, the format, the run count and the threshold', () => {
  const need = { ko: ['evals/<사례>/', 'prompt.md', 'graders/', '시행 횟수', '문턱', '0.8', '기준선'], en: ['evals/<case>/', 'prompt.md', 'graders/', 'run count', 'threshold', '0.8', 'baseline'] };
  for (const k of ['ko', 'en']) {
    const p = part(LANGS[k].title);
    for (const w of need[k]) assert.ok(p.includes(w), `${k}: missing ${w}`);
  }
});

test('the PR section and the limits section are honest about not being a gate and about what is not measured', () => {
  assert.match(part('한국어'), /병합을 막는 관문이 아닙니다/);
  assert.match(part('English'), /not a gate on merging/);
  assert.match(part('한국어'), /재지 못하는 것:/);
  assert.match(part('English'), /It does not measure:/);
  assert.match(part('한국어'), /"좋다"가 아니라|"스킬이 좋다"가 아닙니다/);
  assert.match(part('English'), /not "the skill is good"/);
});

test('the decision list is last, numbered the same in both parts, and every item has options and a recommendation', () => {
  const ids = {};
  for (const [k, L] of Object.entries(LANGS)) {
    const p = part(L.title);
    const starts = [...p.matchAll(/^### /gm)];
    const tail = p.slice(starts[starts.length - 1].index);
    assert.ok(tail.split('\n')[0].includes(L.sections[9]), k + ': the decision list is the last section');
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

test('the version files agree and equal 0.16.8', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  assert.ok(Array.isArray(market.plugins) && market.plugins.length >= 1);
  for (const v of [plugin.version, ...market.plugins.map(p => p.version)]) assert.strictEqual(v, '0.16.8');
});
