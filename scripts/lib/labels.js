'use strict';

const { WORK_KINDS, STATE_LABELS, kindLabel, labelNames } = require('./model');

const KIND_LABELS = WORK_KINDS.map(kindLabel);
const names = text => String(text || '').split(',').map(s => s.trim()).filter(Boolean);

// What to change on one issue. Only state labels and kind labels may be touched (the type, haku and sprint labels
// belong to publish). Adding a kind replaces the issue's other kinds, so an issue always has at most one.
function planLabelChange(issue, { add, remove } = {}) {
  const adds = names(add);
  const removes = names(remove);
  if (!adds.length && !removes.length) throw new Error('--add or --remove is required');
  const allowed = [...STATE_LABELS, ...KIND_LABELS];
  for (const n of [...adds, ...removes]) {
    if (!allowed.includes(n)) throw new Error(`label "${n}" is not one haku sets (${allowed.join(', ')})`);
  }
  const clash = adds.filter(n => removes.includes(n));
  if (clash.length) throw new Error(`label ${clash[0]} is both added and removed`);
  const addedKinds = adds.filter(n => KIND_LABELS.includes(n));
  if (addedKinds.length > 1) throw new Error('an issue has one kind: add only one kind:* label');
  const has = new Set(labelNames(issue));
  const dropKinds = addedKinds.length ? KIND_LABELS.filter(k => has.has(k) && k !== addedKinds[0]) : [];
  return {
    add: adds.filter(n => !has.has(n)),
    remove: [...new Set([...removes.filter(n => has.has(n)), ...dropKinds])]
  };
}

module.exports = { planLabelChange };
