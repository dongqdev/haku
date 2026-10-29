'use strict';

// Claude Code installs a plugin into a cache keyed by its version, so a merged change that keeps the
// version never reaches an installed copy. Any change to what the plugin ships must raise the version.
const SHIPPED = /^(?:skills|agents|scripts|\.claude-plugin)\//;

const needsBump = files => files.some(f => SHIPPED.test(f.replace(/\\/g, '/')));

// plugin.json and the marketplace entry must name the same version.
function manifestProblems(plugin, marketplace) {
  const entry = ((marketplace && marketplace.plugins) || []).find(p => p.name === plugin.name);
  if (!entry) return [`marketplace.json has no entry for "${plugin.name}"`];
  return entry.version === plugin.version
    ? []
    : [`version mismatch: plugin.json ${plugin.version}, marketplace.json ${entry.version}`];
}

function bumpProblems({ changedFiles, baseVersion, version }) {
  if (needsBump(changedFiles) && baseVersion === version) {
    return [`the plugin's files changed but the version is still ${version}; raise it in plugin.json and marketplace.json`];
  }
  return [];
}

module.exports = { needsBump, manifestProblems, bumpProblems };
