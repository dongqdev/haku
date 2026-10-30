'use strict';

const { RETRO_MARKER, issueType } = require('./model');
const { reportProblems, TRUSTED, MAX_CHARS } = require('./research');

const NOTICE = '> 이 스토리의 회고(retro)를 마쳤습니다. 아래는 반영·등록·거절한 내용의 요약입니다.';

// Leaves the record that a story's retro ran: one comment on the closed story, the marker as its very first line.
function markRetroDone(host, storyNumber, text) {
  const issue = host.getIssue(storyNumber);
  if (issueType(issue) !== 'story') throw new Error(`#${storyNumber} is not a story issue`);
  if (issue.state !== 'closed') throw new Error(`#${storyNumber} is not closed yet; a retro runs after the story has closed`);
  const body = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!body) throw new Error('the retro summary is empty');
  if (body.length > MAX_CHARS) throw new Error(`the retro summary is longer than ${MAX_CHARS} characters; shorten it`);
  const problems = reportProblems(body);
  if (problems.length) throw new Error(`the retro summary is not posted (${problems.length}): ${problems.slice(0, 5).join('; ')}. Remove it and try again`);
  host.commentIssue(storyNumber, `${RETRO_MARKER}\n${NOTICE}\n\n${body}`);
  return { posted: true, story: storyNumber, chars: body.length };
}

// A retro marker counts only as the first line of a comment by someone who may write to the repository.
function hasTrustedRetro(comments) {
  return comments.some(c => String(c.body || '').startsWith(`${RETRO_MARKER}\n`) && TRUSTED.has(c.authorAssociation));
}

// Closed stories without a trusted retro marker, by number. A comment read that fails is thrown, never read as "none".
function retroDue(host) {
  return host.listIssues()
    .filter(i => issueType(i) === 'story' && i.state === 'closed')
    .filter(i => !hasTrustedRetro(host.listComments(i.number)))
    .map(i => ({ number: i.number, title: i.title, closedAt: i.closedAt || i.closed_at || null }))
    .sort((a, b) => a.number - b.number);
}

// The retro part of the status view: the waiting numbers, or the error text when a read failed (never an empty list then).
function retroForStatus(host) {
  try { return { due: retroDue(host).map(x => x.number) }; } catch (e) { return { error: String(e.message || e) }; }
}

module.exports = { markRetroDone, retroDue, hasTrustedRetro, retroForStatus };
