'use strict';

const { closingRefsFromText } = require('./model');

// Every PR body answers the same questions, in Korean, so the merge-approval screen can be read at a glance.
const SECTIONS = ['요약', '이유', '변경 내용', '테스트', '위험과 영향'];

const GUIDE = {
  '요약': '무엇을 바꿨는지 한두 문장으로.',
  '이유': '왜 필요한지: 배경, 문제, 관련 이슈.',
  '변경 내용': '주요 파일과 동작의 변화. 변경하지 않은 것 중 오해하기 쉬운 것도 적는다.',
  '테스트': '실행한 명령과 결과(통과/실패 개수), 실제 환경에서 확인한 것, 확인하지 못한 것을 구분해서 적는다.',
  '위험과 영향': '호환성, 되돌리는 방법, 남은 위험, 후속으로 다룰 일. 없으면 "없음"과 그 근거.'
};

function skeleton(issue) {
  const parts = SECTIONS.map(name => `## ${name}\n<!-- ${GUIDE[name]} -->\n`);
  parts.push(`## 닫히는 이슈\nCloses #${issue}\n`);
  return parts.join('\n');
}

function withoutComments(text) {
  return String(text || '').replace(/<!--[\s\S]*?-->/g, '');
}

function sectionBody(text, name) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => new RegExp(`^##\\s+${name}\\s*$`).test(l));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^##\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

// ok only when every section exists and has content, the text is Korean, and the body
// closes exactly the task it belongs to.
function checkBody(body, issue) {
  const text = withoutComments(body);
  const problems = [];
  const contents = [];

  for (const name of SECTIONS) {
    const content = sectionBody(text, name);
    if (content === null) problems.push(`"## ${name}" 항목이 없습니다`);
    else if (content.replace(/\s/g, '').length < 5) problems.push(`"## ${name}" 항목이 비어 있습니다`);
    else contents.push(content);
  }

  // Headings are Korean by construction, so only the written content counts as "written in Korean".
  if ((contents.join('\n').match(/[가-힣]/g) || []).length < 20) problems.push('본문이 한글로 작성되지 않았습니다 (항목 내용의 한글이 20자 미만)');

  const refs = [...closingRefsFromText(text)];
  if (!refs.includes(issue)) problems.push(`닫는 줄 "Closes #${issue}"이 없습니다`);
  const others = refs.filter(n => n !== issue);
  if (others.length) problems.push(`이 작업 외의 이슈를 닫으려 합니다: ${others.map(n => `#${n}`).join(', ')}`);

  return { ok: problems.length === 0, problems };
}

module.exports = { SECTIONS, skeleton, checkBody };
