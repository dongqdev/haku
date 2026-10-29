'use strict';

const { issueType, parentOf } = require('./model');

const normalize = text => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

// The opening sentence of an issue: the first line of real prose. Comments, code, quotes, template
// labels in bold, and headings are skipped, and a sentence too short to be specific is no key.
function firstSentence(body) {
  const text = String(body || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '');
  const line = text.split(/\r?\n/).map(l => l.trim())
    .find(l => l && !/^(#|>|[-*]\s|\d+\.\s|\|)/.test(l) && !/^\*\*[^*]+\*\*:?$/.test(l));
  if (!line) return '';
  const sentence = normalize(line.split(/(?<=[.!?。])\s/)[0]);
  return sentence.length >= 12 ? sentence : '';
}

// The backlog is the open issues that belong to no story. Stories, and everything that has a Parent,
// are planned work and are never offered for closing here.
function isBacklog(issue) {
  return issue.state === 'open' && issueType(issue) !== 'story' && issueType(issue) !== 'milestone' && parentOf(issue) === null;
}

// Duplicates are looked for inside the backlog only, and only when the title or the opening sentence
// is the same: a wrong "duplicate" would close real work.
function buildTriage(openIssues) {
  const open = openIssues.filter(isBacklog);
  const backlog = open.map(i => ({ number: i.number, title: i.title, type: issueType(i) }));

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

// Why an issue must not be closed by triage, or null when it may be.
function closeBlocker(issue) {
  if (issue.state !== 'open') return `#${issue.number} is already closed`;
  const type = issueType(issue);
  if (type === 'story' || type === 'milestone') return `#${issue.number} is a ${type}; it closes through the reconcile roll-up, not triage`;
  const parent = parentOf(issue);
  if (parent !== null) return `#${issue.number} belongs to #${parent}; planned work closes through its pull request and reconcile, not triage`;
  return null;
}

// The one path triage uses to close an issue: look the issue up by number, refuse what triage must not
// close, require a reason, and close as "not planned" (duplicate or obsolete, not completed work).
function closeForTriage(host, number, reason) {
  if (!reason || !String(reason).trim()) throw new Error('a reason is required: say why the issue is closed');
  const blocker = closeBlocker(host.getIssue(number));
  if (blocker) throw new Error(blocker);
  host.closeIssue(number, `Closed by haku triage: ${String(reason).trim()}`, 'not planned');
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

module.exports = { buildTriage, renderTriage, firstSentence, closeBlocker, closeForTriage, isBacklog };
