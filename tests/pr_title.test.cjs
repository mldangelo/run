const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isConventionalTitle } = require('../scripts/check_pr_title.cjs');
test('accepts conventional titles, scopes, and breaking changes', () => {
  for (const title of [
    'feat: add RSS feed',
    'fix(schedule): show current runs',
    'refactor(api)!: change event shape',
  ]) {
    assert.equal(isConventionalTitle(title), true, title);
  }
});
test('rejects missing types, missing subjects, and multiline titles', () => {
  for (const title of [
    'Add RSS feed',
    'feat:',
    'feat: ',
    'Feat: add',
    'feat: title\nbody',
  ]) {
    assert.equal(isConventionalTitle(title), false, title);
  }
});
