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

// Reads a list twice (or more) until two reads hold the same members, and returns it without duplicates.
// While a list is being read, an issue created, deleted, moved or relabelled shifts the items behind it, so
// one item can appear twice or be skipped without any error. Two reads that agree on who is in the list make
// that unlikely; reads that never agree are an error, not a result. `key` identifies an item.
function readStable(read, { key = x => x.number, attempts = 4, what = 'list' } = {}) {
  const unique = items => [...new Map(items.map(it => [key(it), it])).values()];
  const members = items => items.map(key).sort().join(',');
  let previous = null;
  for (let i = 1; i <= attempts; i += 1) {
    const current = unique(read());
    const id = members(current);
    if (previous !== null && previous === id) return current;
    previous = id;
  }
  throw new Error(`${what}: the list kept changing while it was read (${attempts} reads); refusing to decide on a possibly incomplete list`);
}

module.exports = { readAllPages, readAllCursors, readStable, MAX_PAGES };
