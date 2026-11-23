import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type TestContext, test } from 'node:test';
import { buildSite, siteModules } from '../scripts/build_site.mts';

// Every site/*.ts file is a browser module, whatever its name.
const MODULES = ['app', 'format', 'model', 'theme'];

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-site-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'site'));
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        noEmit: true,
        moduleDetection: 'legacy',
      },
      include: ['site/*.ts'],
    }),
  );
  for (const name of MODULES)
    fs.writeFileSync(
      path.join(root, 'site', `${name}.ts`),
      'const count: number = 1;\nconsole.log(count);\n',
    );
  return root;
}
test('browser generation strips types and rebuilds assets after source changes', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'site/style.css'), 'body {}\n');
  assert.deepEqual(siteModules(root), MODULES);
  assert.equal(buildSite(root), 0);
  for (const name of MODULES)
    assert.match(
      fs.readFileSync(path.join(root, 'site', `${name}.js`), 'utf8'),
      new RegExp(`^// Generated from ${name}\\.ts;`),
    );
  const file = path.join(root, 'site/app.js');
  const before = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(before, /: number/);
  fs.writeFileSync(
    path.join(root, 'site/app.ts'),
    'const count: number = 2;\nconsole.log(count);\n',
  );
  assert.equal(buildSite(root), 0);
  assert.notEqual(fs.readFileSync(file, 'utf8'), before);
});
test('invalid TypeScript cannot replace previously generated browser files', (t) => {
  const root = fixture(t);
  assert.equal(buildSite(root), 0);
  const file = path.join(root, 'site/app.js');
  const before = fs.readFileSync(file, 'utf8');
  // An error in any one module keeps every generated module as it was.
  fs.writeFileSync(path.join(root, 'site/app.ts'), 'const count: number = 3;');
  fs.writeFileSync(path.join(root, 'site/format.ts'), 'const = ;');
  assert.throws(() => buildSite(root), /error TS/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
