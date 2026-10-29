'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BASE_LABEL, ownerLabel, labelStyle } = require('./model');
const { readAllPages, readAllCursors } = require('./paginate');

// GitHub host over the gh CLI. Arguments are always passed as an array (no shell),
// and bodies go through temp files, so quoting behaves the same on Windows/macOS/Linux.
// `exec(bin, args, options)` can be injected so tests need no real gh (or shell) on any OS.
const GH_TIMEOUT_MS = 60000;

function createGitHubHost({ repo = null, ghBin = 'gh', exec = execFileSync, perPage = 100 } = {}) {
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

  // owner/name of the repository (the one given, or the one the current folder belongs to).
  let slug = repo;
  function repoSlug() {
    if (!slug) slug = JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
    return slug;
  }

  // REST list through every page. Issues and pull requests share the issues endpoint, so pull requests are
  // dropped only after all pages are read.
  const restList = (route, params, what) => readAllPages(
    page => JSON.parse(gh(['api', `repos/${repoSlug()}/${route}?${params}&per_page=${perPage}&page=${page}`])),
    { perPage, what }
  );
  const issueShape = i => ({
    number: i.number,
    title: i.title,
    body: i.body || '',
    state: String(i.state).toLowerCase(),
    labels: (i.labels || []).map(l => ({ name: typeof l === 'string' ? l : l.name })),
    assignees: (i.assignees || []).map(a => ({ login: a.login }))
  });
  const issuesOnly = items => items.filter(i => !i.pull_request).map(issueShape);

  function createLabel(name) {
    const style = labelStyle(name);
    gh(['label', 'create', name, ...scope, '--force', '--color', style.color, ...(style.description ? ['--description', style.description] : [])]);
  }

  return {
    defaultBranch() {
      const out = gh(['repo', 'view', ...(repo ? [repo] : []), '--json', 'defaultBranchRef']);
      return JSON.parse(out).defaultBranchRef.name;
    },

    // Every haku issue, open and closed, read to the last page (a cut-off list is an error, not a result).
    listIssues() {
      return issuesOnly(restList('issues', `state=all&labels=${encodeURIComponent(BASE_LABEL)}`, 'issue list'));
    },

    // Every open issue, labelled or not: the backlog is mostly issues nobody labelled.
    listBacklog() {
      return issuesOnly(restList('issues', 'state=open', 'open issue list'));
    },

    // One issue by number (not through the list, which lags right after creation).
    getIssue(number) {
      const i = JSON.parse(gh(['issue', 'view', String(number), ...scope, '--json', 'number,title,body,state,labels,assignees']));
      return { ...i, state: String(i.state).toLowerCase() };
    },

    // Every pull request ever opened from this branch, in any state: the branch name alone is not
    // proof, so callers compare the head commit (headRefOid) with the commit they hold.
    prsForBranch(branch) {
      const limit = 100;
      const out = gh(['pr', 'list', ...scope, '--head', branch, '--state', 'all', '--limit', String(limit),
        '--json', 'number,state,mergedAt,headRefOid']);
      const prs = JSON.parse(out);
      // a full answer might have been cut off at the limit; do not decide from it
      if (prs.length >= limit) throw new Error(`pull requests of ${branch}: ${prs.length} results reach the limit of ${limit}; refusing to decide on a partial list`);
      return prs.map(pr => ({ ...pr, state: String(pr.state).toLowerCase() }));
    },

    // Every merged pull request into `base`, newest first, through all pages. The issues a pull request closes
    // come with it; a pull request closing more than the page holds makes the answer incomplete, so it fails.
    listMergedPrs(base) {
      const [owner, name] = repoSlug().split('/');
      const query = 'query($owner:String!,$name:String!,$base:String!,$first:Int!,$after:String){repository(owner:$owner,name:$name){'
        + 'pullRequests(states:MERGED,baseRefName:$base,first:$first,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){'
        + 'pageInfo{hasNextPage endCursor} nodes{number body headRefName headRefOid mergedAt '
        + 'closingIssuesReferences(first:50){pageInfo{hasNextPage} nodes{number}}}}}}';
      const nodes = readAllCursors(after => {
        const args = ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-f', `base=${base}`, '-F', `first=${perPage}`];
        if (after) args.push('-f', `after=${after}`);
        const data = JSON.parse(gh(args));
        if (data.errors && data.errors.length) throw new Error(`merged pull request list: ${data.errors[0].message}`);
        return data.data.repository.pullRequests;
      }, { what: 'merged pull request list' });
      return nodes.map(pr => {
        const refs = pr.closingIssuesReferences || { nodes: [], pageInfo: { hasNextPage: false } };
        if (refs.pageInfo && refs.pageInfo.hasNextPage) {
          throw new Error(`pull request #${pr.number} closes more issues than one page holds; refusing to decide on a partial list`);
        }
        return {
          number: pr.number,
          body: pr.body,
          headRefName: pr.headRefName,
          headRefOid: pr.headRefOid,
          mergedAt: pr.mergedAt,
          closingIssues: refs.nodes.map(r => r.number)
        };
      });
    },

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
      return restList(`issues/${number}/comments`, 'sort=created', `comments of #${number}`).map(c => ({ body: c.body || '' }));
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
