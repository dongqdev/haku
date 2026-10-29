'use strict';

const {
  issueType,
  parentOf,
  prRefs,
  checklistNumbers
} = require('./model');

// Close what merged but stayed open. Evidence is the host's merge state of a PR
// into the default branch, never the wording of a PR body alone: a task is closed
// only when a merged PR is tied to it by the host's own closing-link data, an
// explicit closing keyword, or the task/<issue>-slug branch convention.
// Story/milestone issues are closed only by roll-up (every child closed).
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
  const isDone = issue => issue.state === 'closed' || planned.has(issue.number);
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
        warnings.push({ kind: 'child-not-listed', issue: issue.number, children: unseen });
        continue;
      }
      // A child the checklist names and the list shows, still open although it carries no Parent line of its own.
      const open = named.filter(n => !isDone(byNumber.get(n)));
      if (open.length) {
        warnings.push({ kind: 'child-not-done', issue: issue.number, children: open });
        continue;
      }
      planned.add(issue.number);
      plan.push({
        kind: 'rollup',
        issue: issue.number,
        reason: `all ${kids.length} child issue(s) closed`
      });
      changed = true;
    }
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
  const children = w.children ? ` (children: ${w.children.map(n => `#${n}`).join(', ')})` : '';
  return `${w.kind} ${subject}${children}`;
}

module.exports = { reconcile, describeWarning };
