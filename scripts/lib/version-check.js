'use strict';

// Claude Code installs a plugin into a cache keyed by its version, so a merged change that keeps the
// version never reaches an installed copy. The marketplace source is the whole repository, so anything
// that is not clearly documentation, tests or CI counts as shipped and must come with a higher version.
const EXEMPT = /^(?:(?:README\.md|LICENSE|\.gitignore)$|(?:tests|\.github)\/)/;

const needsBump = files => files.some(f => !EXEMPT.test(f.replace(/\\/g, '/')));

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

// Negative when a < b. Both must be valid x.y.z.
function compareVersions(a, b) {
  const pa = a.match(SEMVER).slice(1).map(Number);
  const pb = b.match(SEMVER).slice(1).map(Number);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

// plugin.json and the marketplace entry must name the same version.
function manifestProblems(plugin, marketplace) {
  const entry = ((marketplace && marketplace.plugins) || []).find(p => p.name === plugin.name);
  if (!entry) return [`marketplace.json has no entry for "${plugin.name}"`];
  return entry.version === plugin.version
    ? []
    : [`version mismatch: plugin.json ${plugin.version}, marketplace.json ${entry.version}`];
}

// The version must be x.y.z, never lower than the base's, and strictly higher when shipped files changed.
function bumpProblems({ changedFiles, baseVersion, version }) {
  if (!SEMVER.test(String(version))) return [`version "${version}" is not x.y.z`];
  if (!SEMVER.test(String(baseVersion))) return [`base version "${baseVersion}" is not x.y.z`];
  const cmp = compareVersions(version, baseVersion);
  if (cmp < 0) return [`version ${version} is lower than the base's ${baseVersion}`];
  if (needsBump(changedFiles) && cmp === 0) {
    return [`the plugin's files changed but the version is still ${version}; raise it in plugin.json and marketplace.json`];
  }
  return [];
}

module.exports = { needsBump, compareVersions, manifestProblems, bumpProblems };
