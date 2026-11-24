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

test('the listings request starts before app.js runs, from the module app.js imports', () => {
  // An async module runs as soon as it arrives, while app.js waits for every
  // module it imports. Both name one URL, so the module and its request run
  // once.
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(
    head,
    /<script type="module" src="site\/request\.js" async><\/script>/,
  );
  assert.match(
    fs.readFileSync(path.join(root, 'site/app.js'), 'utf8'),
    /from '\.\/request\.js'/,
  );
  // A preload link would let the browser reuse a cached copy unchecked.
  assert.doesNotMatch(html, /rel="preload"[^>]*data\//);
  assert.match(
    fs.readFileSync(path.join(root, 'site/request.ts'), 'utf8'),
    /fetch\('data\/site\.json', \{\s*cache: 'no-cache',/,
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

test('the site loads one generated data file and the map drawing, both on Pages', () => {
  const fetched = [
    ...browserCode.matchAll(/\bfetch\(\s*['"`]([^'"`]+)['"`]/g),
  ].map((match) => match[1]);
  assert.deepEqual(fetched.sort(), ['data/site.json', 'site/sf-map.svg']);
  // The map drawing is committed artwork; Pages copies it with site/.
  assert.ok(fs.existsSync(path.join(root, 'site/sf-map.svg')));
  assert.match(workflow, /cp -R site _site\//);
  const generator = fs.readFileSync(
    path.join(root, 'scripts/build_site_data.mts'),
    'utf8',
  );
  assert.match(generator, /'site\.json'/);
  assert.match(packageJson.scripts.generate, /npm run site-data/);
  assert.match(
    fs.readFileSync(path.join(root, '.gitignore'), 'utf8'),
    /^data\/site\.json$/m,
    'the generated file is never committed',
  );
  // Pages generates it before copying every data file.
  assert.match(
    workflow,
    /npm run generate\n[\s\S]*cp data\/\*\.json data\/clubs\.csv _site\/data\//,
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

test('fonts are served with the site under their licenses, and the policy allows nothing else', () => {
  const csp = html.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
  )[1];
  const directives = Object.fromEntries(
    csp.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values.join(' ')];
    }),
  );
  assert.equal(directives['style-src'], "'self'");
  assert.equal(directives['font-src'], "'self'");
  assert.doesNotMatch(csp, /https?:/, 'no third-party origins');
  const css = fs.readFileSync(path.join(root, 'site/style.css'), 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(faces.length > 0, 'expected @font-face rules');
  const families = new Set();
  for (const face of faces) {
    families.add(face.match(/font-family:\s*"([^"]+)"/)[1]);
    assert.match(face, /font-display:\s*swap/);
    const url = face.match(/url\("([^"]+)"\)/)[1];
    assert.ok(!/^[a-z]+:|^\//i.test(url), `${url} must be relative`);
    assert.ok(fs.existsSync(path.join(root, 'site', url)), `${url} is missing`);
  }
  for (const family of families)
    assert.ok(
      fs.existsSync(
        path.join(root, 'site/fonts', `${family.replace(/\s+/g, '')}-OFL.txt`),
      ),
      `${family} needs its license next to the font files`,
    );
});

test('screens that hide the introduction illustration are the ones that skip downloading it', () => {
  const media = html.match(
    /<picture class="intro-art">\s*(?:<!--[\s\S]*?-->\s*)?<source\s+media="([^"]+)"\s+srcset="\s*data:/,
  )?.[1];
  assert.ok(media, 'expected an empty-image source for small screens');
  const css = fs.readFileSync(path.join(root, 'site/style.css'), 'utf8');
  const hidden = [...css.matchAll(/@media ([^{]+) \{([\s\S]*?)\n\}/g)].filter(
    ([, , block]) => /\.intro-art \{\s*display: none;/.test(block),
  );
  assert.deepEqual(
    hidden.map(([, query]) => query),
    [media],
  );
});
