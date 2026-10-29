'use strict';

// Reading a list to its end, or failing. A partial list that looks complete is worse than an error:
// reconcile, status, triage and the deletion gate all decide from what they read.
const MAX_PAGES = 200;

// Offset pages (`page=N&per_page=P`): a page shorter than P is the last one. A full last page is followed
// by one more request, which returns an empty page. `fetchPage` must return the raw page, unfiltered, or
// the "shorter than P" test would stop early.
function readAllPages(fetchPage, { perPage = 100, maxPages = MAX_PAGES, what = 'list' } = {}) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const items = fetchPage(page);
    if (!Array.isArray(items)) throw new Error(`${what}: page ${page} was not a list; refusing to guess`);
    all.push(...items);
    if (items.length < perPage) return all;
  }
  throw new Error(`${what}: still more pages after ${maxPages}; refusing to decide on a partial list`);
}

// Cursor pages (GraphQL): needs a boolean hasNextPage on every page and a new endCursor each time.
function readAllCursors(fetchPage, { maxPages = MAX_PAGES, what = 'list' } = {}) {
  const all = [];
  const seen = new Set();
  let after = null;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = fetchPage(after);
    if (!result || !Array.isArray(result.nodes) || !result.pageInfo || typeof result.pageInfo.hasNextPage !== 'boolean') {
      throw new Error(`${what}: page ${page} came back without paging information; refusing to guess`);
    }
    all.push(...result.nodes);
    if (!result.pageInfo.hasNextPage) return all;
    const next = result.pageInfo.endCursor;
    if (!next || seen.has(next)) throw new Error(`${what}: the paging cursor is empty or repeats; refusing to decide on a partial list`);
    seen.add(next);
    after = next;
  }
  throw new Error(`${what}: still more pages after ${maxPages}; refusing to decide on a partial list`);
}

module.exports = { readAllPages, readAllCursors, MAX_PAGES };
