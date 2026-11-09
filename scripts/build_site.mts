/** Generate browser JavaScript; Node runs the other TypeScript directly. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const compiler = path.join(
  path.dirname(require.resolve('typescript/package.json')),
  'bin/tsc',
);
const biome = require.resolve('@biomejs/biome/bin/biome');
export function buildSite(root = ROOT) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'run-site-'));
  try {
    const compiled = spawnSync(
      process.execPath,
      [
        compiler,
        '--project',
        path.join(root, 'tsconfig.json'),
        '--noEmit',
        'false',
        '--rewriteRelativeImportExtensions',
        '--noCheck',
        '--rootDir',
        root,
        '--outDir',
        temporary,
      ],
      { encoding: 'utf8', cwd: root },
    );
    if (compiled.status !== 0)
      throw new Error(
        compiled.stdout ||
          compiled.stderr ||
          'Could not emit browser JavaScript',
      );
    for (const name of ['model', 'theme', 'app']) {
      const emitted = fs.readFileSync(
        path.join(temporary, 'site', `${name}.js`),
        'utf8',
      );
      const formatted = spawnSync(
        process.execPath,
        [biome, 'check', '--write', '--stdin-file-path', `site/${name}.js`],
        { input: emitted, encoding: 'utf8', cwd: ROOT },
      );
      if (formatted.status !== 0)
        throw new Error(
          formatted.stderr || 'Could not format browser JavaScript',
        );
      const output = `// Generated from ${name}.ts; run npm run generate after editing.\n${formatted.stdout}`;
      const file = path.join(root, 'site', `${name}.js`);
      fs.writeFileSync(file, output);
    }
    return 0;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (import.meta.main) {
  try {
    process.exitCode = buildSite();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
