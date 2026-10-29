'use strict';

// Issue model shared by every Git host. Hierarchy is expressed with labels and a
// "Parent: #N" line in the body, so it works identically on GitHub and GitLab.

const TYPES = ['story', 'milestone', 'task'];
const BASE_LABEL = 'haku';

const typeLabel = type => `type:${type}`;
// Who owns an issue is the host's assignee. The owner label is only the fallback for people
// who cannot be assigned (for example, not a collaborator on the repository).
const ownerLabel = name => `owner:${name}`;

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
  ownerLabel,
  labelNames,
  issueType,
  issueOwner,
  parentOf,
  dependsOn,
  closingRefsFromText,
  issueFromBranch,
  prRefs,
  SUMMARY_MARKER,
  verifiedMarker,
  parseVerifiedMarker,
  slugify,
  stripNonClaims
};
