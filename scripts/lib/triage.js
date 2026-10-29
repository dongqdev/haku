'use strict';

const { issueType, parentOf } = require('./model');

const normalize = text => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

// The first sentence under the first heading (or the first line): "what this issue is about".
function firstSentence(body) {
  const line = String(body || '').split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('#') && !l.startsWith('<!--'));
  if (!line) return '';
  return normalize(line.split(/(?<=[.!?。])\s/)[0]);
}

// Duplicates only when the title is the same or the opening sentence is the same, nothing fuzzier:
// a wrong "duplicate" would close real work.
function buildTriage(issues) {
  const open = issues.filter(i => i.state === 'open');
  const backlog = open
    .filter(i => issueType(i) !== 'story' && parentOf(i) === null)
    .map(i => ({ number: i.number, title: i.title, type: issueType(i) }));

  const groups = [];
  const seen = new Set();
  const group = (reason, keyOf) => {
    const byKey = new Map();
    for (const i of open) {
      const key = keyOf(i);
      if (key) byKey.set(key, [...(byKey.get(key) || []), i.number]);
    }
    for (const numbers of byKey.values()) {
      const id = numbers.join(',');
      if (numbers.length > 1 && !seen.has(id)) { seen.add(id); groups.push({ reason, issues: numbers }); }
    }
  };
  group('같은 제목', i => normalize(i.title));
  group('본문의 첫 문장이 같음', i => firstSentence(i.body));

  return { backlog, duplicates: groups };
}

function renderTriage(t) {
  const backlog = t.backlog.length
    ? ['| 이슈 | 종류 |', '|---|---|', ...t.backlog.map(b => `| #${b.number} ${b.title} | ${b.type || '-'} |`)].join('\n')
    : '(없음)';
  const dup = t.duplicates.length
    ? ['| 이슈 | 이유 |', '|---|---|', ...t.duplicates.map(d => `| ${d.issues.map(n => `#${n}`).join(', ')} | ${d.reason} |`)].join('\n')
    : '(없음)';
  return `### 스토리에 속하지 않은 열린 이슈\n${backlog}\n\n### 중복 후보\n${dup}\n`;
}

module.exports = { buildTriage, renderTriage, firstSentence };
