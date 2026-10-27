'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BASE_LABEL } = require('./model');

// GitHub host over the gh CLI. Arguments are always passed as an array (no shell),
// and bodies go through temp files, so quoting behaves the same on Windows/macOS/Linux.
function createGitHubHost({ repo = null, ghBin = 'gh' } = {}) {
  const scope = repo ? ['-R', repo] : [];

  function gh(args, input) {
    return execFileSync(ghBin, args, {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024
    });
  }

  function withBodyFile(body, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-harness-'));
    const file = path.join(dir, 'body.md');
    fs.writeFileSync(file, body, 'utf8');
    try {
      return fn(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  return {
    defaultBranch() {
      const out = gh(['repo', 'view', ...(repo ? [repo] : []), '--json', 'defaultBranchRef']);
      return JSON.parse(out).defaultBranchRef.name;
    },

    listIssues() {
      const out = gh([
        'issue', 'list', ...scope, '--state', 'all', '--label', BASE_LABEL,
        '--limit', '1000', '--json', 'number,title,body,state,labels'
      ]);
      return JSON.parse(out).map(i => ({ ...i, state: String(i.state).toLowerCase() }));
    },

    listMergedPrs(base) {
      const out = gh([
        'pr', 'list', ...scope, '--state', 'merged', '--base', base,
        '--limit', '500', '--json', 'number,body,headRefName,mergedAt,closingIssuesReferences'
      ]);
      return JSON.parse(out).map(pr => ({
        number: pr.number,
        body: pr.body,
        headRefName: pr.headRefName,
        mergedAt: pr.mergedAt,
        closingIssues: (pr.closingIssuesReferences || []).map(r => r.number)
      }));
    },

    ensureLabels(names) {
      for (const name of names) {
        gh(['label', 'create', name, ...scope, '--force', '--color', 'ededed']);
      }
    },

    createIssue({ title, body, labels }) {
      const out = withBodyFile(body, file => gh([
        'issue', 'create', ...scope, '--title', title, '--body-file', file, '--label', labels.join(',')
      ]));
      const m = out.trim().match(/\/issues\/(\d+)\s*$/);
      if (!m) throw new Error(`could not read the new issue number from: ${out.trim()}`);
      return Number(m[1]);
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

    closeIssue(number, comment) {
      withBodyFile(comment, file => {
        gh(['issue', 'comment', String(number), ...scope, '--body-file', file]);
      });
      gh(['issue', 'close', String(number), ...scope, '--reason', 'completed']);
    }
  };
}

module.exports = { createGitHubHost };
