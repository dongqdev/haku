'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Starting a project from nothing: check candidate repository names, plan the folder and the remote, and create
// them only on --apply. `exec(bin, args, options)` can be injected so tests need no real gh or network.
const TIMEOUT_MS = 60000;
const LIST_LIMIT = 1000;
// Starts with a letter, digit or underscore: a leading "-" would be read as a gh flag, a leading "." makes a hidden folder.
const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const VISIBILITIES = ['private', 'public'];

function validateRepoName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) return 'a repository name uses only letters, digits, ".", "_" and "-", starts with a letter, digit or "_", and has 1-100 characters';
  if (name.endsWith('.git') || name.endsWith('.') || WINDOWS_RESERVED.test(name)) return `"${name}" is not allowed as a repository name (it cannot be a folder on every system)`;
  return null;
}

function run(exec, bin, args, options = {}) {
  return exec(bin, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, ...options });
}

// Names already used by the account or organization. A list that fills the limit may be cut off, which is an
// error here: "no clash" must never be claimed from a partial list.
function checkOwner(owner) {
  if (owner !== null && owner !== undefined && !OWNER_RE.test(owner)) throw new Error(`"${owner}" is not a valid account or organization name`);
}

function listRepoNames(owner, { exec = execFileSync, ghBin = 'gh' } = {}) {
  checkOwner(owner);
  const args = ['repo', 'list', ...(owner ? [owner] : []), '--limit', String(LIST_LIMIT), '--json', 'name'];
  const names = JSON.parse(run(exec, ghBin, args)).map(r => String(r.name).toLowerCase());
  if (names.length >= LIST_LIMIT) throw new Error(`the repository list reached ${LIST_LIMIT} entries and may be cut off; name clashes cannot be ruled out`);
  return names;
}

// Exact check for one name (used right before the remote write). gh says "Could not resolve" for a repository that
// does not exist; any other failure is not an answer and is thrown.
function repoExists(owner, name, { exec = execFileSync, ghBin = 'gh' } = {}) {
  checkOwner(owner);
  const slug = owner ? `${owner}/${name}` : name;
  try {
    run(exec, ghBin, ['repo', 'view', slug, '--json', 'name']);
    return true;
  } catch (err) {
    const text = String((err.stderr && err.stderr.toString()) || err.message);
    if (/could not resolve|not found/i.test(text)) return false;
    throw new Error(`could not check whether ${slug} exists: ${text.trim()}`);
  }
}

// Candidates as the user will see them: the optional prefix applied, the name checked for validity and for a clash.
function checkNames(candidates, { owner = null, prefix = '', existing } = {}) {
  const taken = new Set(existing.map(n => String(n).toLowerCase()));
  const seen = new Set();
  return candidates.map(raw => {
    const name = `${prefix}${String(raw).trim()}`;
    const problem = validateRepoName(name);
    const key = name.toLowerCase();
    const clash = taken.has(key) || seen.has(key);
    seen.add(key);
    return { name, owner, ok: !problem && !clash, problem: problem || (clash ? 'a repository with this name already exists (or is listed twice)' : null) };
  });
}

// User-level defaults (never inside a repository): HAKU_PROJECTS_DIR, else ~/.haku/config.json
// { "projectsDir": "...", "repoPrefix": "...", "visibility": "private" }. Missing file = no defaults.
function readUserConfig({ env = process.env, home = os.homedir() } = {}) {
  const file = path.join(home, '.haku', 'config.json');
  const warnings = [];
  let config = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) warnings.push(`${file} must contain a JSON object; it is ignored`);
    else config = parsed;
  } catch (err) {
    if (err.code !== 'ENOENT') warnings.push(`${file} could not be read (${err.message}); it is ignored`);
  }
  const text = (value, what) => {
    if (value === undefined) return null;
    if (typeof value === 'string' && value) return value;
    warnings.push(`${what} in ${file} must be a non-empty text; it is ignored`);
    return null;
  };
  const visibility = config.visibility === undefined ? null : config.visibility;
  if (visibility !== null && !VISIBILITIES.includes(visibility)) warnings.push(`visibility in ${file} must be private or public; private is recommended`);
  return {
    file,
    warnings,
    projectsDir: env.HAKU_PROJECTS_DIR || text(config.projectsDir, 'projectsDir'),
    repoPrefix: text(config.repoPrefix, 'repoPrefix') || '',
    visibility: VISIBILITIES.includes(visibility) ? visibility : 'private'
  };
}

