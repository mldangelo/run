import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type TestContext, test } from 'node:test';
import { fingerprint, srcset } from '../scripts/fingerprint_assets.mts';

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
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sources = [...html.matchAll(/srcset="([^"]+)"/g)].flatMap(([, set]) =>
    [...set.matchAll(/(?:^|,)\s*(site\/\S+?)(?=\s|,|$)/g)].map((m) => m[1]),
  );
  assert.ok(sources.length > 0, 'expected srcset candidates');
  const local = [...references(root), ...sources].filter((ref) =>
    ref.startsWith('site/'),
  );
  const stylesheet = local.find((ref) => ref.endsWith('.css')) || '';
  const fonts = [
    ...fs
      .readFileSync(path.join(root, stylesheet), 'utf8')
      .matchAll(/url\("?([^")]+)"?\)/g),
  ].map(([, url]) => path.posix.join('site', url));
  assert.ok(fonts.length > 0, 'expected stylesheet fonts');
  for (const ref of [...local, ...fonts]) {
    const digest = createHash('sha256')
      .update(fs.readFileSync(path.join(root, ref)))
      .digest('hex')
      .slice(0, 12);
    assert.ok(ref.includes(`.${digest}.`), ref);
  }
  // A module index.html loads directly, such as the early listings request,
  // must be the file app.js imports. Under two URLs it would run twice.
  const app = local.find((ref) => /\/app\.[a-f0-9]{12}\.js$/.test(ref)) || '';
  const imports = [
    ...fs
      .readFileSync(path.join(root, app), 'utf8')
      .matchAll(/from '\.\/([^']+)'/g),
  ].map(([, file]) => `site/${file}`);
  const direct = local.filter((ref) => ref.endsWith('.js') && ref !== app);
  assert.ok(direct.length > 0, 'expected a module besides app.js');
  for (const module of direct)
    assert.ok(imports.includes(module), `${module} is not what app.js imports`);
  // A preloaded font must be the file the stylesheet asks for, not a copy.
  for (const [link] of html.matchAll(/<link\b[^>]*>/g))
    if (link.includes('rel="preload"') && link.includes('as="font"')) {
      const href = /href="([^"]+)"/.exec(link)?.[1] || '';
      assert.ok(fonts.includes(href), `${href} is preloaded but never used`);
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
test('stylesheet url() references are versioned, and a changed font changes the stylesheet URL', (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'site/fonts'));
  fs.writeFileSync(path.join(root, 'site/fonts/sans.woff2'), 'old font');
  fs.writeFileSync(path.join(root, 'site/mark.svg'), '<svg/>');
  const css =
    '@font-face { src: url("fonts/sans.woff2") format("woff2"); }\n' +
    ".mark { background: url( 'mark.svg' ), url(data:image/gif;base64,R0lG); }\n" +
    '.a { filter: url(#shadow); background: url(https://example.org/x.png); }\n';
  fs.writeFileSync(path.join(root, 'site/style.css'), css);
  const html =
    '<link rel="preload" href="site/fonts/sans.woff2" as="font" crossorigin><link href="site/style.css" rel="stylesheet">';
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fingerprint(root);
  const [font, style] = references(root);
  const versioned = fs.readFileSync(path.join(root, style), 'utf8');
  // The stylesheet asks for the same file the page preloads.
  assert.match(font, /^site\/fonts\/sans\.[a-f0-9]{12}\.woff2$/);
  assert.ok(versioned.includes(`url("${font.slice('site/'.length)}")`));
  assert.match(versioned, /url\('mark\.[a-f0-9]{12}\.svg'\)/);
  assert.ok(versioned.includes('url(data:image/gif;base64,R0lG)'));
  assert.ok(versioned.includes('url(#shadow)'));
  assert.ok(versioned.includes('url(https://example.org/x.png)'));
  fs.writeFileSync(path.join(root, 'site/fonts/sans.woff2'), 'new font');
  fs.writeFileSync(path.join(root, 'index.html'), html);
  fingerprint(root);
  const [nextFont, nextStyle] = references(root);
  assert.notEqual(nextFont, font);
  assert.notEqual(nextStyle, style);
  assert.equal(fs.readFileSync(path.join(root, font), 'utf8'), 'old font');
});
test('a stylesheet reference that cannot be versioned stops the build', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'site/old.ttf'), 'font');
  fs.writeFileSync(
    path.join(root, 'site/style.css'),
    '@font-face { src: url(old.ttf); }',
  );
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<link href="site/style.css" rel="stylesheet">',
  );
  assert.throws(() => fingerprint(root), /Unversioned stylesheet reference/);
});
test('srcset candidates are versioned with their descriptors, and data URLs are kept whole', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'site/small.webp'), 'small');
  fs.writeFileSync(path.join(root, 'site/large.webp'), 'large');
  const blank = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  fs.writeFileSync(
    path.join(root, 'index.html'),
    `<picture><source media="(max-width: 10px)" srcset="\n  ${blank}\n"><img src="site/large.webp" srcset="\n  site/small.webp  600w,\n  site/large.webp 1536w\n"></picture>`,
  );
  fingerprint(root);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes(`srcset="\n  ${blank}\n"`));
  const candidates = /<img[^>]*srcset="([^"]+)"/.exec(html)?.[1] || '';
  const [small, large] = [
    ...candidates.matchAll(/(site\/\S+?\.webp)\s+(\d+w)/g),
  ].map(([, url, width]) => [url, width]);
  assert.match(small[0], /^site\/small\.[a-f0-9]{12}\.webp$/);
  assert.equal(small[1], '600w');
  assert.match(large[0], /^site\/large\.[a-f0-9]{12}\.webp$/);
  assert.equal(large[1], '1536w');
  // The fallback src and the srcset candidate share one versioned file.
  assert.ok(html.includes(`src="${large[0]}"`));
  assert.equal(fs.readFileSync(path.join(root, small[0]), 'utf8'), 'small');
});
test('srcset parsing finds every candidate URL, with or without descriptors', () => {
  const seen: string[] = [];
  const mark = (url: string) => {
    seen.push(url);
    return `[${url}]`;
  };
  assert.equal(
    srcset(
      'a.webp, b.webp 2x,c.webp 3x , data:image/gif;base64,R0,lG 4x',
      mark,
    ),
    '[a.webp], [b.webp] 2x,[c.webp] 3x , [data:image/gif;base64,R0,lG] 4x',
  );
  assert.deepEqual(seen, [
    'a.webp',
    'b.webp',
    'c.webp',
    'data:image/gif;base64,R0,lG',
  ]);
});
