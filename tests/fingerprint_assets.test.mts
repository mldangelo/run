import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type TestContext, test } from 'node:test';
import { fingerprint } from '../scripts/fingerprint_assets.mts';

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-fingerprint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'site'));
  return root;
}
const references = (root: string) =>
  [
    ...fs
      .readFileSync(path.join(root, 'index.html'), 'utf8')
      .matchAll(/(?:src|href)="([^"]+)"/g),
  ].map((match) => match[1]);
test('changed assets get new URLs, unchanged assets keep theirs, and older files remain valid', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'site/app.js'), 'old app');
  fs.writeFileSync(path.join(root, 'site/style.css'), 'same css');
  const html =
    '<script src="site/app.js"></script><link href="site/style.css" rel="stylesheet">';
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fingerprint(root);
  const old = references(root);
  fs.writeFileSync(path.join(root, 'site/app.js'), 'new app');
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fingerprint(root);
  const next = references(root);
  assert.notEqual(old[0], next[0]);
  assert.equal(old[1], next[1]);
  assert.equal(fs.readFileSync(path.join(root, next[0]), 'utf8'), 'new app');
  assert.equal(fs.readFileSync(path.join(root, old[0]), 'utf8'), 'old app');
});
test('feed, external links, metadata, queries and fragments retain their meaning', (t) => {
  const root = fixture(t);
  const unchanged =
    '<a href="feed.xml">RSS</a><a href="#index">Runs</a><link href="https://example.org/app.css"><meta content="https://example.org/card.png">';
  fs.writeFileSync(path.join(root, 'site/app.js'), 'example');
  fs.writeFileSync(
    path.join(root, 'index.html'),
    `${unchanged}<script src="site/app.js?v=1#start"></script>`,
  );
  fingerprint(root);
  assert.ok(
    fs
      .readFileSync(path.join(root, 'index.html'), 'utf8')
      .startsWith(unchanged),
  );
  assert.match(
    references(root).at(-1) || '',
    /app\.[a-f0-9]{12}\.js\?v=1#start$/,
  );
});
test('a model change updates both module URLs and the importing app URL', (t) => {
  const root = fixture(t);
  const html = '<script type="module" src="site/app.js"></script>';
  fs.writeFileSync(
    path.join(root, 'site/app.js'),
    "import { value } from './model.js';\nconsole.log(value);\n",
  );
  fs.writeFileSync(path.join(root, 'site/model.js'), 'export const value = 1;');
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fingerprint(root);
  const old = references(root)[0];
  const oldApp = fs.readFileSync(path.join(root, old), 'utf8');
  fs.writeFileSync(path.join(root, 'site/model.js'), 'export const value = 2;');
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fingerprint(root);
  const next = references(root)[0];
  const nextApp = fs.readFileSync(path.join(root, next), 'utf8');
  assert.notEqual(next, old);
  assert.notEqual(nextApp, oldApp);
  const dependency = /from '(\.\/model\.[a-f0-9]{12}\.js)'/.exec(nextApp);
  assert(dependency);
  assert.equal(
    fs.readFileSync(path.join(root, 'site', dependency[1]), 'utf8'),
    'export const value = 2;',
  );
  assert.equal(
    fs.readFileSync(path.join(root, 'site/app.js'), 'utf8'),
    "import { value } from './model.js';\nconsole.log(value);\n",
  );
});
test('real site references resolve to content-addressed files and fingerprinting is idempotent', (t) => {
  const root = fixture(t);
  const source = path.resolve(import.meta.dirname, '..');
  fs.copyFileSync(
    path.join(source, 'index.html'),
    path.join(root, 'index.html'),
  );
  fs.cpSync(path.join(source, 'site'), path.join(root, 'site'), {
    recursive: true,
  });
  fingerprint(root);
  for (const ref of references(root).filter((ref) => ref.startsWith('site/'))) {
    const digest = createHash('sha256')
      .update(fs.readFileSync(path.join(root, ref)))
      .digest('hex')
      .slice(0, 12);
    assert.ok(ref.includes(`.${digest}.`));
  }
  const before = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  fingerprint(root);
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), before);
});
test('assets and imported modules cannot escape the artifact directory', (t) => {
  const root = fixture(t);
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<script src="../app.js"></script>',
  );
  assert.throws(() => fingerprint(root), /stay relative/);
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<script src="site/app.js"></script>',
  );
  fs.writeFileSync(
    path.join(root, 'site/app.js'),
    "import value from '../../outside.js';",
  );
  assert.throws(() => fingerprint(root), /stay relative/);
});
test('multi-line and dynamic module imports are versioned', (t) => {
  const root = fixture(t);
  fs.writeFileSync(
    path.join(root, 'site/app.js'),
    "import {\n  first,\n  second,\n} from './model.js';\nconst later = import('./extra.js');\nconsole.log(first, second, later);\n",
  );
  fs.writeFileSync(
    path.join(root, 'site/model.js'),
    'export const first = 1;\nexport const second = 2;',
  );
  fs.writeFileSync(path.join(root, 'site/extra.js'), 'export default 3;');
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<script type="module" src="site/app.js"></script>',
  );
  fingerprint(root);
  const app = fs.readFileSync(path.join(root, references(root)[0]), 'utf8');
  assert.match(app, /\} from '\.\/model\.[a-f0-9]{12}\.js';/);
  assert.match(app, /import\('\.\/extra\.[a-f0-9]{12}\.js'\)/);
});
