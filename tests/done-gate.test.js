'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { doneCheck } = require('../scripts/lib/done-gate');
const { SUMMARY_MARKER, verifiedMarker } = require('../scripts/lib/model');

function host({ state = 'closed', prs = [], comments = [] } = {}) {
  return {
    defaultBranch: () => 'main',
    listIssues: () => [{ number: 5, state, body: '', labels: [] }],
    listMergedPrs: () => prs,
    listComments: () => comments.map(body => ({ body }))
  };
}

const mergedPr = { number: 9, body: '', headRefName: 'task/5-x', closingIssues: [] };
const summary = `${SUMMARY_MARKER}\nwhat I did`;
const passed = verifiedMarker({ kind: 'T1', status: 'pass', sha: 'abc' });

test('all four conditions met -> worker may be deleted', () => {
  const r = doneCheck(host({ prs: [mergedPr], comments: [summary, passed] }), 5);
  assert.deepStrictEqual(r, { ok: true, missing: [], base: 'main', pr: 9 });
});

test('each missing condition is reported separately', () => {
  assert.deepStrictEqual(doneCheck(host({ prs: [], comments: [summary, passed] }), 5).missing, ['merged-pr']);
  assert.deepStrictEqual(doneCheck(host({ state: 'open', prs: [mergedPr], comments: [summary, passed] }), 5).missing, ['issue-closed']);
  assert.deepStrictEqual(doneCheck(host({ prs: [mergedPr], comments: [passed] }), 5).missing, ['worker-summary']);
  assert.deepStrictEqual(doneCheck(host({ prs: [mergedPr], comments: [summary] }), 5).missing, ['post-merge-verification']);
});

test('a failed verification record does not count', () => {
  const failed = verifiedMarker({ kind: 'T1', status: 'fail', sha: 'abc' });
  const r = doneCheck(host({ prs: [mergedPr], comments: [summary, failed] }), 5);
  assert.deepStrictEqual(r.missing, ['post-merge-verification']);
});

test('unknown issue is refused', () => {
  assert.strictEqual(doneCheck(host(), 99).ok, false);
});
