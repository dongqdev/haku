'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readConfig, titlePrefixOn } = require('../scripts/lib/config');
const { slugify, stripPrefix, withPrefix } = require('../scripts/lib/model');
const { publish, validateDraft } = require('../scripts/lib/publish');
const { startWorker } = require('../scripts/lib/worker');

function repoWith(config) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-config-'));
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  fs.mkdirSync(path.join(repo, '.haku'));
  if (config !== undefined) fs.writeFileSync(path.join(repo, '.haku', 'config.json'), config);
  fs.mkdirSync(path.join(repo, 'src', 'deep'), { recursive: true });
  return repo;
}

test('the config is found from a subfolder of the repository, not only from its root', () => {
  const repo = repoWith('{ "titlePrefix": false }');
  for (const cwd of [repo, path.join(repo, 'src'), path.join(repo, 'src', 'deep')]) {
    const { config, warnings } = readConfig(cwd);
    assert.strictEqual(titlePrefixOn(config), false, cwd);
    assert.deepStrictEqual(warnings, []);
  }
});

test('without a config file the defaults apply and nothing is reported', () => {
  const { config, warnings } = readConfig(repoWith(undefined));
  assert.strictEqual(titlePrefixOn(config), true);
  assert.deepStrictEqual(warnings, []);
});

test('a config that cannot be parsed, or a wrong type, is reported and the prefix stays on', () => {
  const broken = readConfig(repoWith('{ not json'));
  assert.strictEqual(titlePrefixOn(broken.config), true);
  assert.match(broken.warnings[0], /not valid JSON/);
  const wrong = readConfig(repoWith('{ "titlePrefix": "false" }'));
  assert.strictEqual(titlePrefixOn(wrong.config), true);
  assert.match(wrong.warnings[0], /must be true or false/);
});

const verify = { kind: 'T1', profile: 'unit' };
const draft = title => ({
  assignee: 'a',
  story: { id: 'S', title, verify },
  milestones: [{ id: 'M', title: 'B', verify, tasks: [{ id: 'T', title: 'Model', acceptance: ['x'], scope: ['s'], verify }] }]
});

test('the dry run shows the titles that will really be created', () => {
  const on = publish(null, draft('Login'), { titlePrefix: true });
  assert.deepStrictEqual(on.plan.map(p => p.title), ['[Story] Login', '[Milestone] B', '[Task] Model']);
  const off = publish(null, draft('Login'), { titlePrefix: false });
  assert.deepStrictEqual(off.plan.map(p => p.title), ['Login', 'B', 'Model']);
});

test('only the issue\'s own kind prefix is normalized; another kind is the author\'s text and stays', () => {
  assert.strictEqual(withPrefix('story', '[Task] x'), '[Story] [Task] x');
  assert.strictEqual(withPrefix('story', '[story] x'), '[Story] x');
  assert.strictEqual(withPrefix('task', '[Task]x'), '[Task] x');
  assert.strictEqual(withPrefix('task', '[Tasks] x'), '[Task] [Tasks] x');
});

test('a draft title that is only a kind prefix, or too long to carry one, is rejected', () => {
  assert.match(validateDraft(draft('[Story]')).join('\n'), /empty after the kind prefix/);
  assert.match(validateDraft(draft('x'.repeat(245))).join('\n'), /longer than 244/);
  assert.deepStrictEqual(validateDraft(draft('x'.repeat(244))), []);
});

test('the work branch is named from the title without the kind prefix', () => {
  assert.strictEqual(slugify(stripPrefix('[Task] Model')), 'model');
  const repo = repoWith(undefined);
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: repo });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'haku-home-'));
  const w = startWorker({ cwd: repo, issue: 12, title: '[Task] Model', base: 'main', home });
  assert.strictEqual(w.branch, 'task/12-model');
});

test('publish through the CLI reads the config from a subfolder and honours titlePrefix=false', () => {
  const repo = repoWith('{ "titlePrefix": false }');
  const cli = path.join(__dirname, '..', 'scripts', 'issues.js');
  const file = path.join(repo, 'src', 'deep', 'draft.json');
  fs.writeFileSync(file, JSON.stringify(draft('Login')));
  const r = spawnSync(process.execPath, [cli, 'publish', file], { cwd: path.join(repo, 'src', 'deep'), encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout).plan.map(p => p.title), ['Login', 'B', 'Model']);
});

test('a config that is not a JSON object is reported instead of crashing', () => {
  for (const content of ['null', '"x"', '[1]', '7']) {
    const { config, warnings } = readConfig(repoWith(content));
    assert.strictEqual(titlePrefixOn(config), true, content);
    assert.match(warnings[0], /must contain a JSON object/, content);
  }
});

test('the branch command names the branch from the title without its kind prefix', () => {
  const cli = path.join(__dirname, '..', 'scripts', 'issues.js');
  const r = spawnSync(process.execPath, [cli, 'branch', '--issue', '5', '--title', '[Task] Model'], { encoding: 'utf8' });
  assert.strictEqual(r.stdout.trim(), 'task/5-model');
});
