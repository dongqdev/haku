'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BASE_LABEL, ownerLabel, labelStyle } = require('./model');

// GitHub host over the gh CLI. Arguments are always passed as an array (no shell),
// and bodies go through temp files, so quoting behaves the same on Windows/macOS/Linux.
// `exec(bin, args, options)` can be injected so tests need no real gh (or shell) on any OS.
const GH_TIMEOUT_MS = 60000;

function createGitHubHost({ repo = null, ghBin = 'gh', exec = execFileSync } = {}) {
  const scope = repo ? ['-R', repo] : [];

  function gh(args, input) {
    return exec(ghBin, args, {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      // A hung gh must not hang a safety check; a timeout throws and the caller fails closed.
      timeout: GH_TIMEOUT_MS
    });
  }

  function withBodyFile(body, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-'));
    const file = path.join(dir, 'body.md');
    fs.writeFileSync(file, body, 'utf8');
    try {
      return fn(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function createLabel(name) {
    const style = labelStyle(name);
    gh(['label', 'create', name, ...scope, '--force', '--color', style.color, ...(style.description ? ['--description', style.description] : [])]);
  }

  return {
    defaultBranch() {
      const out = gh(['repo', 'view', ...(repo ? [repo] : []), '--json', 'defaultBranchRef']);
      return JSON.parse(out).defaultBranchRef.name;
    },

    listIssues() {
      const out = gh([
        'issue', 'list', ...scope, '--state', 'all', '--label', BASE_LABEL,
        '--limit', '1000', '--json', 'number,title,body,state,labels,assignees'
      ]);
      return JSON.parse(out).map(i => ({ ...i, state: String(i.state).toLowerCase() }));
    },

    // Every open issue, labelled or not: the backlog is mostly issues nobody labelled.
    listBacklog() {
      const out = gh([
        'issue', 'list', ...scope, '--state', 'open', '--limit', '1000', '--json', 'number,title,body,state,labels,assignees'
      ]);
      return JSON.parse(out).map(i => ({ ...i, state: String(i.state).toLowerCase() }));
    },

    // One issue by number (not through the list, which lags right after creation).
    getIssue(number) {
      const i = JSON.parse(gh(['issue', 'view', String(number), ...scope, '--json', 'number,title,body,state,labels,assignees']));
      return { ...i, state: String(i.state).toLowerCase() };
    },

    // Every pull request ever opened from this branch, in any state: the branch name alone is not
    // proof, so callers compare the head commit (headRefOid) with the commit they hold.
    prsForBranch(branch) {
      const out = gh(['pr', 'list', ...scope, '--head', branch, '--state', 'all', '--limit', '30',
        '--json', 'number,state,mergedAt,headRefOid']);
      return JSON.parse(out).map(pr => ({ ...pr, state: String(pr.state).toLowerCase() }));
    },

    listMergedPrs(base) {
      const out = gh([
        'pr', 'list', ...scope, '--state', 'merged', '--base', base,
        '--limit', '500', '--json', 'number,body,headRefName,headRefOid,mergedAt,closingIssuesReferences'
      ]);
      return JSON.parse(out).map(pr => ({
        number: pr.number,
        body: pr.body,
        headRefName: pr.headRefName,
        headRefOid: pr.headRefOid,
        mergedAt: pr.mergedAt,
        closingIssues: (pr.closingIssuesReferences || []).map(r => r.number)
      }));
    },

    // --force also updates the colour and description of a label that already exists.
    ensureLabels(names) {
      for (const name of names) createLabel(name);
    },

    // The assignee owns the issue. GitHub silently drops an assignee it cannot assign (for example
    // someone who is not a collaborator) instead of failing, so the result is checked after creation
    // and an owner:<name> label is added when the assignment did not stick.
    createIssue({ title, body, labels, assignee: requested }) {
      // "@me" is a gh convenience; compare against the real login.
      const assignee = requested === '@me' ? gh(['api', 'user', '--jq', '.login']).trim() : requested;
      const out = withBodyFile(body, file => gh([
        'issue', 'create', ...scope, '--title', title, '--body-file', file,
        '--label', labels.join(','),
        ...(assignee ? ['--assignee', assignee] : [])
      ]));
      const m = out.trim().match(/\/issues\/(\d+)\s*$/);
      if (!m) throw new Error(`could not read the new issue number from: ${out.trim()}`);
      const number = Number(m[1]);
      if (assignee) {
        // The issue already exists, so a failure here must not lose its number (a retry would
        // create a duplicate); it is reported and the number is still returned.
        try {
          const assigned = JSON.parse(gh(['issue', 'view', String(number), ...scope, '--json', 'assignees']))
            .assignees.map(a => String(a.login).toLowerCase());
          if (!assigned.includes(String(assignee).toLowerCase())) {
            const label = ownerLabel(assignee);
            createLabel(label);
            gh(['issue', 'edit', String(number), ...scope, '--add-label', label]);
          }
        } catch (err) {
          process.stderr.write(`[haku] warning: issue #${number} created, but the owner could not be recorded: ${String(err.message).split('\n')[0]}\n`);
        }
      }
      return number;
    },

    updateIssueBody(number, body) {
      withBodyFile(body, file => gh(['issue', 'edit', String(number), ...scope, '--body-file', file]));
    },

    listComments(number) {
      const out = gh(['issue', 'view', String(number), ...scope, '--json', 'comments']);
      return JSON.parse(out).comments.map(c => ({ body: c.body }));
    },

    commentIssue(number, body) {
      withBodyFile(body, file => gh(['issue', 'comment', String(number), ...scope, '--body-file', file]));
    },

    // Work that merged is "completed"; triage closes (duplicate, obsolete) are "not planned".
    closeIssue(number, comment, stateReason = 'completed') {
      withBodyFile(comment, file => {
        gh(['issue', 'comment', String(number), ...scope, '--body-file', file]);
      });
      gh(['issue', 'close', String(number), ...scope, '--reason', stateReason]);
    }
  };
}

module.exports = { createGitHubHost };
