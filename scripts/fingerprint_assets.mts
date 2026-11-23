/** Give deployed HTML, its module imports and its stylesheet references
 * content-addressed asset URLs. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cli } from './lib.mts';

const extensions = new Set([
  '.js',
  '.css',
  '.svg',
  '.png',
  '.webp',
  '.ico',
  '.webmanifest',
  '.woff2',
]);
const external = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
export function fingerprint(siteRoot: string) {
  const root = fs.realpathSync(siteRoot);
  const completed = new Map<string, string>();
  const visiting = new Set<string>();
  function asset(reference: string): string {
    const pathname = reference.split(/[?#]/, 1)[0];
    const suffix = reference.slice(pathname.length);
    if (
      external.test(reference) ||
      !extensions.has(path.posix.extname(pathname))
    )
      return reference;
    const cached = completed.get(pathname);
    if (cached) return cached + suffix;
    const file = path.resolve(root, pathname);
    if (
      path.isAbsolute(pathname) ||
      !file.startsWith(`${root}${path.sep}`) ||
      !fs.realpathSync(file).startsWith(`${root}${path.sep}`)
    )
      throw new Error(
        `Asset must stay relative to the deployed site: ${pathname}`,
      );
    if (visiting.has(pathname))
      throw new Error(`Cyclic asset import: ${pathname}`);
    visiting.add(pathname);
    const parsed = path.posix.parse(pathname);
    let content = fs.readFileSync(file);
    // A dependency's versioned URL, relative to the file that refers to it.
    const versionedFrom = (dependency: string) =>
      path.posix.relative(
        parsed.dir,
        asset(path.posix.join(parsed.dir, dependency)),
      );
    if (parsed.ext === '.js') {
      const rewrite = (
        _match: string,
        before: string,
        dependency: string,
        after: string,
      ) => {
        let relative = versionedFrom(dependency);
        if (!relative.startsWith('.')) relative = `./${relative}`;
        return before + relative + after;
      };
      // Static imports and re-exports may span several lines; side-effect and
      // dynamic imports are rewritten too.
      const code = content
        .toString()
        .replace(
          /^(\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"])(\.[^'"]+)(['"])/gm,
          rewrite,
        )
        .replace(/^(\s*import\s*['"])(\.[^'"]+)(['"])/gm, rewrite)
        .replace(/(\bimport\s*\(\s*['"])(\.[^'"]+)(['"]\s*\))/g, rewrite);
      // A relative module left unversioned could mix cached releases.
      for (const [, dependency] of code.matchAll(
        /(?:\bfrom|\bimport)\s*\(?\s*['"](\.[^'"]+)['"]/g,
      ))
        if (!/\.[a-f0-9]{12}\.js$/.test(dependency))
          throw new Error(
            `Unversioned module import ${dependency} in ${pathname}`,
          );
      content = Buffer.from(code);
    }
    if (parsed.ext === '.css') {
      // Fonts and images the stylesheet loads are versioned too, so the
      // stylesheet's own URL changes when they do.
      const css = content
        .toString()
        .replace(
          /\burl\(\s*(['"]?)([^'")\s]+)\1\s*\)/g,
          (match: string, quote: string, reference: string) => {
            if (external.test(reference) || reference.startsWith('#'))
              return match;
            const versioned = versionedFrom(reference);
            if (!/\.[a-f0-9]{12}\.\w+(?:[?#].*)?$/.test(versioned))
              throw new Error(
                `Unversioned stylesheet reference ${reference} in ${pathname}`,
              );
            return `url(${quote}${versioned}${quote})`;
          },
        );
      content = Buffer.from(css);
    }
    const digest = createHash('sha256')
      .update(content)
      .digest('hex')
      .slice(0, 12);
    const versioned = parsed.name.endsWith(`.${digest}`)
      ? pathname
      : path.posix.join(parsed.dir, `${parsed.name}.${digest}${parsed.ext}`);
    fs.writeFileSync(path.join(root, versioned), content);
    completed.set(pathname, versioned);
    visiting.delete(pathname);
    return versioned + suffix;
  }
  const index = path.join(root, 'index.html');
  const html = fs
    .readFileSync(index, 'utf8')
    .replace(/\b(?:src|href)="([^"]+)"/g, (match: string, reference: string) =>
      match.replace(reference, asset(reference)),
    )
    .replace(
      /\bsrcset="([^"]+)"/g,
      (_match: string, candidates: string) =>
        `srcset="${srcset(candidates, asset)}"`,
    );
  fs.writeFileSync(index, html);
}
/* Rewrite each image candidate's URL and keep its descriptor. As in the HTML
   srcset parser, a URL runs to the next whitespace (so data: URLs keep their
   commas) and trailing commas separate candidates. */
export function srcset(value: string, rewrite: (url: string) => string) {
  return value.replace(
    /(?<=^|,)(\s*)([^\s,][^\s]*?)(,*)(?=\s|$)/g,
    (_match: string, space: string, url: string, commas: string) =>
      space + rewrite(url) + commas,
  );
}
function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1)
    throw new Error('Usage: node scripts/fingerprint_assets.mts SITE_ROOT');
  fingerprint(argv[0]);
  return 0;
}
if (import.meta.main) cli(main);
