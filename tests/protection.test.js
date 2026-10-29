'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { classifyProtection, protectionReport, renderProtection, STATES } = require('../scripts/lib/protection');
const { createGitHubHost } = require('../scripts/lib/github-host');
const { readConfig } = require('../scripts/lib/config');

// The texts below are the real answers of GitHub, read on 2026-10-30.
const UPGRADE = '{"message":"Upgrade to GitHub Pro or make this repository public to enable this feature.","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"403"}gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)';
const NOT_PROTECTED = '{"message":"Branch not protected","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"404"}gh: Branch not protected (HTTP 404)';
const NOT_FOUND = '{"message":"Not Found","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"404"}gh: Not Found (HTTP 404)';

test('the real answers of GitHub are told apart', () => {
  assert.strictEqual(classifyProtection({ ok: true }), 'protected');
  assert.strictEqual(classifyProtection({ ok: false, text: UPGRADE }), 'unavailable');
  assert.strictEqual(classifyProtection({ ok: false, text: NOT_PROTECTED }), 'unprotected');
  assert.strictEqual(classifyProtection({ ok: false, text: NOT_FOUND }), 'unknown', 'no admin rights is not "unprotected"');
});

test('anything unreadable is unknown, never protected', () => {
  for (const text of ['', undefined, 'ETIMEDOUT', 'HTTP 500', '{"message":"Bad credentials"}', 'rate limit exceeded']) {
    assert.strictEqual(classifyProtection({ ok: false, text }), 'unknown', String(text));
  }
});

test('only a protected branch may use auto-when-verified; every other state is approve-each', () => {
  for (const state of STATES) {
    const r = protectionReport(state, 'auto-when-verified');
    assert.deepStrictEqual(r.allowedMergeModes, state === 'protected' ? ['approve-each', 'auto-when-verified'] : ['approve-each'], state);
    assert.strictEqual(r.effectiveMergeMode, state === 'protected' ? 'auto-when-verified' : 'approve-each', state);
    assert.strictEqual(r.downgraded, state !== 'protected', state);
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
  assert.match(text, /auto-when-verified은\(는\) 쓸 수 없어 approve-each로 처리/);
  assert.match(text, /대체 안전장치/);
  assert.doesNotMatch(renderProtection(protectionReport('protected')), /대체 안전장치/);
});

test('the host asks for the protection of the branch (slashes kept, other characters encoded) and reads the failure text', () => {
  const calls = [];
  const failing = text => (bin, args) => {
    calls.push(args);
    throw Object.assign(new Error('Command failed: gh api'), { stdout: '', stderr: text });
  };
  const host = exec => createGitHubHost({ repo: 'o/r', exec });
  assert.strictEqual(host(failing(UPGRADE)).branchProtection('release/v 1'), 'unavailable');
  assert.deepStrictEqual(calls[0], ['api', 'repos/o/r/branches/release/v%201/protection']);
  assert.strictEqual(host(failing(NOT_PROTECTED)).branchProtection('main'), 'unprotected');
  assert.strictEqual(host(failing(NOT_FOUND)).branchProtection('main'), 'unknown');
  assert.strictEqual(host((bin, args) => '{"url":"x"}').branchProtection('main'), 'protected');
  // the text can come on stdout (gh prints the body there) or only in the error message
  assert.strictEqual(host((bin, args) => { throw Object.assign(new Error('x'), { stdout: NOT_PROTECTED }); }).branchProtection('main'), 'unprotected');
  assert.strictEqual(host((bin, args) => { throw new Error('connect ETIMEDOUT'); }).branchProtection('main'), 'unknown');
});

test('a mergeMode in the config that is not one of the two is reported', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'haku-mode-'));
  require('child_process').spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  fs.mkdirSync(path.join(dir, '.haku'));
  fs.writeFileSync(path.join(dir, '.haku', 'config.json'), JSON.stringify({ mergeMode: 'auto' }));
  assert.match(readConfig(dir).warnings.join('\n'), /mergeMode .* approve-each or auto-when-verified/);
  fs.writeFileSync(path.join(dir, '.haku', 'config.json'), JSON.stringify({ mergeMode: 'auto-when-verified' }));
  assert.deepStrictEqual(readConfig(dir).warnings, []);
});

test('the skills tell the three states apart, hold back auto-when-verified and re-check before an automatic merge', () => {
  const read = name => fs.readFileSync(path.join(__dirname, '..', 'skills', name, 'SKILL.md'), 'utf8');
  const setup = read('setup');
  assert.match(setup, /issues\.js branch-protection/);
  for (const state of ['protected', 'unprotected', 'unavailable', 'unknown']) assert.ok(setup.includes(`\`${state}\``), state);
  assert.match(setup, /do not offer `auto-when-verified` at all/);
  assert.match(read('plan'), /reports the default branch as `protected`/);
  assert.match(read('build'), /still says `protected`/);
});
