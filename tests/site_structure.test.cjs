const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// Every browser module generated from site/*.ts, since app.js imports the
// rest and element lookups can live in any of them.
const modules = fs
  .readdirSync(path.join(root, 'site'))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => file.replace(/\.ts$/, '.js'));
const browserCode = modules
  .map((file) => fs.readFileSync(path.join(root, 'site', file), 'utf8'))
  .join('\n');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/pages.yml'),
  'utf8',
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
// Built from data/*.json during deployment and never committed.
const GENERATED = new Set(['feed.xml', 'data/clubs.csv']);

test('index.html loads app.js, which reaches every other module', () => {
  assert.match(html, /<script type="module" src="site\/app\.js"><\/script>/);
  const imported = new Set(['app.js']);
  for (const file of imported)
    for (const [, dependency] of fs
      .readFileSync(path.join(root, 'site', file), 'utf8')
      .matchAll(/\bfrom '\.\/([\w-]+\.js)'/g))
      imported.add(dependency);
  assert.deepEqual(
    [...imported].sort(),
    [...modules].sort(),
    'every generated module should be loaded',
  );
});

test('every element the script looks up by id exists in index.html', () => {
  const literal = [...browserCode.matchAll(/\$\('#([\w-]+)/g)].map((m) => m[1]);
  assert.ok(literal.length > 20, literal.join(', '));
  // Filter controls and their wrappers are looked up by name: `#${id}-wrap`.
  const defaults = browserCode.match(/const DEFAULTS = \{([\s\S]*?)\};/)[1];
  const controls = [...defaults.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  const wrappers = controls
    .filter((id) => id !== 'search')
    .map((id) => `${id}-wrap`);
  for (const id of [...literal, ...controls, ...wrappers])
    assert.ok(ids.has(id), `index.html is missing #${id}`);
});

test('local assets referenced by index.html exist and stay relative', () => {
  const refs = [...html.matchAll(/\s(?:href|src)="([^"#?]+)"/g)]
    .map((m) => m[1])
    .filter((ref) => !/^[a-z]+:/i.test(ref));
  assert.ok(refs.length > 0);
  for (const ref of refs) {
    // GitHub Pages serves the site from /run/, so root-relative paths break.
    assert.ok(!ref.startsWith('/'), `${ref} must be relative`);
    if (GENERATED.has(ref))
      assert.ok(workflow.includes(ref), `${ref} must be built for Pages`);
    else
      assert.ok(fs.existsSync(path.join(root, ref)), `${ref} does not exist`);
  }
});

test('the Pages workflow builds the exports and publishes every data file', () => {
  const fetched = [
    ...browserCode
      .match(/\[([^\]]*)\]\.map\(\s*\(name\) =>\s*fetch/)[1]
      .matchAll(/'([a-z-]+)'/g),
  ].map((match) => match[1]);
  assert.ok(fetched.length >= 6, fetched.join(', '));
  assert.match(workflow, /npm run generate/);
  assert.match(workflow, /cp data\/\*\.json data\/clubs\.csv _site\/data\//);
  const generator = fs.readFileSync(
    path.join(root, 'scripts/build_site_data.mts'),
    'utf8',
  );
  assert.match(packageJson.scripts.generate, /npm run site-data/);
  // Site files are generated before publishing; the rest are committed.
  for (const name of fetched)
    if (name.startsWith('site-'))
      assert.ok(
        generator.includes(`'${name}.json'`),
        `data/${name}.json is fetched but never generated`,
      );
    else
      assert.ok(
        fs.existsSync(path.join(root, 'data', `${name}.json`)),
        `data/${name}.json is fetched but missing`,
      );
});

test('absolute site URLs in metadata point at files that are published', () => {
  const base = 'https://mldangelo.github.io/run/';
  const urls = [
    ...html.matchAll(
      /content="(https:\/\/mldangelo\.github\.io\/run\/[^"]*)"/g,
    ),
  ].map((m) => m[1]);
  assert.ok(
    urls.some((url) => url.endsWith('.png')),
    'expected a preview image',
  );
  for (const url of urls) {
    const file = url.slice(base.length) || 'index.html';
    assert.ok(
      fs.existsSync(path.join(root, file)),
      `${url} has no file at ${file}`,
    );
  }
});
