'use strict';

const { WORK_KINDS, STATE_LABELS, kindLabel, labelNames, baseLabelDefinitions } = require('./model');

const KIND_LABELS = WORK_KINDS.map(kindLabel);
const ALLOWED = [...STATE_LABELS, ...KIND_LABELS];
// Repeated names count once; GitHub treats label names without regard to letter case, so haku does too.
const names = text => [...new Set(String(text || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];

// What to change on one issue. Only state labels and kind labels may be touched (the type, haku and sprint labels
// belong to publish). Adding a kind replaces the issue's other kinds, so an issue always has at most one. A state
// label is not added to a closed issue (it would say "blocked" about something that is over).
function planLabelChange(issue, { add, remove } = {}) {
  const adds = names(add);
  const removes = names(remove);
  if (!adds.length && !removes.length) throw new Error('--add or --remove is required');
  for (const n of [...adds, ...removes]) {
    if (!ALLOWED.includes(n)) throw new Error(`label "${n}" is not one haku sets (${ALLOWED.join(', ')})`);
  }
  const clash = adds.filter(n => removes.includes(n));
  if (clash.length) throw new Error(`label ${clash[0]} is both added and removed`);
  const addedKinds = adds.filter(n => KIND_LABELS.includes(n));
  if (addedKinds.length > 1) throw new Error('an issue has one kind: add only one kind:* label');
  if (String(issue.state || '').toLowerCase() === 'closed' && adds.some(n => STATE_LABELS.includes(n))) {
    throw new Error('a closed issue gets no state label (deferred, blocked, needs-user)');
  }
  // the issue's own spelling is what GitHub needs to remove a label
  const present = new Map(labelNames(issue).map(n => [n.toLowerCase(), n]));
  const drop = new Set(removes);
  if (addedKinds.length) for (const k of KIND_LABELS) if (k !== addedKinds[0]) drop.add(k);
  return {
    add: adds.filter(n => !present.has(n)),
    remove: [...drop].filter(n => present.has(n)).map(n => present.get(n))
  };
}

// Creates (or updates) every label haku owns with its own colour and description.
function ensureBaseLabels(host) {
  const defs = baseLabelDefinitions();
  host.ensureLabels(defs.map(d => d.name));
  return defs;
}

module.exports = { planLabelChange, ensureBaseLabels };
