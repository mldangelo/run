const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validate, DATASETS } = require('../scripts/validate.cjs');
const snapshot = require('./fixtures/snapshot.json');
const cases = require('./fixtures/validation-cases.json');

// Inputs and exact diagnostics captured from the original Python test suite.
for (const [index, example] of cases.entries()) {
  test(`validation parity ${index + 1}: ${example.name}`, () => {
    let data = structuredClone(snapshot);
    for (const change of example.changes) {
      if (!change.path.length) {
        data = structuredClone(change.value);
        continue;
      }
      const parent = change.path
        .slice(0, -1)
        .reduce((object, key) => object[key], data);
      const key = change.path.at(-1);
      if (change.remove) delete parent[key];
      else parent[key] = structuredClone(change.value);
    }
    assert.deepEqual(validate(data), example.errors);
  });
}
test('validation CLI summarizes valid data and prints every error for invalid data', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-validate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  const write = (data) => {
    for (const name of DATASETS)
      fs.writeFileSync(
        path.join(root, 'data', `${name}.json`),
        JSON.stringify(data[name]),
      );
  };
  const run = () =>
    spawnSync(
      process.execPath,
      [
        '-e',
        'process.exitCode = require(process.argv[1]).main(process.argv[2])',
        path.resolve(__dirname, '../scripts/validate.cjs'),
        root,
      ],
      { encoding: 'utf8' },
    );
  write(snapshot);
  let result = run();
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(
    result.stdout,
    'Valid: 1 clubs, 1 sources, 1 audits, 1 patterns, 1 dated events.\nValid: 1 race editions, 2 neighborhoods.\n',
  );
  const data = structuredClone(snapshot);
  data.events[0].source_id = 'src-x';
  data.races[0].end_date = '2026-11-13';
  write(data);
  result = run();
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /events.json evt-a: unknown source_id 'src-x'/);
  assert.match(result.stderr, /races.json race-a: end_date/);
  assert.match(result.stderr, /2 validation error\(s\) found/);
  fs.writeFileSync(path.join(root, 'data/events.json'), '{bad json');
  result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /events.json: could not be read as JSON/);
  fs.unlinkSync(path.join(root, 'data/events.json'));
  assert.equal(run().status, 1);
});
test('validation handles wrong JSON types and missing fields across every dataset', () => {
  for (const value of [null, false, 1, 'bad', []])
    assert.ok(validate(value).length);
  for (const name of DATASETS) {
    for (const value of [null, false, 1, 'bad', {}, []]) {
      const data = structuredClone(snapshot);
      data[name] = value;
      assert.doesNotThrow(() => validate(data));
    }
    for (const key of Object.keys(snapshot[name][0])) {
      for (const value of [null, false, 1, ' ', [], {}]) {
        const data = structuredClone(snapshot);
        data[name][0][key] = value;
        assert.doesNotThrow(
          () => validate(data),
          `${name}.${key}: ${JSON.stringify(value)}`,
        );
      }
    }
  }
});
