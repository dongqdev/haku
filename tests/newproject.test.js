'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { validateRepoName, listRepoNames, repoExists, checkNames, readUserConfig, planProject, createProject } = require('../scripts/lib/newproject');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'haku-newproject-'));
const gitOk = spawnSync('git', ['--version']).status === 0;

// A fake exec: git runs for real (a local repository is safe), gh is recorded and never leaves the machine.
function fakeExec({ repos = [], failGh = false } = {}) {
  const calls = [];
  const exec = (bin, args, options) => {
    calls.push({ bin, args, cwd: options && options.cwd });
    if (bin === 'gh-fake') {
      if (args[0] === 'repo' && args[1] === 'list') return JSON.stringify(repos.map(name => ({ name })));
      if (args[0] === 'repo' && args[1] === 'view') {
        if (repos.includes(args[2].split('/').pop())) return '{"name":"x"}';
        throw Object.assign(new Error('x'), { stderr: 'GraphQL: Could not resolve to a Repository' });
      }
      if (failGh === 'create' && args[1] !== 'create') return '';
      if (failGh) {
        const err = new Error('gh failed');
        err.stderr = 'HTTP 422: name already exists';
        throw err;
      }
      return '';
    }
    if (bin === 'git' && args[0] === 'push') return ''; // there is no real remote
    const r = spawnSync(bin, args, { encoding: 'utf8', cwd: options && options.cwd, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    if (r.status !== 0) {
      const err = new Error(`git ${args.join(' ')} failed`);
      err.stderr = r.stderr;
      throw err;
    }
    return r.stdout;
  };
  return { exec, calls };
}

test('repository names: only legal GitHub names pass', () => {
  for (const ok of ['toss-stock', 'a', 'My_Repo.v2']) assert.strictEqual(validateRepoName(ok), null, ok);
  for (const bad of ['', '.', '..', 'a b', 'a/b', 'x.git', 'a'.repeat(101), '한글', undefined, '../x', '-c', '-dx', '-pevil/tpl', '.hidden', 'foo.', 'CON', 'nul.txt', 'lpt1']) assert.ok(validateRepoName(bad), String(bad));
});

test('candidates get the prefix, and a name that already exists (any letter case) or repeats is not ok', () => {
  const result = checkNames(['stock-bot', 'Taken', 'bad name', 'stock-bot'], { prefix: 'ecc-', existing: ['ECC-taken'] });
  assert.deepStrictEqual(result.map(r => [r.name, r.ok]), [['ecc-stock-bot', true], ['ecc-Taken', false], ['ecc-bad name', false], ['ecc-stock-bot', false]]);
  assert.match(result[1].problem, /already exists/);
  assert.match(result[2].problem, /letters, digits/);
});

test('the repository list is read for the given owner, and a list that fills the limit is an error', () => {
  const { exec, calls } = fakeExec({ repos: ['a', 'B'] });
  assert.deepStrictEqual(listRepoNames('me', { exec, ghBin: 'gh-fake' }), ['a', 'b']);
  assert.deepStrictEqual(calls[0].args.slice(0, 3), ['repo', 'list', 'me']);
  const full = fakeExec({ repos: Array.from({ length: 1000 }, (_, i) => `r${i}`) });
  assert.throws(() => listRepoNames(null, { exec: full.exec, ghBin: 'gh-fake' }), /cut off/);
});

test('user defaults come from the env var or ~/.haku/config.json; broken values are reported, private stays the default', () => {
  const home = tmp();
  assert.deepStrictEqual(readUserConfig({ env: {}, home }), { file: path.join(home, '.haku', 'config.json'), warnings: [], projectsDir: null, repoPrefix: '', visibility: 'private' });
  fs.mkdirSync(path.join(home, '.haku'));
  fs.writeFileSync(path.join(home, '.haku', 'config.json'), JSON.stringify({ projectsDir: '/app/git', repoPrefix: 'ecc-', visibility: 'public' }));
  const c = readUserConfig({ env: {}, home });
  assert.deepStrictEqual([c.projectsDir, c.repoPrefix, c.visibility], ['/app/git', 'ecc-', 'public']);
  assert.strictEqual(readUserConfig({ env: { HAKU_PROJECTS_DIR: '/x' }, home }).projectsDir, '/x');
  fs.writeFileSync(path.join(home, '.haku', 'config.json'), JSON.stringify({ projectsDir: 5, visibility: 'secret' }));
  const bad = readUserConfig({ env: {}, home });
  assert.strictEqual(bad.visibility, 'private');
  assert.strictEqual(bad.warnings.length, 2);
  fs.writeFileSync(path.join(home, '.haku', 'config.json'), '{ nope');
  assert.match(readUserConfig({ env: {}, home }).warnings[0], /could not be read/);
});

test('the plan refuses an unsafe name, owner, visibility, relative or missing parent, and an existing path', () => {
  const parent = tmp();
  const base = { name: 'proj', parentDir: parent };
  assert.throws(() => planProject({ ...base, name: '../x' }), /repository name/);
  assert.throws(() => planProject({ ...base, owner: 'a/b' }), /not a valid account/);
  assert.throws(() => planProject({ ...base, visibility: 'secret' }), /visibility/);
  assert.throws(() => planProject({ ...base, parentDir: 'relative' }), /absolute/);
  assert.throws(() => planProject({ ...base, parentDir: path.join(parent, 'missing') }), /does not exist/);
  fs.mkdirSync(path.join(parent, 'proj'));
  assert.throws(() => planProject(base), /already exists/);
  const plan = planProject({ name: 'fresh', parentDir: parent, owner: 'me' });
  assert.strictEqual(plan.slug, 'me/fresh');
  assert.strictEqual(plan.visibility, 'private');
  assert.match(plan.steps.join('\n'), /REMOTE WRITE/);
  assert.match(plan.notice, /straight to main/);
  assert.strictEqual(fs.existsSync(plan.folder), false, 'a plan creates nothing');
});

test('creating makes the folder, the first commit on main, then the remote - in that order', { skip: !gitOk }, () => {
  const parent = tmp();
  const plan = planProject({ name: 'fresh', parentDir: parent, owner: 'me', visibility: 'public' });
  const { exec, calls } = fakeExec();
  const result = createProject(plan, { exec, ghBin: 'gh-fake' });
  assert.deepStrictEqual(result.done, ['create folder', 'git init', 'first commit', 'create remote', 'push']);
  assert.strictEqual(fs.readFileSync(path.join(plan.folder, 'README.md'), 'utf8'), '# fresh\n');
  const log = spawnSync('git', ['log', '--format=%s', '-1'], { cwd: plan.folder, encoding: 'utf8' }).stdout.trim();
  assert.strictEqual(log, 'Initial commit');
  assert.strictEqual(spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: plan.folder, encoding: 'utf8' }).stdout.trim(), 'main');
  const gh = calls.filter(c => c.bin === 'gh-fake');
  assert.strictEqual(gh.length, 1, 'exactly one remote write');
  assert.deepStrictEqual(gh[0].args, ['repo', 'create', 'me/fresh', '--public', '--source', '.', '--remote', 'origin']);
  assert.deepStrictEqual(calls.at(-1).args, ['push', '-q', '-u', 'origin', 'main']);
  assert.strictEqual(gh[0].cwd, plan.folder);
  // the remote is created after the commit exists
  assert.ok(calls.findIndex(c => c.args[0] === 'commit') < calls.findIndex(c => c.bin === 'gh-fake'));
});

