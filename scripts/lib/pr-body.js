'use strict';

const { closingRefsFromText } = require('./model');

// Every PR body answers the same questions, in Korean, so the merge-approval screen can be read at a glance.
const MIN_HANGUL = 5;
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

// Lines inside a fenced code block (``` or ~~~) get a zero-width mark so a "## ..." line in an
// example is not read as a section heading. The text itself stays, so it still counts as content.
function maskFences(text) {
  let fence = null;
  return text.split(/\r?\n/).map(line => {
    const m = line.match(/^\s*(```+|~~~+)/);
    if (m) {
      const mark = m[1][0];
      if (fence === null) fence = mark;
      else if (fence === mark) fence = null;
      return `\u200b${line}`;
    }
    return fence === null ? line : `\u200b${line}`;
  }).join('\n');
}

// What a reader would take as the author's own words: no code (fenced, indented, inline) and no quotes.
function proseOf(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/^(?: {4}|\t).*$/gm, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/^\s*>.*$/gm, '');
}

// GitHub also closes issues through "owner/repo#N" and issue URLs, which the bare "#N" parser ignores.
const QUALIFIED_CLOSE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:[\w.-]+\/[\w.-]+#\d+|https?:\/\/\S+\/issues\/\d+)/gi;

function sectionBody(text, name) {
  const lines = maskFences(text).split(/\r?\n/);
  const start = lines.findIndex(l => new RegExp(`^##\\s+${name}\\s*$`).test(l));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^##\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

// ok only when every section exists, has content and Korean prose, and the body closes exactly
// the task it belongs to (no other issue, no qualified reference form).
function checkBody(body, issue) {
  const text = withoutComments(body);
  const problems = [];

  for (const name of SECTIONS) {
    const content = sectionBody(text, name);
    if (content === null) problems.push(`"## ${name}" 항목이 없습니다`);
    else if (content.replace(/\s/g, '').length < 5) problems.push(`"## ${name}" 항목이 비어 있습니다`);
    // Headings are Korean by construction, so Korean is required in each section's own prose.
    else if ((proseOf(content).match(/[가-힣]/g) || []).length < MIN_HANGUL) {
      problems.push(`"## ${name}" 항목은 한글로 ${MIN_HANGUL}자 이상 써야 합니다 (코드와 인용문은 세지 않습니다)`);
    }
  }

  const claims = proseOf(text);
  const qualified = [...claims.matchAll(QUALIFIED_CLOSE)].map(m => m[0].trim());
  if (qualified.length) problems.push(`저장소 이름이나 URL을 붙인 닫는 참조는 쓸 수 없습니다: ${qualified.join(', ')}`);

  const refs = [...closingRefsFromText(claims)];
  if (!refs.includes(issue)) problems.push(`닫는 줄 "Closes #${issue}"이 없습니다`);
  const others = refs.filter(n => n !== issue);
  if (others.length) problems.push(`이 작업 외의 이슈를 닫으려 합니다: ${others.map(n => `#${n}`).join(', ')}`);

  return { ok: problems.length === 0, problems };
}

module.exports = { SECTIONS, skeleton, checkBody };
