'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { SECTIONS, skeleton, checkBody } = require('../scripts/lib/pr-body');

const filled = (issue = 3, over = {}) => {
  const text = {
    '요약': '스킬 이름을 setup, plan, build로 바꿉니다.',
    '이유': '시험 사용자가 이름이 직관적이지 않다고 했습니다.',
    '변경 내용': '스킬 폴더와 README의 참조를 모두 맞췄습니다.',
    '테스트': '로컬 48개 통과, 3개 OS CI 통과, 실제 GitHub에서 확인했습니다.',
    '위험과 영향': '기존 초안의 rail 필드는 오류가 납니다. 사용하는 저장소는 아직 없습니다.',
    ...over
  };
  return `${SECTIONS.map(n => `## ${n}\n${text[n]}\n`).join('\n')}\n## 닫히는 이슈\nCloses #${issue}\n`;
};

test('the skeleton lists every section and the closing line but is not acceptable as is', () => {
  const s = skeleton(7);
  for (const n of SECTIONS) assert.match(s, new RegExp(`## ${n}`));
  assert.match(s, /Closes #7/);
  const r = checkBody(s, 7);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.problems.filter(p => /비어 있습니다/.test(p)).length, SECTIONS.length);
});

test('a complete Korean body that closes its own task passes', () => {
  assert.deepStrictEqual(checkBody(filled(3), 3), { ok: true, problems: [] });
});

test('a missing section is reported', () => {
  const body = filled(3).replace(/## 테스트[\s\S]*?(?=## 위험)/, '');
  assert.match(checkBody(body, 3).problems.join('\n'), /"## 테스트" 항목이 없습니다/);
});

test('an empty section is reported', () => {
  assert.match(checkBody(filled(3, { '이유': '  ' }), 3).problems.join('\n'), /"## 이유" 항목이 비어 있습니다/);
});

test('an English-only body is rejected', () => {
  const english = Object.fromEntries(SECTIONS.map(n => [n, 'Renames the skills and updates every reference in the docs.']));
  assert.match(checkBody(filled(3, english), 3).problems.join('\n'), /한글/);
});

test('the closing line must name this task and nothing else', () => {
  assert.match(checkBody(filled(4), 3).problems.join('\n'), /Closes #3.*없습니다/);
  assert.match(checkBody(`${filled(3)}\nFixes #9\n`, 3).problems.join('\n'), /#9/);
});

test('a closing line inside a code fence does not count', () => {
  const body = filled(3).replace('Closes #3', '```\nCloses #3\n```');
  assert.match(checkBody(body, 3).problems.join('\n'), /Closes #3.*없습니다/);
});

const withClosing = (extra) => `${filled(3).replace('Closes #3', 'Closes #3')}${extra}\n`;

test('qualified and URL closing references are rejected even for the same repository', () => {
  assert.match(checkBody(withClosing('Closes dongqdev/ecc-harness#9'), 3).problems.join('\n'), /저장소 이름이나 URL/);
  assert.match(checkBody(withClosing('Closes https://github.com/dongqdev/ecc-harness/issues/9'), 3).problems.join('\n'), /저장소 이름이나 URL/);
});

test('every section needs Korean prose, not just one of them', () => {
  const body = filled(3, { '이유': 'TBD..', '변경 내용': 'TODO.', '테스트': 'N/A..', '위험과 영향': '?????' });
  const text = checkBody(body, 3).problems.join('\n');
  for (const n of ['이유', '변경 내용', '테스트', '위험과 영향']) assert.match(text, new RegExp(`"## ${n}" 항목은 한글`));
});

test('Korean inside a code block or a quote does not satisfy the Korean check', () => {
  const english = 'Renames the skills and updates every reference in the docs.';
  const body = filled(3, { '테스트': `${english}\n\`\`\`\n한글로 쓴 스무 글자가 넘는 문장이 코드 블록 안에만 있습니다\n\`\`\`` });
  assert.match(checkBody(body, 3).problems.join('\n'), /"## 테스트" 항목은 한글/);
  const quoted = filled(3, { '테스트': `${english}\n> 한글로 쓴 스무 글자가 넘는 문장이 인용문 안에만 있습니다` });
  assert.match(checkBody(quoted, 3).problems.join('\n'), /"## 테스트" 항목은 한글/);
});

test('a closing line in ~~~ fences or inline code does not count', () => {
  for (const wrapped of ['~~~\nCloses #3\n~~~', '`Closes #3`']) {
    const body = filled(3).replace('Closes #3', wrapped);
    assert.match(checkBody(body, 3).problems.join('\n'), /Closes #3.*없습니다/, wrapped);
  }
});

test('a heading inside a code fence is not a section', () => {
  const fenced = '```\n' + filled(3).replace(/## 닫히는 이슈[\s\S]*$/, '') + '```\n\n## 닫히는 이슈\nCloses #3\n';
  assert.match(checkBody(fenced, 3).problems.join('\n'), /항목이 없습니다/);
});

test('CRLF line endings are accepted', () => {
  assert.deepStrictEqual(checkBody(filled(3).replace(/\n/g, '\r\n'), 3), { ok: true, problems: [] });
});

test('a closing reference in an indented sub-list item still counts', () => {
  for (const extra of ['- 참고\n    Closes #9', '- 주요 변경 사항을 정리했습니다\n    - 세부: Closes #9 도 함께 처리', '- 참고\n\tFixes #9']) {
    assert.match(checkBody(withClosing(extra), 3).problems.join('\n'), /#9/, extra);
  }
});

test('Korean written in indented sub-list items counts', () => {
  const body = filled(3, {
    '변경 내용': '- 코드\n    - pr-body.js의 한글 검사를 항목별로 바꿈\n    - 닫는 참조 형식 검사 추가',
    '이유': '1. 점검 강화\n    1. 항목마다 한글 다섯 자 이상 요구'
  });
  assert.deepStrictEqual(checkBody(body, 3), { ok: true, problems: [] });
});
