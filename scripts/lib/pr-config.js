'use strict';

const { readConfig } = require('./config');
const { listWorkers } = require('./worker');
const { patternsFrom, scopeParts, configChanges } = require('./weaken');

// The files of a pull request that could weaken its own checks, judged against the Scope the task had when its
// worker started (the worker can edit the issue afterwards, so the issue text now is only a fallback).
// `warn` receives notes for the user; it is not an error channel.
function prConfigChanges({ host, cwd, pr, issue, warn = () => {} }) {
  const cfg = readConfig(cwd);
  for (const w of cfg.warnings) warn(w);
  let scope = null;
  if (issue !== undefined) {
    const live = scopeParts(host.getIssue(issue).body);
    for (const g of live.ignored) warn(`Scope entry "${g}" is not a path pattern and is ignored`);
    const record = listWorkers(cwd).find(w => w.issue === issue);
    const recorded = record && Array.isArray(record.scope) ? record.scope : null;
    scope = recorded || live.globs;
    if (recorded && JSON.stringify(recorded) !== JSON.stringify(live.globs)) warn('the Scope on the issue changed after the worker started; the Scope from the start is used');
  }
  return configChanges(host.prFiles(pr), { patterns: patternsFrom(cfg.config), scope });
}

module.exports = { prConfigChanges };
