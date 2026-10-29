'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { checkClosingLink } = require('../scripts/lib/pr-body');
const { createGitHubHost } = require('../scripts/lib/github-host');

// A fake host that answers with the given lists in turn (the last one repeats) and counts the reads.
function fakeHost(...answers) {
  let reads = 0;
  return {
    get reads() { return reads; },
    prClosingIssues() {
      const issues = answers[Math.min(reads, answers.length - 1)];
      reads += 1;
      return { number: 9, state: 'open', issues };
    }
  };
}
const noWait = () => {};

test('linked to exactly the expected issue: ok, read once, no waiting', () => {
  const h = fakeHost([12]);
  let slept = 0;
  const r = checkClosingLink(h, 9, 12, { sleep: () => { slept += 1; } });
  assert.deepStrictEqual([r.ok, r.problems, r.linked], [true, [], [12]]);
  assert.strictEqual(h.reads, 1);
  assert.strictEqual(slept, 0);
});

test('no link at all fails, after one more read following a pause', () => {
  const h = fakeHost([]);
  const waits = [];
  const r = checkClosingLink(h, 9, 12, { sleep: ms => waits.push(ms), waitMs: 1234 });
  assert.strictEqual(r.ok, false);
  assert.match(r.problems[0], /연결된 이슈가 없다/);
  assert.strictEqual(h.reads, 2, 'read once more, not more');
  assert.deepStrictEqual(waits, [1234]);
});

test('a link that appears after the pause is ok', () => {
  const h = fakeHost([], [12]);
  const r = checkClosingLink(h, 9, 12, { sleep: noWait });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(h.reads, 2);
});

test('another issue, or the expected one plus another, fails', () => {
  assert.match(checkClosingLink(fakeHost([13]), 9, 12, { sleep: noWait }).problems[0], /#13.*#12/);
  const both = checkClosingLink(fakeHost([12, 13]), 9, 12, { sleep: noWait });
  assert.strictEqual(both.ok, false);
  assert.match(both.problems[0], /#12, #13/);
});

test('a link to another issue is not retried (only an empty answer is)', () => {
  const h = fakeHost([13]);
  checkClosingLink(h, 9, 12, { sleep: noWait });
  assert.strictEqual(h.reads, 1);
  const two = fakeHost([12, 13]);
  checkClosingLink(two, 9, 12, { sleep: noWait });
  assert.strictEqual(two.reads, 1);
});

test('the host reads closingIssuesReferences of that pull request, and a full answer is refused', () => {
  const calls = [];
  const exec = (bin, args) => {
    calls.push(args);
    const refs = args.includes('77') ? Array.from({ length: 50 }, (_, i) => ({ number: i + 1 })) : [{ number: 12 }];
    return JSON.stringify({ number: Number(args[2]), state: 'OPEN', closingIssuesReferences: refs });
  };
  const host = createGitHubHost({ repo: 'o/r', exec });
  assert.deepStrictEqual(host.prClosingIssues(9), { number: 9, state: 'open', issues: [12] });
  assert.deepStrictEqual(calls[0].slice(0, 3), ['pr', 'view', '9']);
  assert.ok(calls[0].includes('closingIssuesReferences') || calls[0].some(a => /closingIssuesReferences/.test(a)));
  assert.throws(() => host.prClosingIssues(77), /partial list/);
});
