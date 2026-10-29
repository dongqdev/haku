'use strict';

const {
  issueType,
  parentOf,
  prRefs,
  checklistNumbers,
  ACCEPTED_CLOSE_MARKER
} = require('./model');

// Who may say "this task was closed on purpose": the people who can write to the repository.
const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

// Close what merged but stayed open. Evidence is the host's merge state of a PR
// into the default branch, never the wording of a PR body alone: a task is closed
// only when a merged PR is tied to it by the host's own closing-link data, an
// explicit closing keyword, or the task/<issue>-slug branch convention.
// Story/milestone issues are closed only by roll-up (every child closed).
// How a closed task was closed, from what the host says (never from the wording of a comment alone):
//   merged        a merged pull request into the default branch is tied to it
//   accepted      a repository writer recorded that it was closed on purpose (marker comment)
//   open-pr       only an open pull request is linked
//   closed-pr     only pull requests closed without merging, or merged into another branch
//   none          nothing is linked: it was closed by hand
//   unknown       the host could not be asked, so nothing is claimed
function auditClosure(host, number, base) {
  try {
    const { prs } = host.issueClosers(number);
    if (prs.some(p => p.merged && p.base === base)) return 'merged';
    const accepted = host.listComments(number).some(c => TRUSTED.has(c.authorAssociation) && String(c.body).includes(ACCEPTED_CLOSE_MARKER));
    if (accepted) return 'accepted';
    if (prs.some(p => p.state === 'open')) return 'open-pr';
    return prs.length ? 'closed-pr' : 'none';
  } catch (err) {
    return 'unknown';
  }
}

function reconcile(host, { apply = false } = {}) {
  const base = host.defaultBranch();
  const issues = host.listIssues();
  const byNum = new Map(issues.map(i => [i.number, i]));
  const prs = host.listMergedPrs(base);

  const plan = [];
  const planned = new Set();
  const warnings = [];
  const referenced = new Set();

  for (const pr of prs) {
    const refs = prRefs(pr);

    let linked = false;
    for (const n of refs) {
      const issue = byNum.get(n);
      if (!issue) continue;
      linked = true;
      referenced.add(n);
      if (issueType(issue) !== 'task') continue;
      if (issue.state === 'open' && !planned.has(n)) {
        planned.add(n);
        plan.push({
          kind: 'merged-not-closed',
          issue: n,
          pr: pr.number,
          reason: `PR #${pr.number} merged into ${base}`
        });
      }
    }
    if (!linked) warnings.push({ kind: 'pr-without-issue', pr: pr.number });
  }

  const children = new Map();
  for (const issue of issues) {
    const parent = parentOf(issue);
    if (parent === null) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(issue);
  }

  const byNumber = new Map(issues.map(i => [i.number, i]));
  // Parents held back by the checklist guard. The loop below runs until nothing changes, so a hold is only
  // reported once it is final: a parent that is rolled up in a later pass is not held back after all.
  const holds = new Map();
  const isDone = issue => issue.state === 'closed' || planned.has(issue.number);
  // A task closed without a merged pull request that reconcile knows of is asked about once; the answer is kept.
  const closures = new Map();
  const closureOf = issue => {
    if (!closures.has(issue.number)) closures.set(issue.number, referenced.has(issue.number) ? 'merged' : auditClosure(host, issue.number, base));
    return closures.get(issue.number);
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const issue of issues) {
      const type = issueType(issue);
      if (type !== 'milestone' && type !== 'story') continue;
      if (issue.state !== 'open' || planned.has(issue.number)) continue;
      const kids = children.get(issue.number) || [];
      if (kids.length === 0 || !kids.every(isDone)) continue;
      // The list can lag behind a child created moments ago. A child the parent's own checklist names but the
      // list does not show may still be open, so the parent is not rolled up on this read.
      const named = checklistNumbers(issue);
      const unseen = named.filter(n => !byNumber.has(n));
      if (unseen.length) {
        holds.set(issue.number, { kind: 'child-not-listed', issue: issue.number, children: unseen });
        continue;
      }
      // A child the checklist names and the list shows, still open although it carries no Parent line of its own.
      const open = named.filter(n => !isDone(byNumber.get(n)));
      if (open.length) {
        holds.set(issue.number, { kind: 'child-not-done', issue: issue.number, children: open });
        continue;
      }
      // Every task under it must have been closed by merged work (or on purpose, on record). A hand-closed task
      // would otherwise make the story look finished although nothing was built.
      const unverified = kids.filter(k => issueType(k) === 'task' && k.state === 'closed' && !['merged', 'accepted'].includes(closureOf(k)));
      if (unverified.length) {
        const states = Object.fromEntries(unverified.map(k => [k.number, closureOf(k)]));
        const incomplete = unverified.some(k => states[k.number] === 'unknown');
        holds.set(issue.number, { kind: incomplete ? 'audit-incomplete' : 'child-closed-without-merge', issue: issue.number, children: unverified.map(k => k.number), states });
        continue;
      }
      holds.delete(issue.number);
      planned.add(issue.number);
      plan.push({
        kind: 'rollup',
        issue: issue.number,
        reason: `all ${kids.length} child issue(s) closed`
      });
      changed = true;
    }
  }

  for (const hold of holds.values()) {
    if (!planned.has(hold.issue)) warnings.push(hold);
  }

  for (const issue of issues) {
    if (issueType(issue) === 'task' && issue.state === 'closed' && !referenced.has(issue.number)) {
      warnings.push({ kind: 'closed-without-merged-pr', issue: issue.number });
    }
  }

  const applied = [];
  if (apply) {
    for (const item of plan) {
      host.closeIssue(item.issue, `Closed by haku reconcile: ${item.reason}.`);
      applied.push(item.issue);
    }
  }

  return { base, plan, warnings, applied, dryRun: !apply };
}

// One line of the text report for a warning; children, when there are any, are named so nobody has to
// run --json to learn which issue holds a parent back.
function describeWarning(w) {
  const subject = w.issue ? `#${w.issue}` : `PR #${w.pr}`;
  const name = n => (w.states && w.states[n] ? `#${n} ${w.states[n]}` : `#${n}`);
  const children = w.children ? ` (children: ${w.children.map(name).join(', ')})` : '';
  return `${w.kind} ${subject}${children}`;
}

// Record that the user decided a task was closed on purpose (already fixed, no longer needed) although no merged
// pull request closed it. Only a closed task qualifies, and a reason is required; the marker comment is what
// lets reconcile roll the parent up. The caller asks the user first.
function acceptClosedTask(host, number, reason) {
  if (!reason || !String(reason).trim()) throw new Error('a reason is required: say why this task was closed without a merged pull request');
  const issue = host.getIssue(number);
  if (issueType(issue) !== 'task') throw new Error(`#${number} is not a task; only a task can be accepted as closed on purpose`);
  if (issue.state !== 'closed') throw new Error(`#${number} is still open; close it first (the decision is about a task that is already closed)`);
  host.commentIssue(number, `${ACCEPTED_CLOSE_MARKER}\nClosed on purpose, without a merged pull request: ${String(reason).trim()}`);
}

module.exports = { reconcile, describeWarning, acceptClosedTask };