test('a failing remote leaves the local repository, deletes nothing and says what was done', { skip: !gitOk }, () => {
  const parent = tmp();
  const plan = planProject({ name: 'fresh', parentDir: parent });
  const { exec } = fakeExec({ failGh: true });
  assert.throws(() => createProject(plan, { exec, ghBin: 'gh-fake' }), err => {
    assert.match(err.message, /create remote failed: HTTP 422/);
    assert.match(err.message, /Done so far: create folder; git init; first commit/);
    assert.match(err.message, /may exist.*gh repo view fresh/);
    assert.match(err.message, /Nothing was deleted/);
    return true;
  });
  assert.ok(fs.existsSync(path.join(plan.folder, '.git')));
  assert.ok(fs.existsSync(path.join(plan.folder, 'README.md')));
});

test('git cannot commit: the remote is never created', { skip: !gitOk }, () => {
  const parent = tmp();
  const plan = planProject({ name: 'fresh', parentDir: parent });
  const calls = [];
  const exec = (bin, args, options) => {
    calls.push(bin);
    if (args[0] === 'commit') throw Object.assign(new Error('x'), { stderr: 'Author identity unknown' });
    if (bin === 'git') return spawnSync(bin, args, { cwd: options.cwd, encoding: 'utf8' }).stdout;
    throw new Error('gh must not be called');
  };
  assert.throws(() => createProject(plan, { exec, ghBin: 'gh-fake' }), /first commit failed: Author identity unknown/);
  assert.ok(!calls.includes('gh-fake'));
});

