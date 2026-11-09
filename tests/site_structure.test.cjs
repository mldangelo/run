const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'site/app.js'), 'utf8');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

test('every element the script looks up by id exists in index.html', () => {
  const literal = [...app.matchAll(/\$\('#([\w-]+)/g)].map((m) => m[1]);
  // Filter controls and their wrappers are looked up by name: `#${id}-wrap`.
  const defaults = app.match(/const DEFAULTS = \{([\s\S]*?)\};/)[1];
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
    assert.ok(fs.existsSync(path.join(root, ref)), `${ref} does not exist`);
  }
});

test('the Pages workflow publishes every data file the site fetches', () => {
  const workflow = fs.readFileSync(
    path.join(root, '.github/workflows/pages.yml'),
    'utf8',
  );
  const fetched = app
    .match(/\[('[a-z]+'(?:,\s*'[a-z]+')*)\]\.map\(\(name\) =>\s*fetch/)[1]
    .match(/[a-z]+/g);
  const copied = workflow.match(/data\/\{([a-z,]+)\}\.json/)[1].split(',');
  assert.deepEqual([...fetched].sort(), [...copied].sort());
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
