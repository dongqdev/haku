'use strict';

const { readableText } = require('./model');

// Is the default branch protected, and which merge modes may that repository use? `auto-when-verified` merges
// without asking each time, which is only acceptable when the host itself refuses a direct push (also from the
// owner, who is usually an administrator) and a merge without a pull request. Everything else keeps
// `approve-each`: unprotected, protected too weakly, protected by a ruleset we cannot judge, protection impossible,
// or not knowing. An answer that cannot be read is never "protected".
//
// The host's answers (read from real repositories on 2026-10-30):
//   unprotected   404 {"message":"Branch not protected"}              (a public repository of ours)
//   unavailable   403 {"message":"Upgrade to GitHub Pro or make this repository public to enable this feature."}
//   unknown       404 {"message":"Not Found"} (no admin rights, or no such branch), network errors, rate limits, ...
//   protected     200 with the rules. Not seen on a repository of ours: only its documented shape is tested.
const STATES = ['protected', 'weak', 'ruleset', 'unprotected', 'unavailable', 'unknown'];
const MODES = ['approve-each', 'auto-when-verified'];

// The first JSON object in some command output (gh prints the body of an error answer on stdout).
function jsonIn(text) {
  const start = String(text || '').indexOf('{');
  if (start < 0) return null;
  for (let end = String(text).lastIndexOf('}'); end > start; end = String(text).lastIndexOf('}', end - 1)) {
    try {
      const parsed = JSON.parse(String(text).slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (err) { /* try a shorter slice */ }
  }
  return null;
}

// Classic protection that answered 200: real protection needs a required pull request (so no direct push) and the
// rule applying to administrators too (the owner who runs haku usually is one). Anything else is "weak".
function classifyRules(body) {
  let rules;
  try {
    rules = typeof body === 'string' ? JSON.parse(body) : body;
  } catch (err) {
    return 'unknown';
  }
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return 'unknown';
  const needsPullRequest = Boolean(rules.required_pull_request_reviews) && typeof rules.required_pull_request_reviews === 'object';
  const forAdmins = Boolean(rules.enforce_admins) && rules.enforce_admins.enabled === true;
  return needsPullRequest && forAdmins ? 'protected' : 'weak';
}

// Failure answers: judged from the JSON message and status when there is one. Without a JSON body only the error
// output of gh is read, never the command line that failed.
function classifyProtection({ ok, body, text = '' }) {
  if (ok) return classifyRules(body);
  const json = jsonIn(text);
  const message = json && typeof json.message === 'string' ? json.message : String(text);
  const status = json && json.status !== undefined ? String(json.status) : null;
  if (/^branch not protected\b/i.test(message.trim()) && (status === null || status === '404')) return 'unprotected';
  if (/upgrade to github (?:pro|team|enterprise)|make this repository public/i.test(message) && (status === null || status === '403')) return 'unavailable';
  return 'unknown';
}

// Rules a ruleset applies to a branch (GET .../rules/branches/<b>): a pull request rule means the branch is guarded
// by a ruleset. Who may bypass it is not visible there, so this is never "protected".
function classifyRulesets(body) {
  let rules;
  try {
    rules = typeof body === 'string' ? JSON.parse(body) : body;
  } catch (err) {
    return null;
  }
  return Array.isArray(rules) && rules.some(r => r && r.type === 'pull_request') ? 'ruleset' : null;
}

const REASON = {
  protected: '기본 브랜치에 보호 규칙이 있고 PR이 필수이며 관리자에게도 적용되어, 두 가지 병합 방식을 모두 쓸 수 있습니다.',
  weak: '기본 브랜치에 보호 규칙은 있지만 약합니다(PR이 필수가 아니거나 관리자에게는 적용되지 않음). 이 상태에서는 소유자가 직접 푸시할 수 있어 병합 방식은 approve-each만 쓸 수 있습니다.',
  ruleset: '기본 브랜치가 룰셋(ruleset)으로 보호되는 것으로 보이지만 우회 권한을 확인할 수 없어, 병합 방식은 approve-each만 씁니다. 클래식 보호 규칙(PR 필수, 관리자에게도 적용)을 켜면 auto-when-verified도 쓸 수 있습니다.',
  unprotected: '기본 브랜치에 보호 규칙이 없어 병합 방식은 approve-each(PR마다 사용자 승인)만 쓸 수 있습니다. GitHub 설정에서 보호를 켜면 auto-when-verified도 쓸 수 있습니다.',
  unavailable: '이 저장소는 GitHub 플랜 제한(비공개·무료) 때문에 브랜치 보호를 걸 수 없어서, 병합 방식은 approve-each(PR마다 사용자 승인)만 쓸 수 있습니다.',
  unknown: '브랜치 보호 상태를 확인하지 못했습니다(관리자 권한이 없거나 조회 실패). 확인 전까지 병합 방식은 approve-each만 씁니다.'
};

// What to rely on instead while the host does not protect the branch.
const SAFEGUARDS = [
  '필수 점검 CI: PR마다 테스트와 version 검사가 돌고 통과한 PR만 병합합니다(병합 전 CI 결과를 직접 확인).',
  '워커는 기본 브랜치에 직접 푸시하지 않고 자기 브랜치와 PR만 씁니다. 병합은 오케스트레이터가 사용자 승인(또는 허용된 범위의 승인)을 받아 합니다.',
  '병합 전 `pr-state`로 병합 대상이 로컬 브랜치 끝과 같은지, `pr-check --pr`로 이슈 연결을 확인합니다.'
];

// The merge mode a story asked for, from its "Merge-Mode:" line (null when it has none or the value is not a mode).
function modeOf(body) {
  const m = readableText(body || '').match(/^Merge-Mode:[ \t]*(\S+)[ \t]*$/im);
  return m && MODES.includes(m[1]) ? m[1] : null;
}

function protectionReport(state, requestedMode = 'approve-each') {
  if (!STATES.includes(state)) throw new Error(`unknown protection state: ${state}`);
  const allowedMergeModes = state === 'protected' ? MODES : ['approve-each'];
  const mode = MODES.includes(requestedMode) ? requestedMode : 'approve-each';
  const effectiveMergeMode = allowedMergeModes.includes(mode) ? mode : 'approve-each';
  return {
    state,
    allowedMergeModes,
    requestedMergeMode: mode,
    effectiveMergeMode,
    downgraded: effectiveMergeMode !== mode,
    reason: REASON[state],
    safeguards: state === 'protected' ? [] : SAFEGUARDS
  };
}

function renderProtection(r) {
  const lines = [`기본 브랜치 보호: ${r.state}`, r.reason, `쓸 수 있는 병합 방식: ${r.allowedMergeModes.join(', ')}`];
  if (r.downgraded) lines.push(`요청한 병합 방식 ${r.requestedMergeMode}은(는) 쓸 수 없어 ${r.effectiveMergeMode}로 처리합니다.`);
  if (r.safeguards.length) lines.push('보호가 없는 동안의 대체 안전장치:', ...r.safeguards.map(s => `  - ${s}`));
  return `${lines.join('\n')}\n`;
}

// The whole check behind `issues.js branch-protection`, with the host injected. Which merge mode is asked about:
// --mode, else the story's Merge-Mode line, else the repository's own setting (only when this repository is the one
// being asked about). exitCode 0 = the mode may be used, 3 = it may not. A host that cannot answer gives "unknown",
// never an error that could be read as permission.
function checkProtection({ host, mode, story, repoGiven = false, configMode, warn = () => {} }) {
  if (mode !== undefined && !MODES.includes(mode)) throw new Error(`--mode must be ${MODES.join(' or ')}`);
  if (story !== undefined && !(Number.isInteger(story) && story > 0)) throw new Error('--story needs an issue number');
  let requested = mode;
  let state;
  try {
    if (requested === undefined && Number.isInteger(story)) requested = modeOf(host.getIssue(story).body) || undefined;
    state = host.branchProtection(host.defaultBranch());
  } catch (err) {
    warn(`could not check the branch protection (${String(err.message).split('\n')[0]}); treated as unknown`);
    state = 'unknown';
  }
  if (requested === undefined && !repoGiven) requested = configMode;
  const report = protectionReport(state, requested);
  return { report, exitCode: report.downgraded ? 3 : 0 };
}

module.exports = { checkProtection, STATES, MODES, classifyProtection, classifyRules, classifyRulesets, modeOf, protectionReport, renderProtection };