test('project-new is a dry run without --apply and creates nothing', () => {
  const parent = tmp();
  const cli = path.join(__dirname, '..', 'scripts', 'issues.js');
  const r = spawnSync(process.execPath, [cli, 'project-new', '--name', 'fresh', '--dir', parent], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.dryRun, true);
  assert.strictEqual(out.visibility, 'private');
  assert.deepStrictEqual(fs.readdirSync(parent), []);
  const bad = spawnSync(process.execPath, [cli, 'project-new', '--name', 'fresh'], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stderr, /--dir/);
});

test('an owner that looks like a flag is refused before gh is called', () => {
  const { exec, calls } = fakeExec();
  assert.throws(() => listRepoNames('-q', { exec, ghBin: 'gh-fake' }), /not a valid account/);
  assert.throws(() => repoExists('-q', 'x', { exec, ghBin: 'gh-fake' }), /not a valid account/);
  assert.strictEqual(calls.length, 0);
});

test('repoExists: found, not found, and any other failure is not an answer', () => {
  const { exec } = fakeExec({ repos: ['there'] });
  assert.strictEqual(repoExists('me', 'there', { exec, ghBin: 'gh-fake' }), true);
  assert.strictEqual(repoExists('me', 'gone', { exec, ghBin: 'gh-fake' }), false);
  const broken = () => { throw Object.assign(new Error('x'), { stderr: 'network down' }); };
  assert.throws(() => repoExists('me', 'x', { exec: broken, ghBin: 'gh-fake' }), /could not check.*network down/);
});

test('a push that fails after the remote exists is reported as a push failure', { skip: !gitOk }, () => {
  const parent = tmp();
  const plan = planProject({ name: 'fresh', parentDir: parent });
  const { exec } = fakeExec();
  const failPush = (bin, args, options) => {
    if (bin === 'git' && args[0] === 'push') throw Object.assign(new Error('x'), { stderr: 'remote rejected' });
    return exec(bin, args, options);
  };
  assert.throws(() => createProject(plan, { exec: failPush, ghBin: 'gh-fake' }), err => {
    assert.match(err.message, /^push failed: remote rejected/);
    assert.match(err.message, /create remote\.?/);
    return true;
  });
});

test('a parent folder inside a Git repository is refused', { skip: !gitOk }, () => {
  const outer = tmp();
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: outer });
  fs.mkdirSync(path.join(outer, 'sub'));
  assert.throws(() => planProject({ name: 'nested', parentDir: path.join(outer, 'sub') }), /inside the Git repository/);
});

test('project-new refuses a relative --dir, and project-names a flag-like owner', () => {
  const cli = path.join(__dirname, '..', 'scripts', 'issues.js');
  const rel = spawnSync(process.execPath, [cli, 'project-new', '--name', 'fresh', '--dir', '../x'], { encoding: 'utf8' });
  assert.strictEqual(rel.status, 1);
  assert.match(rel.stderr, /absolute/);
  const owner = spawnSync(process.execPath, [cli, 'project-names', '--names', 'a', '--owner', '-q'], { encoding: 'utf8' });
  assert.strictEqual(owner.status, 1);
  assert.match(owner.stderr, /not a valid account|needs a value/);
});
