'use strict';

const { RETRO_MARKER, issueType } = require('./model');
const { reportProblems, TRUSTED, MAX_CHARS } = require('./research');

// built from code points so the file holds no line-separator characters
const LINE_BREAKS = new RegExp('[\\r\\n' + String.fromCharCode(0x2028, 0x2029) + ']');
const SKIP_PREFIX = 'retro를 하지 않기로 했습니다: ';
const NOTICE = '> 이 스토리의 회고(retro)를 마쳤습니다. 아래는 반영·등록·거절한 내용의 요약입니다.';

// Leaves the record that a story's retro ran (or was dismissed): one comment on the closed story, the marker as its
// very first line. options: { skipped, reason } - a skipped retro is built from the reason alone.
function markRetroDone(host, storyNumber, text, options = {}) {
  const issue = host.getIssue(storyNumber);
  if (issueType(issue) !== 'story') throw new Error(`#${storyNumber} is not a story issue`);
  if (issue.state !== 'closed') throw new Error(`#${storyNumber} is not closed yet; a retro runs after the story has closed`);
  let body;
  if (options.skipped) {
    const reason = String(options.reason || '').trim();
    if (!reason) throw new Error('a skipped retro needs a reason');
    if (LINE_BREAKS.test(reason)) throw new Error('the reason must be one line');
    body = `${SKIP_PREFIX}${reason}`;
  } else {
    body = String(text || '').replace(/\r\n/g, '\n').trim();
  }
  if (!body) throw new Error('the retro summary is empty');
  if (body.length > MAX_CHARS) throw new Error(`the retro summary is longer than ${MAX_CHARS} characters; shorten it`);
  const problems = reportProblems(body);
  if (problems.length) throw new Error(`the retro summary is not posted (${problems.length}): ${problems.slice(0, 5).join('; ')}. Remove it and try again`);
  if (hasTrustedRetro(host.listComments(storyNumber))) throw new Error(`#${storyNumber} already has a retro marker`);
  host.commentIssue(storyNumber, `${RETRO_MARKER}\n${NOTICE}\n\n${body}`);
  const counted = hasTrustedRetro(host.listComments(storyNumber));
  const result = { posted: true, counted, story: storyNumber, skipped: Boolean(options.skipped), chars: body.length };
  if (!counted) result.warning = 'the marker does not count: the posting account is not an owner, member or collaborator of the repository, so the story stays on the retro-due list';
  return result;
}

// A retro marker counts only as the first line of a comment by someone who may write to the repository.
function hasTrustedRetro(comments) {
  return comments.some(c => String(c.body || '').startsWith(`${RETRO_MARKER}\n`) && TRUSTED.has(c.authorAssociation));
}

// Closed stories without a trusted retro marker, by number. A story whose comments cannot be read is neither due nor hidden:
// it is in `unreadable` with the error. A story closed as not planned never waits. Pass `issues` to avoid a second listing.
function retroDue(host, issues) {
  const all = issues || host.listIssues();
  const due = [];
  const unreadable = [];
  for (const i of all) {
    if (issueType(i) !== 'story' || i.state !== 'closed' || i.stateReason === 'not_planned') continue;
    try {
      if (!hasTrustedRetro(host.listComments(i.number))) due.push({ number: i.number, title: i.title, closedAt: i.closedAt || null });
    } catch (e) {
      unreadable.push({ number: i.number, error: String(e.message || e) });
    }
  }
  const byNumber = (a, b) => a.number - b.number;
  return { due: due.sort(byNumber), unreadable: unreadable.sort(byNumber) };
}

// The retro part of the status view. Only a failed issue list gives { error }; a story that could not be read is listed apart.
function retroForStatus(host, issues) {
  try {
    const r = retroDue(host, issues);
    return { due: r.due.map(x => x.number), unreadable: r.unreadable };
  } catch (e) { return { error: String(e.message || e) }; }
}

// What `retro-due` prints: stdout text, stderr lines and the exit code (3 when some story could not be read).
function renderRetroDue(result, json) {
  const { due, unreadable } = result;
  let stdout;
  if (json) stdout = `${JSON.stringify(result, null, 2)}\n`;
  else if (!due.length && !unreadable.length) stdout = 'no stories wait for a retro\n';
  else stdout = due.map(x => `#${x.number} ${x.title}${x.closedAt ? ` (closed ${x.closedAt})` : ''}\n`).join('');
  return { stdout, stderr: unreadable.map(x => `읽지 못함 #${x.number}: ${x.error}\n`).join(''), code: unreadable.length ? 3 : 0 };
}

module.exports = { renderRetroDue, markRetroDone, retroDue, hasTrustedRetro, retroForStatus };
