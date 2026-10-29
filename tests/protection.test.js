'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { checkProtection, classifyProtection, classifyRules, classifyRulesets, modeOf, protectionReport, renderProtection, STATES } = require('../scripts/lib/protection');
const { createGitHubHost } = require('../scripts/lib/github-host');
const { readConfig } = require('../scripts/lib/config');
const { validateDraft, publish } = require('../scripts/lib/publish');

const cli = path.join(__dirname, '..', 'scripts', 'issues.js');

// The texts below are the real answers of GitHub, read on 2026-10-30.
const UPGRADE = '{"message":"Upgrade to GitHub Pro or make this repository public to enable this feature.","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"403"}gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)';
const NOT_PROTECTED = '{"message":"Branch not protected","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"404"}gh: Branch not protected (HTTP 404)';
const NOT_FOUND = '{"message":"Not Found","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"404"}gh: Not Found (HTTP 404)';
// The documented shape of a protected branch (not seen on a repository of ours).
const STRONG = { url: 'x', required_pull_request_reviews: { required_approving_review_count: 1 }, enforce_admins: { enabled: true }, required_status_checks: { contexts: ['test'] } };

test('the real answers of GitHub are told apart', () => {
  assert.strictEqual(classifyProtection({ ok: true, body: JSON.stringify(STRONG) }), 'protected');
  assert.strictEqual(classifyProtection({ ok: false, text: UPGRADE }), 'unavailable');
  assert.strictEqual(classifyProtection({ ok: false, text: NOT_PROTECTED }), 'unprotected');
  assert.strictEqual(classifyProtection({ ok: false, text: NOT_FOUND }), 'unknown', 'no admin rights is not "unprotected"');
});

test('a 200 is protected only when a pull request is required and the rule applies to administrators', () => {
  const body = o => JSON.stringify({ url: 'x', ...o });
  assert.strictEqual(classifyProtection({ ok: true, body: body({}) }), 'weak', 'a rule set with no rules');
  assert.strictEqual(classifyProtection({ ok: true, body: body({ required_status_checks: { contexts: [] } }) }), 'weak', 'checks only: a direct push is possible');
  assert.strictEqual(classifyProtection({ ok: true, body: body({ required_pull_request_reviews: {}, enforce_admins: { enabled: false } }) }), 'weak', 'the owner is an administrator');
  assert.strictEqual(classifyProtection({ ok: true, body: body({ required_pull_request_reviews: null, enforce_admins: { enabled: true } }) }), 'weak');
  assert.strictEqual(classifyProtection({ ok: true, body: body({ required_pull_request_reviews: {}, enforce_admins: { enabled: true } }) }), 'protected');
  for (const garbage of ['', 'not json', '[]', 'null', '42', undefined]) assert.strictEqual(classifyProtection({ ok: true, body: garbage }), 'unknown', String(garbage));
  assert.strictEqual(classifyRules(STRONG), 'protected', 'an already parsed body is accepted');
});

test('anything unreadable is unknown, never protected', () => {
  for (const text of ['', undefined, 'ETIMEDOUT', 'HTTP 500', '{"message":"Bad credentials","status":"401"}', '{"message":"API rate limit exceeded","status":"403"}', '{"message":"Resource not accessible by integration","status":"403"}']) {
    assert.strictEqual(classifyProtection({ ok: false, text }), 'unknown', String(text));
  }
});

test('the phrases count only as the answer itself, with the status they belong to', () => {
  // the phrase inside another message, or with another status, is not the answer
  assert.strictEqual(classifyProtection({ ok: false, text: '{"message":"Could not find: Branch not protected","status":"404"}' }), 'unknown');
  assert.strictEqual(classifyProtection({ ok: false, text: '{"message":"Branch not protected","status":"500"}' }), 'unknown');
  assert.strictEqual(classifyProtection({ ok: false, text: '{"message":"Upgrade to GitHub Pro","status":"404"}' }), 'unknown');
  // other plan wording
  assert.strictEqual(classifyProtection({ ok: false, text: '{"message":"Upgrade to GitHub Team to enable this feature.","status":"403"}' }), 'unavailable');
  assert.strictEqual(classifyProtection({ ok: false, text: 'gh: Upgrade to GitHub Pro or make this repository public (HTTP 403)' }), 'unavailable', 'without a body, gh\'s own line');
});