// What would be created. Throws on anything that makes the plan unsafe so the caller never shows a plan it cannot run.
function planProject({ name, parentDir, owner = null, visibility = 'private' }) {
  const problem = validateRepoName(name);
  if (problem) throw new Error(problem);
  checkOwner(owner);
  if (!VISIBILITIES.includes(visibility)) throw new Error(`visibility must be ${VISIBILITIES.join(' or ')}`);
  if (!parentDir || !path.isAbsolute(parentDir)) throw new Error('the project folder must be an absolute path');
  if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) throw new Error(`${parentDir} does not exist or is not a folder`);
  // A repository inside another repository would be committed into the outer one.
  const outer = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: parentDir, encoding: 'utf8' });
  if (outer.status === 0) throw new Error(`${parentDir} is inside the Git repository ${outer.stdout.trim()}; pick a folder outside any repository`);
  const folder = path.join(parentDir, name);
  if (fs.existsSync(folder)) throw new Error(`${folder} already exists; nothing is created over an existing path`);
  const slug = owner ? `${owner}/${name}` : name;
  return {
    name,
    owner,
    slug,
    visibility,
    folder,
    steps: [
      `create folder ${folder}`,
      'git init -b main',
      'write README.md and make the first commit on main',
      `gh repo create ${slug} --${visibility} --source . --remote origin (REMOTE WRITE)`,
      'git push -u origin main (REMOTE WRITE)'
    ],
    // The first commit goes to the new, empty default branch without a pull request. It is the only time haku does this.
    notice: 'The first commit is pushed straight to main of the new empty repository, the one exception to the no-direct-push rule. Everything after it goes through pull requests.'
  };
}

// Folder, git, first commit, remote, push. The remote is created and pushed in two steps so a failed push is reported
// as such (the repository then exists on the host). A failure never deletes anything; the error says what was done.
function createProject(plan, { exec = execFileSync, ghBin = 'gh', gitBin = 'git' } = {}) {
  const done = [];
  const step = (label, fn) => {
    try {
      fn();
    } catch (err) {
      const detail = String((err.stderr && err.stderr.toString()) || err.message).trim();
      const hint = label === 'create remote' ? ` The repository may exist on the host anyway; check with: gh repo view ${plan.slug}.` : '';
      throw new Error(`${label} failed: ${detail}. Done so far: ${done.length ? done.join('; ') : 'nothing'}.${hint} Nothing was deleted.`);
    }
    done.push(label);
  };
  step('create folder', () => fs.mkdirSync(plan.folder));
  step('git init', () => run(exec, gitBin, ['init', '-q', '-b', 'main'], { cwd: plan.folder }));
  step('first commit', () => {
    fs.writeFileSync(path.join(plan.folder, 'README.md'), `# ${plan.name}\n`, 'utf8');
    run(exec, gitBin, ['add', 'README.md'], { cwd: plan.folder });
    run(exec, gitBin, ['commit', '-q', '-m', 'Initial commit'], { cwd: plan.folder });
  });
  step('create remote', () => run(exec, ghBin, ['repo', 'create', plan.slug, `--${plan.visibility}`, '--source', '.', '--remote', 'origin'], { cwd: plan.folder }));
  step('push', () => run(exec, gitBin, ['push', '-q', '-u', 'origin', 'main'], { cwd: plan.folder }));
  return { ok: true, folder: plan.folder, repo: plan.slug, done };
}

module.exports = { validateRepoName, listRepoNames, repoExists, checkNames, readUserConfig, planProject, createProject, VISIBILITIES };
