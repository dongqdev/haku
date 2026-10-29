'use strict';

// Where a task branch's pull request stands, for one question: may I still push to this branch?
// A merged or closed pull request means a new commit would never be reviewed or merged, so the
// work continues as a follow-up from the default branch instead.
function prState(host, branch, localTip = null) {
  const prs = host.prsForBranch(branch);
  // A branch name can be reused: the newest pull request is the one the branch feeds now.
  const chosen = prs.length ? [...prs].sort((x, y) => y.number - x.number)[0] : null;
  const state = chosen ? chosen.state : 'none';
  return {
    branch,
    state,
    number: chosen ? chosen.number : null,
    headRefOid: chosen ? chosen.headRefOid || null : null,
    localTip,
    // false when the local branch holds commits the pull request never saw
    matchesLocalTip: chosen && localTip ? chosen.headRefOid === localTip : null,
    safeToPush: state === 'open' || state === 'none'
  };
}

module.exports = { prState };
