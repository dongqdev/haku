'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const build = read('skills/build/SKILL.md');
const setup = read('skills/setup/SKILL.md');
const step = (text, start, end) => {
  const i = text.indexOf(start);
  assert.ok(i !== -1, `missing ${start}`);
  const j = text.indexOf(end, i);
  return text.slice(i, j === -1 ? undefined : j);
};

test('build opens the merge approval message with the pull request\'s full address and its state', () => {
  const approval = step(build, '5. **Merge approval.**', '\n6. **After the merge:**');
  assert.match(approval, /\*\*Start the message that carries the question with the pull request's full address\*\*/);
  assert.match(approval, /`gh pr view <n> --json url --jq \.url`/);
  assert.match(approval, /never inside a code block or only as `#<n>`/);
  assert.match(approval, /neither can be tapped to open the page/);
  assert.match(approval, /whether the checks passed and whether the merge state is `CLEAN`/);
  assert.match(approval, /`gh pr view <n> --json mergeStateStatus --jq \.mergeStateStatus`/);
  assert.match(approval, /so the user can tap once and merge/);
});

test('the wait for the user\'s merge carries the same address, so the message is not just "please wait"', () => {
  const waiting = step(build, '10. **Waiting on state that sends no notification.**', '\n\n## ');
  assert.match(waiting, /When the wait is for the user's merge, that message also opens with the pull request's full address, as in step 5/);
});

test('setup gives the setup pull request\'s full address and whether it can be merged now', () => {
  const finish = step(setup, '## 4. Finish', '\n## ');
  assert.match(finish, /give its full address \(`gh pr view <n> --json url --jq \.url`\) in the body/);
  assert.match(finish, /never inside a code block or only as `#<n>`/);
  assert.match(finish, /whether the checks passed and whether it can be merged now/);
});
