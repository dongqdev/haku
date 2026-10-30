'use strict';

// Issue model shared by every Git host. Hierarchy is expressed with labels and a
// "Parent: #N" line in the body, so it works identically on GitHub and GitLab.

const TYPES = ['story', 'milestone', 'task'];
const BASE_LABEL = 'haku';
// What kind of work an issue is (one per issue) and the state labels that say why it is not moving.
const WORK_KINDS = ['design', 'dev', 'bug', 'docs', 'research', 'chore'];
const STATE_LABELS = ['deferred', 'blocked', 'needs-user'];

const typeLabel = type => `type:${type}`;
const kindLabel = kind => `kind:${kind}`;
// Who owns an issue is the host's assignee. The owner label is only the fallback for people
// who cannot be assigned (for example, not a collaborator on the repository).
const ownerLabel = name => `owner:${name}`;

// Label colours and descriptions. The hues follow the Okabe-Ito palette (distinguishable with colour-vision
// differences), darkened so GitHub shows white label text: it picks white when the perceived lightness
// (0.2126 R + 0.7152 G + 0.0722 B, channels 0-1) is below 0.453. The base label's brown is the mascot's own
// colour. Unknown labels stay grey.
const LABEL_STYLES = {
  [BASE_LABEL]: { color: '6F4E37', description: 'Managed by haku' },
  [typeLabel('story')]: { color: '0072B2', description: 'Story: a big goal' },
  [typeLabel('milestone')]: { color: '007A5A', description: 'Milestone: a stage of a story' },
  [typeLabel('task')]: { color: 'C75B00', description: 'Task: what one worker does' },
  [kindLabel('design')]: { color: '6A3D9A', description: 'Design: decide the approach and scope before building' },
  [kindLabel('dev')]: { color: '2B5C8A', description: 'Development: build or change a feature' },
  [kindLabel('bug')]: { color: 'B3261E', description: 'Bug: fix something that is broken' },
  [kindLabel('docs')]: { color: '2E7D32', description: 'Docs: README and guides' },
  [kindLabel('research')]: { color: '00838F', description: 'Research: find out and reach a conclusion' },
  [kindLabel('chore')]: { color: '5F6B73', description: 'Chore: setup, refactor, dependencies; no behavior change' },
  deferred: { color: '56657A', description: 'Postponed on purpose; not dropped' },
  blocked: { color: '9A1B1B', description: 'Cannot go on until something else is resolved' },
  'needs-user': { color: '8A6100', description: 'Waiting for a user decision' }
};
const PREFIX_STYLES = [
  ['sprint:', { color: 'A24B7D', description: 'Sprint' }],
  ['owner:', { color: '5A6B7B', description: 'Owner (could not be assigned)' }]
];
const NEUTRAL = { color: 'ededed', description: '' };

function labelStyle(name) {
  if (LABEL_STYLES[name]) return LABEL_STYLES[name];
  const hit = PREFIX_STYLES.find(([prefix]) => String(name).startsWith(prefix));
  return hit ? hit[1] : NEUTRAL;
}

// "[Story] Login": the kind reads in the list without relying on colour.
const TITLE_PREFIXES = { story: '[Story]', milestone: '[Milestone]', task: '[Task]' };
const ANY_PREFIX_RE = /^\s*\[(?:story|milestone|task)\]\s*/i;
const ownPrefixRe = type => new RegExp(`^\\s*\\[${type}\\]\\s*`, 'i');

// Removes any kind prefix (used to compare and to name branches).
const stripPrefix = title => String(title || '').replace(ANY_PREFIX_RE, '');
// Adds this kind's prefix once. A prefix of another kind is the author's own text and is kept.
const withPrefix = (type, title) => `${TITLE_PREFIXES[type]} ${String(title || '').replace(ownPrefixRe(type), '')}`;

// The labels haku owns and `setup` creates, with their colours.
function baseLabelDefinitions() {
  const names = [BASE_LABEL, ...TYPES.map(typeLabel), ...WORK_KINDS.map(kindLabel), ...STATE_LABELS];
  return names.map(name => ({ name, ...labelStyle(name) }));
}

function labelNames(issue) {
  return (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name));
}

function issueType(issue) {
  const names = labelNames(issue);
  return TYPES.find(t => names.includes(typeLabel(t))) || null;
}

function issueOwner(issue) {
  const assignee = (issue.assignees || [])[0];
  if (assignee) return typeof assignee === 'string' ? assignee : assignee.login;
  const hit = labelNames(issue).find(n => n.startsWith('owner:'));
  return hit ? hit.slice('owner:'.length) : null;
}

