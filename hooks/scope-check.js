#!/usr/bin/env node
'use strict';

// PreToolUse hook (Edit|Write): notices a write outside the task Scope and records it. Record-only: it never
// blocks, whatever the input, and exits 0 on every path (fail open). Input is never passed to a shell.

const path = require('path');
const hookCommon = require(path.join(__dirname, '..', 'scripts', 'lib', 'hook-common.js'));

async function main() {
  const { text, tooBig } = await hookCommon.readLimited(process.stdin);
  if (tooBig) return;
  const input = JSON.parse(text);
  if (!input || typeof input !== 'object') return;
  const file = input.tool_input && input.tool_input.file_path;
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const j = hookCommon.judge({ cwd, file });
  if (j.verdict !== 'outside') return;
  hookCommon.recordViolation(process.env.CLAUDE_PLUGIN_DATA, j.root, { file: j.rel, scope: j.scope });
}

main().then(() => process.exit(0), () => process.exit(0));
