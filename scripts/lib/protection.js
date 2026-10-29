'use strict';

// Is the default branch protected, and which merge modes may that repository use? `auto-when-verified` merges
// without asking each time, which is only acceptable when the host itself refuses a direct push and an
// unreviewed merge. Everything else (unprotected, protection impossible, or not knowing) keeps `approve-each`.
//
// The host's answers (read from real repositories on 2026-10-30):
//   protected          200 with the rule set
//   unprotected        404 {"message":"Branch not protected"}              (a public repository of ours)
//   unavailable        403 {"message":"Upgrade to GitHub Pro or make this repository public to enable this feature."}
//   anything else      404 {"message":"Not Found"} (no admin rights, or no such branch), network errors, ...
const STATES = ['protected', 'unprotected', 'unavailable', 'unknown'];

function classifyProtection({ ok, text = '' }) {
  if (ok) return 'protected';
  const t = String(text);
  if (/branch not protected/i.test(t)) return 'unprotected';
  if (/upgrade to github pro|make this repository public/i.test(t)) return 'unavailable';
  return 'unknown';
}

const REASON = {
  protected: '기본 브랜치에 보호 규칙이 있어 두 가지 병합 방식을 모두 쓸 수 있습니다.',
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

const MODES = ['approve-each', 'auto-when-verified'];

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
  if (r.downgraded) lines.push(`설정의 병합 방식 ${r.requestedMergeMode}은(는) 쓸 수 없어 ${r.effectiveMergeMode}로 처리합니다.`);
  if (r.safeguards.length) lines.push('보호가 없는 동안의 대체 안전장치:', ...r.safeguards.map(s => `  - ${s}`));
  return `${lines.join('\n')}\n`;
}

module.exports = { STATES, MODES, classifyProtection, protectionReport, renderProtection };