test('a ruleset with a pull request rule is reported as a ruleset, never as protected', () => {
  assert.strictEqual(classifyRulesets(JSON.stringify([{ type: 'deletion' }, { type: 'pull_request', parameters: {} }])), 'ruleset');
  assert.strictEqual(classifyRulesets('[]'), null);
  assert.strictEqual(classifyRulesets(JSON.stringify([{ type: 'deletion' }])), null);
  assert.strictEqual(classifyRulesets('garbage'), null);
  assert.strictEqual(classifyRulesets('{"message":"Not Found"}'), null);
});

test('only a protected branch may use auto-when-verified; every other state is approve-each', () => {
  assert.deepStrictEqual(STATES, ['protected', 'weak', 'ruleset', 'unprotected', 'unavailable', 'unknown']);
  for (const state of STATES) {
    const r = protectionReport(state, 'auto-when-verified');
    assert.deepStrictEqual(r.allowedMergeModes, state === 'protected' ? ['approve-each', 'auto-when-verified'] : ['approve-each'], state);
    assert.strictEqual(r.effectiveMergeMode, state === 'protected' ? 'auto-when-verified' : 'approve-each', state);
    assert.strictEqual(r.downgraded, state !== 'protected', state);
    assert.ok(r.reason.length > 10, state);
  }
  assert.strictEqual(protectionReport('unavailable', 'approve-each').downgraded, false);
  assert.strictEqual(protectionReport('protected', 'nonsense').effectiveMergeMode, 'approve-each');
  assert.strictEqual(protectionReport('protected').requestedMergeMode, 'approve-each');
  assert.throws(() => protectionReport('whatever'), /unknown protection state/);
});

test('the report says why, and names the substitute safeguards when there is no protection', () => {
  const none = protectionReport('unavailable', 'auto-when-verified');
  assert.match(none.reason, /플랜 제한/);
  assert.strictEqual(none.safeguards.length, 3);
  assert.deepStrictEqual(protectionReport('protected').safeguards, []);
  const text = renderProtection(none);
  assert.match(text, /^기본 브랜치 보호: unavailable/);
  assert.match(text, /쓸 수 있는 병합 방식: approve-each\n/);
  assert.match(text, /요청한 병합 방식 auto-when-verified은\(는\) 쓸 수 없어 approve-each로 처리/);
  assert.match(text, /대체 안전장치/);
  assert.doesNotMatch(renderProtection(protectionReport('protected')), /대체 안전장치/);
  assert.match(protectionReport('weak').reason, /소유자가 직접 푸시/);
  assert.match(protectionReport('ruleset').reason, /룰셋/);
});

test('the host reads the failure text of gh, tries rulesets only after "Branch not protected", and encodes the path', () => {
  const calls = [];
  const fail = text => Object.assign(new Error('Command failed: gh api repos/o/r/branches/Branch not protected/protection'), { stdout: '', stderr: text });
  const host = exec => createGitHubHost({ repo: 'o/r', exec });
  const answer = (classic, rules) => (bin, args) => {
    calls.push(args[1]);
    if (args[1].includes('/protection')) { if (classic instanceof Error) throw classic; return classic; }
    if (rules instanceof Error) throw rules;
    return rules;
  };
  assert.strictEqual(host(answer(fail(UPGRADE))).branchProtection('release/v 1'), 'unavailable');
  assert.strictEqual(calls[0], 'repos/o/r/branches/release/v%201/protection');
  assert.strictEqual(calls.length, 1, 'no ruleset lookup for another answer');
  calls.length = 0;
  assert.strictEqual(host(answer(fail(NOT_FOUND))).branchProtection('main'), 'unknown');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(host(answer(JSON.stringify(STRONG))).branchProtection('main'), 'protected');
  assert.strictEqual(host(answer('{"url":"x"}')).branchProtection('main'), 'weak');
  calls.length = 0;
  assert.strictEqual(host(answer(fail(NOT_PROTECTED), '[]')).branchProtection('a/b'), 'unprotected');
  assert.deepStrictEqual(calls, ['repos/o/r/branches/a/b/protection', 'repos/o/r/rules/branches/a/b']);
  assert.strictEqual(host(answer(fail(NOT_PROTECTED), JSON.stringify([{ type: 'pull_request' }]))).branchProtection('main'), 'ruleset');
  assert.strictEqual(host(answer(fail(NOT_PROTECTED), fail(NOT_FOUND))).branchProtection('main'), 'unprotected', 'a failing ruleset lookup keeps the answer');
  // the text can come on stdout (gh prints the body there)
  assert.strictEqual(host(answer(Object.assign(new Error('x'), { stdout: NOT_PROTECTED }), '[]')).branchProtection('main'), 'unprotected');
  assert.strictEqual(host(answer(new Error('connect ETIMEDOUT'))).branchProtection('main'), 'unknown');
});

