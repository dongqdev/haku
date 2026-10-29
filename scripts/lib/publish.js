'use strict';

const { BASE_LABEL, typeLabel, withPrefix, stripPrefix } = require('./model');

// GitHub rejects titles over 256 characters; the prefix adds up to 12, so a draft title may use 244.
const MAX_TITLE = 244;

const KINDS = ['T1', 'T2', 'T3'];

// A draft is the locally written, user-approved plan:
// { assignee, sprint?, story:{id,title,body?,verify}, milestones:[{id,title,body?,verify,
//   tasks:[{id,title,body?,acceptance:[..],verify,scope:[..],dependsOn?:[ids]}]}] }
function validateDraft(draft) {
  const errors = [];
  const ids = new Set();
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(draft && typeof draft.assignee === 'string' && draft.assignee.trim(), 'assignee is required (the host login that owns this story)');
  need(draft && draft.story && draft.story.title, 'story.title is required');
  // A title must say something besides a kind prefix, and must still fit once the prefix is added.
  const checkTitle = (where, title) => {
    if (!title) return;
    need(stripPrefix(title).trim().length > 0, `${where}: title is empty after the kind prefix`);
    need(String(title).length <= MAX_TITLE, `${where}: title is longer than ${MAX_TITLE} characters`);
  };
  if (draft && draft.story) checkTitle('story', draft.story.title);
  need(draft && Array.isArray(draft.milestones) && draft.milestones.length > 0, 'at least one milestone is required');
  if (errors.length) return errors;

  const checkVerify = (where, v) => {
    if (!v || !KINDS.includes(v.kind)) {
      errors.push(`${where}: verify.kind must be one of ${KINDS.join('|')}`);
      return;
    }
    if ((v.kind === 'T1' || v.kind === 'T2') && !v.profile) {
      errors.push(`${where}: verify.profile is required for ${v.kind} (a name defined in .haku/verify.json)`);
    }
  };
  const uniq = (where, id) => {
    if (!id) errors.push(`${where}: id is required`);
    else if (ids.has(id)) errors.push(`${where}: duplicate id ${id}`);
    else ids.add(id);
  };

  uniq('story', draft.story.id);
  checkVerify('story', draft.story.verify);

  const taskIds = new Set();
  for (const m of draft.milestones) {
    uniq(`milestone ${m.id || '?'}`, m.id);
    need(m.title, `milestone ${m.id}: title is required`);
    checkTitle(`milestone ${m.id}`, m.title);
    checkVerify(`milestone ${m.id}`, m.verify);
    need(Array.isArray(m.tasks) && m.tasks.length > 0, `milestone ${m.id}: needs at least one task`);
    for (const t of m.tasks || []) {
      const where = `task ${t.id || '?'}`;
      uniq(where, t.id);
      taskIds.add(t.id);
      need(t.title, `${where}: title is required`);
      checkTitle(where, t.title);
      need(Array.isArray(t.acceptance) && t.acceptance.length > 0, `${where}: acceptance criteria are required`);
      need(Array.isArray(t.scope) && t.scope.length > 0, `${where}: scope (files this task may touch) is required`);
      checkVerify(where, t.verify);
    }
  }
  for (const m of draft.milestones) {
    for (const t of m.tasks || []) {
      for (const dep of t.dependsOn || []) {
        if (!taskIds.has(dep)) errors.push(`task ${t.id}: dependsOn ${dep} is not a task in this draft`);
      }
    }
  }
  return errors;
}

// Parents first; tasks ordered so every dependency is created before its dependent.
function flatten(draft) {
  const nodes = [{ key: draft.story.id, type: 'story', node: draft.story, parent: null }];
  for (const m of draft.milestones) {
    nodes.push({ key: m.id, type: 'milestone', node: m, parent: draft.story.id });
  }
  const tasks = [];
  for (const m of draft.milestones) {
    for (const t of m.tasks) tasks.push({ key: t.id, type: 'task', node: t, parent: m.id });
  }
  const placed = new Set();
  let guard = tasks.length * tasks.length + 1;
  while (tasks.length && guard-- > 0) {
    const i = tasks.findIndex(t => (t.node.dependsOn || []).every(d => placed.has(d)));
    if (i === -1) throw new Error('dependsOn cycle between tasks');
    const [t] = tasks.splice(i, 1);
    placed.add(t.key);
    nodes.push(t);
  }
  return nodes;
}

function renderBody(entry, numbers, children = []) {
  const { node, type, parent, key } = entry;
  const lines = [];
  if (node.body) lines.push(node.body.trim(), '');
  if (type === 'task') {
    lines.push('## Acceptance');
    for (const a of node.acceptance) lines.push(`- [ ] ${a}`);
    lines.push('');
  }
  if (children.length) {
    lines.push('## Children');
    for (const c of children) lines.push(`- [ ] #${numbers.get(c.key)} ${c.node.title}`);
    lines.push('');
  }
  lines.push('## Harness');
  if (parent) lines.push(`Parent: #${numbers.get(parent)}`);
  lines.push(`Verify-Kind: ${node.verify.kind}`);
  if (node.verify.profile) lines.push(`Verify-Profile: ${node.verify.profile}`);
  if (node.scope) lines.push(`Scope: ${node.scope.join(', ')}`);
  if ((node.dependsOn || []).length) {
    lines.push(`Depends-On: ${node.dependsOn.map(d => `#${numbers.get(d)}`).join(', ')}`);
  }
  lines.push(`Draft-Id: ${key}`);
  return lines.join('\n');
}

// state.numbers persists draftId -> issue number so an interrupted publish resumes
// without creating duplicates.
function publish(host, draft, { apply = false, state = { numbers: {} }, orchestrator = null, titlePrefix = true } = {}) {
  const errors = validateDraft(draft);
  if (errors.length) return { ok: false, errors };

  const entries = flatten(draft);
  const numbers = new Map(Object.entries(state.numbers));
  const plan = entries.map(e => ({
    key: e.key,
    type: e.type,
    title: titlePrefix ? withPrefix(e.type, e.node.title) : e.node.title,
    exists: numbers.has(e.key)
  }));
  if (!apply) return { ok: true, dryRun: true, plan, errors: [] };

  const labelsFor = e => {
    const l = [BASE_LABEL, typeLabel(e.type)];
    if (draft.sprint) l.push(`sprint:${draft.sprint}`);
    return l;
  };
  host.ensureLabels([...new Set(entries.flatMap(labelsFor))]);

  for (const e of entries) {
    if (numbers.has(e.key)) continue;
    // Parent line needs the parent's number, which exists because parents come first.
    let body = renderBody(e, numbers);
    if (e.type === 'story' && orchestrator) body += `\nOrchestrator: ${orchestrator}`;
    const title = titlePrefix ? withPrefix(e.type, e.node.title) : e.node.title;
    const number = host.createIssue({ title, body, labels: labelsFor(e), assignee: draft.assignee });
    numbers.set(e.key, number);
    state.numbers[e.key] = number;
  }

  // Parents list their children once every number is known.
  for (const e of entries.filter(x => x.type !== 'task')) {
    const kids = entries.filter(x => x.parent === e.key);
    let body = renderBody(e, numbers, kids);
    if (e.type === 'story' && orchestrator) body += `\nOrchestrator: ${orchestrator}`;
    host.updateIssueBody(numbers.get(e.key), body);
  }

  return { ok: true, dryRun: false, plan, errors: [], numbers: Object.fromEntries(numbers) };
}

module.exports = { validateDraft, flatten, renderBody, publish };