// Remove fenced code blocks and quoted lines so examples/quotes never count as claims.
function stripNonClaims(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*>.*$/gm, '');
}

// "Depends-On: #3, #4" -> [3, 4] (the body line publish writes for dependent tasks).
function dependsOn(issue) {
  const m = stripNonClaims(issue.body).match(/^Depends-On:\s*(.+)$/im);
  if (!m) return [];
  const refs = m[1].replace(/\([^)]*\)/g, '');
  return [...refs.matchAll(/(?<![\w/])#(\d+)/g)].map(x => Number(x[1]));
}

// The part of an issue body a reader of the GitHub page actually sees as the author's own words: no HTML
// comments (hidden on the page), no fenced code (``` or ~~~), no quotes. Anything that turns issue text into
// instructions for a worker must read it through this.
function readableText(body) {
  return stripNonClaims(body)
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')          // an unclosed comment hides the rest of the page
    .replace(/^\s*\[\/\/\]:\s*#.*$/gm, '')         // link-reference comments: [//]: # (hidden)
    .replace(/~~~[\s\S]*?~~~/g, '');
}

// The numbers in a parent's "## Children" checklist ("- [ ] #12 title"), as publish writes them. Only that
// section counts: a task list elsewhere in the body ("- [ ] #99 upstream bug") names no child. Comments, code
// and quotes are ignored like everywhere else a body is read.
function checklistNumbers(issue) {
  const body = stripNonClaims(issue.body)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '');
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex(l => /^#{1,6}\s*Children\s*$/i.test(l.trim()));
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => /^#{1,6}\s/.test(l.trim()));
  const section = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  return [...section.matchAll(/^\s*[-*+]\s*\[[ xX]\]\s*#(\d+)\b/gm)].map(m => Number(m[1]));
}

function parentOf(issue) {
  const m = stripNonClaims(issue.body).match(/^Parent:\s*#(\d+)\s*$/im);
  return m ? Number(m[1]) : null;
}

// Only bare "#N" counts; "owner/repo#N" (another repository) never matches.
function closingRefsFromText(text) {
  const refs = new Set();
  const body = stripNonClaims(text);
  for (const m of body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)\b/gi)) {
    refs.add(Number(m[1]));
  }
  return refs;
}

function issueFromBranch(branch) {
  const m = String(branch || '').match(/^task\/(\d+)(?:-|$)/);
  return m ? Number(m[1]) : null;
}

const SUMMARY_MARKER = '<!-- haku:worker-summary -->';
// First line of a research report comment (posted by `issues.js research-post`).
const RESEARCH_MARKER = '<!-- haku:research -->';
// Written when the user decides a task was closed on purpose without a merged pull request.
const ACCEPTED_CLOSE_MARKER = '<!-- haku:accepted-close -->';
const VERIFIED_PREFIX = '<!-- haku:verified';

function verifiedMarker({ kind, status, sha }) {
  return `${VERIFIED_PREFIX} kind=${kind} status=${status} sha=${sha || 'unknown'} -->`;
}

function parseVerifiedMarker(text) {
  const m = String(text || '').match(/<!-- haku:verified kind=(\S+) status=(\S+) sha=(\S+) -->/);
  return m ? { kind: m[1], status: m[2], sha: m[3] } : null;
}

// Issues a merged PR is tied to: host closing links, explicit keywords, task/<N>-slug branch.
function prRefs(pr) {
  const refs = new Set([...(pr.closingIssues || []), ...closingRefsFromText(pr.body)]);
  const fromBranch = issueFromBranch(pr.headRefName);
  if (fromBranch) refs.add(fromBranch);
  return refs;
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'task';
}

module.exports = {
  TYPES,
  BASE_LABEL,
  typeLabel,
  kindLabel,
  WORK_KINDS,
  STATE_LABELS,
  baseLabelDefinitions,
  ownerLabel,
  labelStyle,
  TITLE_PREFIXES,
  stripPrefix,
  withPrefix,
  labelNames,
  issueType,
  issueOwner,
  parentOf,
  checklistNumbers,
  readableText,
  dependsOn,
  closingRefsFromText,
  issueFromBranch,
  prRefs,
  SUMMARY_MARKER,
  RESEARCH_MARKER,
  ACCEPTED_CLOSE_MARKER,
  verifiedMarker,
  parseVerifiedMarker,
  slugify,
  stripNonClaims
};