test('a mergeMode in the config that is not one of the two is reported', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-mode-'));
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  fs.mkdirSync(path.join(dir, '.haku'));
  fs.writeFileSync(path.join(dir, '.haku', 'config.json'), JSON.stringify({ mergeMode: 'auto' }));
  assert.match(readConfig(dir).warnings.join('\n'), /mergeMode .* approve-each or auto-when-verified/);
  fs.writeFileSync(path.join(dir, '.haku', 'config.json'), JSON.stringify({ mergeMode: 'auto-when-verified' }));
  assert.deepStrictEqual(readConfig(dir).warnings, []);
});

test('the story records its merge mode: a Merge-Mode line, read back, ignoring hidden or invalid lines', () => {
  assert.strictEqual(modeOf('x\n## Harness\nMerge-Mode: auto-when-verified\nVerify-Kind: T1'), 'auto-when-verified');
  assert.strictEqual(modeOf('Merge-Mode: approve-each'), 'approve-each');
  assert.strictEqual(modeOf('Merge-Mode: auto'), null);
  assert.strictEqual(modeOf('Merge-Mode:\nauto-when-verified'), null, 'a value on the next line is not read');
  assert.strictEqual(modeOf('<!--\nMerge-Mode: auto-when-verified\n-->'), null);
  assert.strictEqual(modeOf('```\nMerge-Mode: auto-when-verified\n```'), null);
  assert.strictEqual(modeOf(''), null);
  const verify = { kind: 'T1', profile: 'unit' };
  const draft = mode => ({ assignee: 'a', story: { id: 'S', title: 'T', verify, ...(mode ? { mergeMode: mode } : {}) }, milestones: [{ id: 'M', title: 'B', verify, tasks: [{ id: 'T', title: 'C', acceptance: ['x'], scope: ['s'], verify }] }] });
  assert.ok(validateDraft(draft('auto')).some(e => /story\.mergeMode/.test(e)));
  assert.deepStrictEqual(validateDraft(draft('auto-when-verified')), []);
  // what is written to the host: the story carries the line, in the first body and in the one rewritten with children
  const created = [];
  const updated = [];
  let n = 100;
  const host = { ensureLabels() {}, createIssue: row => { created.push(row); return n++; }, updateIssueBody: (num, body) => updated.push({ num, body }) };
  publish(host, draft('auto-when-verified'), { apply: true, state: { numbers: {} }, titlePrefix: true });
  assert.match(created[0].body, /Merge-Mode: auto-when-verified/);
  assert.match(updated.find(u => u.num === 100).body, /Merge-Mode: auto-when-verified/);
  assert.doesNotMatch(created[1].body, /Merge-Mode/, 'only the story carries it');
  assert.doesNotMatch(created[2].body, /Merge-Mode/);
  const none = [];
  publish({ ensureLabels() {}, createIssue: row => { none.push(row); return 1; }, updateIssueBody() {} }, draft(), { apply: true, state: { numbers: {} }, titlePrefix: true });
  assert.doesNotMatch(none[0].body, /Merge-Mode/, 'no line when the draft names no mode');
});

test('branch-protection refuses a bad --mode or --story before asking GitHub', () => {
  const run = (...args) => spawnSync(process.execPath, [cli, 'branch-protection', ...args], { encoding: 'utf8' });
  const badMode = run('--mode', 'auto');
  assert.strictEqual(badMode.status, 1);
  assert.match(badMode.stderr, /--mode must be/);
  const badStory = run('--story', 'abc');
  assert.strictEqual(badStory.status, 1);
  assert.match(badStory.stderr, /--story/);
});

