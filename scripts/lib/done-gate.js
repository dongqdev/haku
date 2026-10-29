'use strict';

const { prRefs, SUMMARY_MARKER, parseVerifiedMarker } = require('./model');

// A worker may be deleted only when all of this holds for its task issue:
//   merged-pr               a PR tied to the issue is merged into the default branch
//   issue-closed            the issue is closed
//   worker-summary          the worker left its summary comment (its memory outlives it)
//   post-merge-verification a passing verification was recorded after the merge
function doneCheck(host, issueNumber) {
  const base = host.defaultBranch();
  const issue = host.listIssues().find(i => i.number === issueNumber);
  if (!issue) return { ok: false, missing: ['issue-not-found'], base };

  const missing = [];
  const merged = host.listMergedPrs(base).find(pr => prRefs(pr).has(issueNumber));
  if (!merged) missing.push('merged-pr');
  if (issue.state !== 'closed') missing.push('issue-closed');

  const comments = host.listComments(issueNumber);
  if (!comments.some(c => String(c.body).includes(SUMMARY_MARKER))) missing.push('worker-summary');
  const verified = comments
    .map(c => parseVerifiedMarker(c.body))
    .filter(Boolean)
    .some(v => v.status === 'pass');
  if (!verified) missing.push('post-merge-verification');

  return {
    ok: missing.length === 0,
    missing,
    base,
    pr: merged ? merged.number : null,
    prHead: merged ? merged.headRefOid || null : null
  };
}

module.exports = { doneCheck };
