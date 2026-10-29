'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { BASE_LABEL, ownerLabel, labelStyle } = require('./model');
const { readAllPages, readAllCursors, readStable } = require('./paginate');

// GitHub host over the gh CLI. Arguments are always passed as an array (no shell),
// and bodies go through temp files, so quoting behaves the same on Windows/macOS/Linux.
// `exec(bin, args, options)` can be injected so tests need no real gh (or shell) on any OS.
const GH_TIMEOUT_MS = 60000;

function createGitHubHost({ repo = null, ghBin = 'gh', exec = execFileSync, perPage: requestedPerPage = 100 } = {}) {
  // GitHub answers at most 100 per page; asking for more would make a full page look like a short one.
  const perPage = Math.max(1, Math.min(100, Number(requestedPerPage) || 100));
  // OWNER/REPO, or HOST/OWNER/REPO for another GitHub host; `gh api` needs the pieces separately.
  const parts = repo ? repo.split('/') : [];
  if (repo && (parts.length < 2 || parts.length > 3 || parts.some(p => !p))) {
    throw new Error(`repo must be OWNER/REPO or HOST/OWNER/REPO, got "${repo}"`);
  }
  const apiHost = parts.length === 3 ? ['--hostname', parts[0]] : [];
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
  let slug = repo ? parts.slice(-2).join('/') : null;
  function repoSlug() {
    if (!slug) slug = JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
    return slug;
  }

  // REST list through every page. Issues and pull requests share the issues endpoint, so pull requests are
  // dropped only after all pages are read.
  // The list is read twice and must agree (see readStable); duplicates are dropped by `key`.
  const restList = (route, params, what, key = i => i.number) => readStable(
    () => readAllPages(
      page => JSON.parse(gh(['api', ...apiHost, `repos/${repoSlug()}/${route}?${params ? `${params}&` : ''}per_page=${perPage}&page=${page}`])),
      { perPage, what }
    ),
    { key, what }
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
      // oldest first: an issue created while reading lands at the end instead of shifting the pages
      return issuesOnly(restList('issues', `state=all&sort=created&direction=asc&labels=${encodeURIComponent(BASE_LABEL)}`, 'issue list'));
    },

    // Every open issue, labelled or not: the backlog is mostly issues nobody labelled.
    listBacklog() {
      return issuesOnly(restList('issues', 'state=open&sort=created&direction=asc', 'open issue list'));
    },

    // One issue by number (not through the list, which lags right after creation).
    getIssue(number) {
      const i = JSON.parse(gh(['issue', 'view', String(number), ...scope, '--json', 'number,title,body,state,labels,assignees,url']));
      return { ...i, state: String(i.state).toLowerCase() };
    },

    // The issues GitHub itself will close when this pull request merges (what "Closes #N" really linked).
    // A full answer might have been cut off, so it is an error rather than a result.
    prClosingIssues(number) {
      const limit = 50;
      const pr = JSON.parse(gh(['pr', 'view', String(number), ...scope, '--json', 'number,state,closingIssuesReferences']));
      const refs = pr.closingIssuesReferences || [];
      if (refs.length >= limit) throw new Error(`pull request #${number} links ${refs.length} issues, which reaches the limit of ${limit}; refusing to decide on a partial list`);
      // The repository comes with every reference: "#20" of another repository is not this repository's #20.
      const repoOf = r => (r.repository && r.repository.owner && r.repository.name ? `${r.repository.owner.login}/${r.repository.name}` : null);
      return { number: pr.number, state: String(pr.state).toLowerCase(), repo: repoSlug(), issues: refs.map(r => ({ number: r.number, repo: repoOf(r) })) };
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
        + 'pullRequests(states:MERGED,baseRefName:$base,first:$first,after:$after,orderBy:{field:CREATED_AT,direction:ASC}){'
        + 'pageInfo{hasNextPage endCursor} nodes{number body headRefName headRefOid mergedAt '
        + 'closingIssuesReferences(first:50){pageInfo{hasNextPage} nodes{number}}}}}}';
      // created, oldest first: neither changes when a pull request is commented on or edited mid-read
      const nodes = readStable(() => readAllCursors(after => {
        const args = ['api', ...apiHost, 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-f', `base=${base}`, '-F', `first=${perPage}`];
        if (after) args.push('-f', `after=${after}`);
        const data = JSON.parse(gh(args));
        if (data.errors && data.errors.length) throw new Error(`merged pull request list: ${data.errors[0].message}`);
        return data.data.repository.pullRequests;
      }, { what: 'merged pull request list' }), { key: pr => pr.number, what: 'merged pull request list' });
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

    // How this issue was closed, and by what. The last close event says who closed it now (a reopened and hand-closed
    // issue must not keep the credit of an earlier merged pull request); the linked pull requests are kept to tell an
    // open or unmerged one from nothing at all. A full page may be cut off, which is an error, not an answer.
    issueClosers(number) {
      const [owner, name] = repoSlug().split('/');
      const query = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){state '
        + 'closedByPullRequestsReferences(first:50,includeClosedPrs:true){pageInfo{hasNextPage} nodes{number state merged baseRefName}} '
        + 'timelineItems(itemTypes:[CLOSED_EVENT],last:1){nodes{... on ClosedEvent{createdAt stateReason closer{__typename ... on PullRequest{number merged baseRefName} ... on Commit{oid}}}}}}}}';
      const data = JSON.parse(gh(['api', ...apiHost, 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${number}`]));
      if (data.errors && data.errors.length) throw new Error(`closing pull requests of #${number}: ${data.errors[0].message}`);
      const issue = data.data.repository.issue;
      if (!issue) throw new Error(`issue #${number} not found`);
      const refs = issue.closedByPullRequestsReferences;
      if (refs.pageInfo.hasNextPage) throw new Error(`#${number} has more closing pull requests than one page holds; refusing to decide on a partial list`);
      const event = (issue.timelineItems.nodes || [])[0] || null;
      const closer = event && event.closer ? event.closer : null;
      return {
        state: String(issue.state).toLowerCase(),
        closedAt: event ? event.createdAt : null,
        stateReason: event && event.stateReason ? String(event.stateReason).toLowerCase() : null,
        closedBy: !closer ? { type: 'none' }
          : closer.__typename === 'PullRequest' ? { type: 'pr', number: closer.number, merged: Boolean(closer.merged), base: closer.baseRefName }
            : { type: 'commit' },
        prs: refs.nodes.map(p => ({ number: p.number, state: String(p.state).toLowerCase(), merged: Boolean(p.merged), base: p.baseRefName }))
      };
    },

    listComments(number) {
      return restList(`issues/${number}/comments`, '', `comments of #${number}`, c => c.id)
        .map(c => ({ body: c.body || '', authorAssociation: c.author_association || 'NONE', createdAt: c.created_at || null }));
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
