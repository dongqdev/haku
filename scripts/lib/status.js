'use strict';

const { issueType, parentOf, dependsOn } = require('./model');

// Read-only view of where the work stands. Pure: it takes the issue list (and the local worker
// records) and returns plain data, so the same numbers feed the table and --json.
function storyOf(issue, byNumber) {
  let cur = issue;
  for (let depth = 0; depth < 6 && cur; depth += 1) {
    if (issueType(cur) === 'story') return cur;
    const parent = parentOf(cur);
    cur = parent === null ? null : byNumber.get(parent);
  }
  return null;
}

function buildStatus(issues, workers = []) {
  const byNumber = new Map(issues.map(i => [i.number, i]));
  const tasks = issues.filter(i => issueType(i) === 'task');
  const stories = new Map();
  const running = new Set(workers.map(w => w.issue));
  const ready = [];
  const blocked = [];
  const unattached = [];
  const underClosedStory = [];

  for (const t of tasks) {
    const story = storyOf(t, byNumber);
    if (!story) { if (t.state === 'open') unattached.push(t.number); continue; }
    if (!stories.has(story.number)) stories.set(story.number, { number: story.number, title: story.title, open: 0, closed: 0 });
    stories.get(story.number)[t.state === 'closed' ? 'closed' : 'open'] += 1;

    if (t.state === 'closed') continue;
    if (story.state === 'closed') { underClosedStory.push(t.number); continue; }
    if (running.has(t.number)) continue;
    const waiting = dependsOn(t).filter(n => !byNumber.has(n) || byNumber.get(n).state !== 'closed');
    if (waiting.length) blocked.push({ number: t.number, title: t.title, story: story.number, waitingFor: waiting });
    else ready.push({ number: t.number, title: t.title, story: story.number });
  }

  // Parents still open although every child is closed: a close that never rolled up.
  const children = new Map();
  for (const i of issues) {
    const p = parentOf(i);
    if (p !== null) children.set(p, [...(children.get(p) || []), i]);
  }
  const incompleteClose = issues
    .filter(i => i.state === 'open' && ['story', 'milestone'].includes(issueType(i)))
    .filter(i => (children.get(i.number) || []).length > 0 && children.get(i.number).every(c => c.state === 'closed'))
    .map(i => ({ number: i.number, type: issueType(i), title: i.title, children: children.get(i.number).length }));

  return {
    stories: [...stories.values()].sort((a, b) => a.number - b.number),
    ready,
    blocked,
    inProgress: workers.map(w => ({ number: w.issue, branch: w.branch, startedAt: w.startedAt })),
    incompleteClose,
    unattached,
    underClosedStory
  };
}

const table = (title, header, rows) => {
  const lines = [`### ${title}`];
  if (!rows.length) return `${lines[0]}\n(없음)\n`;
  lines.push(`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`);
  for (const r of rows) lines.push(`| ${r.join(' | ')} |`);
  return `${lines.join('\n')}\n`;
};

// Closed stories still waiting for a retro. Nothing for zero; a failed read says so instead of claiming zero.
function renderRetro(retro) {
  if (!retro) return '';
  if (retro.error) return '\nretro 대기: 확인하지 못함\n';
  if (!retro.due.length) return '';
  return `\nretro 대기 ${retro.due.length}개: ${retro.due.map(n => `#${n}`).join(', ')}\n`;
}

// All five sections are always printed, so an empty section reads as "none", not "cut off".
function renderStatus(s) {
  return [
    table('스토리 진행', ['스토리', '열린 태스크', '닫힌 태스크'], s.stories.map(x => [`#${x.number} ${x.title}`, x.open, x.closed])),
    table('지금 시작할 수 있음', ['태스크', '스토리'], s.ready.map(x => [`#${x.number} ${x.title}`, `#${x.story}`])),
    table('막힘', ['태스크', '기다리는 이슈'], s.blocked.map(x => [`#${x.number} ${x.title}`, x.waitingFor.map(n => `#${n}`).join(', ')])),
    table('진행 중(워커)', ['이슈', '브랜치', '시작'], s.inProgress.map(x => [`#${x.number}`, x.branch, x.startedAt])),
    table('마감 미완 (자식은 모두 닫혔는데 부모가 열림)', ['이슈', '종류', '자식 수'], s.incompleteClose.map(x => [`#${x.number} ${x.title}`, x.type, x.children]))
  ].join('\n')
    + (s.unattached.length ? `\n스토리에 속하지 않은 열린 태스크: ${s.unattached.map(n => `#${n}`).join(', ')}\n` : '')
    + (s.underClosedStory.length ? `\n닫힌 스토리 아래의 열린 태스크: ${s.underClosedStory.map(n => `#${n}`).join(', ')}\n` : '')
    + renderRetro(s.retro);
}

module.exports = { buildStatus, renderStatus };
