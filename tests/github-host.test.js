'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createGitHubHost } = require('../scripts/lib/github-host');

// A fake gh: records every call and answers by the first two arguments.
function fakeExec(handlers) {
  const calls = [];
  const exec = (bin, args) => {
    calls.push(args);
    const key = args.slice(0, 2).join(' ');
    const h = handlers[key];
    if (h === undefined) throw new Error(`unexpected gh call: ${key}`);
    return typeof h === 'function' ? h(args) : h;
  };
  return { exec, calls };
}

const created = 'https://github.com/o/r/issues/7\n';
const host = exec => createGitHubHost({ repo: 'o/r', exec });
const base = { title: 't', body: 'b', labels: ['haku'] };

test('an assignee that stuck needs no owner label', () => {
  const { exec, calls } = fakeExec({
    'issue create': created,
    'issue view': JSON.stringify({ assignees: [{ login: 'Dongq' }] })
  });
  assert.strictEqual(host(exec).createIssue({ ...base, assignee: 'dongq' }), 7);
  assert.ok(!calls.some(a => a[0] === 'label' || a[0] === 'issue' && a[1] === 'edit'));
});

test('a silently dropped assignee gets an owner label', () => {
  const { exec, calls } = fakeExec({
    'issue create': created,
    'issue view': JSON.stringify({ assignees: [] }),
    'label create': '',
    'issue edit': ''
  });
  assert.strictEqual(host(exec).createIssue({ ...base, assignee: 'stranger' }), 7);
  assert.ok(calls.some(a => a[0] === 'label' && a[2] === 'owner:stranger'));
  const edit = calls.find(a => a[0] === 'issue' && a[1] === 'edit');
  assert.deepStrictEqual(edit.slice(-2), ['--add-label', 'owner:stranger']);
});

test('a failure after creation still returns the issue number', () => {
  const { exec } = fakeExec({
    'issue create': created,
    'issue view': () => { throw new Error('network down'); }
  });
  assert.strictEqual(host(exec).createIssue({ ...base, assignee: 'dongq' }), 7);
});

test('@me is resolved to the real login before comparing', () => {
  const { exec, calls } = fakeExec({
    'api user': 'dongq\n',
    'issue create': created,
    'issue view': JSON.stringify({ assignees: [{ login: 'dongq' }] })
  });
  host(exec).createIssue({ ...base, assignee: '@me' });
  assert.ok(!calls.some(a => a[0] === 'label'));
  assert.ok(calls.find(a => a[1] === 'create').includes('dongq'));
});

test('without an assignee nothing extra is called', () => {
  const { exec, calls } = fakeExec({ 'issue create': created });
  assert.strictEqual(host(exec).createIssue(base), 7);
  assert.strictEqual(calls.length, 1);
});