test('the skills hold back auto-when-verified and enforce it through the exit code of the command', () => {
  const read = name => fs.readFileSync(path.join(__dirname, '..', 'skills', name, 'SKILL.md'), 'utf8');
  const setup = read('setup');
  assert.match(setup, /issues\.js branch-protection/);
  for (const state of ['protected', 'weak', 'ruleset', 'unprotected', 'unavailable', 'unknown']) assert.ok(setup.includes(`\`${state}\``), state);
  assert.match(setup, /do not offer `auto-when-verified` at all/);
  assert.match(read('plan'), /story\.mergeMode/);
  assert.match(read('plan'), /A command that fails counts as `unknown`/);
  assert.match(read('build'), /branch-protection --story <story issue>` exits 0/);
  assert.match(read('build'), /exit 3, any other exit code or a failed run means ask/);
});

// ---- the check behind the command: exit codes, the source of the merge mode, a host that cannot answer ------------

const fakeHost = (state, storyBody = '') => ({ defaultBranch: () => 'main', branchProtection: () => state, getIssue: () => ({ body: storyBody }) });

test('exit 0 only when the requested mode may be used, 3 when it may not', () => {
  assert.strictEqual(checkProtection({ host: fakeHost('protected'), mode: 'auto-when-verified' }).exitCode, 0);
  for (const state of ['weak', 'ruleset', 'unprotected', 'unavailable', 'unknown']) {
    assert.strictEqual(checkProtection({ host: fakeHost(state), mode: 'auto-when-verified' }).exitCode, 3, state);
    assert.strictEqual(checkProtection({ host: fakeHost(state), mode: 'approve-each' }).exitCode, 0, state);
  }
});

test('the mode comes from --mode, else the story line, else the repository setting (only for this repository)', () => {
  const asked = args => checkProtection({ host: fakeHost('protected', 'Merge-Mode: approve-each'), ...args }).report.requestedMergeMode;
  assert.strictEqual(asked({ mode: 'auto-when-verified', story: 7, configMode: 'approve-each' }), 'auto-when-verified', '--mode wins');
  assert.strictEqual(checkProtection({ host: fakeHost('protected', 'Merge-Mode: auto-when-verified'), story: 7, configMode: 'approve-each' }).report.requestedMergeMode, 'auto-when-verified', 'the story line wins over the setting');
  assert.strictEqual(asked({ story: 7, configMode: 'auto-when-verified' }), 'approve-each');
  assert.strictEqual(checkProtection({ host: fakeHost('protected', 'no line'), story: 7, configMode: 'auto-when-verified' }).report.requestedMergeMode, 'auto-when-verified', 'no line: the setting');
  assert.strictEqual(checkProtection({ host: fakeHost('protected'), configMode: 'auto-when-verified' }).report.requestedMergeMode, 'auto-when-verified');
  assert.strictEqual(checkProtection({ host: fakeHost('protected'), configMode: 'auto-when-verified', repoGiven: true }).report.requestedMergeMode, 'approve-each', 'another repository does not inherit this one\'s setting');
});

test('a host that cannot answer gives unknown, a warning and exit 3 - never an error that reads like permission', () => {
  const notes = [];
  const broken = { defaultBranch: () => { throw new Error('gh: not logged in\nmore'); }, branchProtection: () => 'protected', getIssue: () => ({ body: '' }) };
  const r = checkProtection({ host: broken, mode: 'auto-when-verified', warn: m => notes.push(m) });
  assert.deepStrictEqual([r.report.state, r.exitCode], ['unknown', 3]);
  assert.match(notes[0], /could not check the branch protection \(gh: not logged in\)/);
  const noStory = { ...fakeHost('protected'), getIssue: () => { throw new Error('no such issue'); } };
  const s = checkProtection({ host: noStory, story: 7, mode: undefined, configMode: 'auto-when-verified', warn: () => {} });
  assert.strictEqual(s.report.state, 'unknown', 'an unreadable story is not a reason to trust the branch');
  assert.strictEqual(s.exitCode, 3);
});

test('checkProtection refuses a bad mode or story', () => {
  assert.throws(() => checkProtection({ host: fakeHost('protected'), mode: 'auto' }), /--mode must be/);
  assert.throws(() => checkProtection({ host: fakeHost('protected'), story: 0 }), /--story/);
});
