import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  args,
  load,
  localMinute,
  nonnegative,
  ROOT,
  SF,
  validDate,
} from './lib.mts';
import { canonicalUrl, hash } from './refresh/evidence.mts';
import { openaiParser } from './refresh/parser.mts';
import { plan, type Research, type Target } from './refresh/plan.mts';
import { run } from './refresh/run.mts';

export async function main(argv?: string[], root = ROOT) {
  const options = args(
    {
      'as-of': { type: 'string' },
      within: { type: 'string', default: '7' },
      all: { type: 'boolean' },
      url: { type: 'string', multiple: true },
      cache: { type: 'string' },
      offline: { type: 'boolean' },
      limit: { type: 'string', default: '20' },
      discover: { type: 'string', default: '3' },
      'max-parses': { type: 'string', default: '5' },
      model: { type: 'string' },
    },
    argv,
  );
  if (options.help) {
    console.log(`Dry-run public source updater; never edits data or publishes changes.
Usage: npm run refresh:sources -- [--as-of YYYY-MM-DD] [--within 7] [--all | --url URL ...]
  --limit 20        Maximum source pages, including one-hop discoveries
  --discover 3      Same-origin event links per seed (0 disables discovery)
  --model MODEL    Enable OpenAI parsing; requires OPENAI_API_KEY for cache misses
  --max-parses 5    Maximum model calls; 0 fetches evidence only
  --offline        No source or model network calls; use existing cached evidence
  --cache PATH     Default: .cache/source-refresh (ignored, never published)
Without --model, fetch and cache evidence for later parsing. Reports go in CACHE/runs/.
Model, prompt/schema or extractor changes invalidate parsing results. No API keys are saved.`);
    return 0;
  }
  const today = options['as-of'] || localMinute(new Date(), SF).slice(0, 10);
  if (!validDate(today)) throw new Error('--as-of must be YYYY-MM-DD');
  const within = nonnegative(options.within, '--within');
  const limit = nonnegative(options.limit, '--limit');
  const discover = nonnegative(options.discover, '--discover');
  const maxParses = nonnegative(options['max-parses'], '--max-parses');
  if (options.all && options.url?.length)
    throw new Error('Choose --all or --url');
  const data: Research = {
    clubs: load('clubs', root),
    audits: load('audits', root),
    sources: load('sources', root),
    events: load('events', root),
    schedules: load('schedules', root),
    races: load('races', root),
  };
  const inventory = plan(
    data,
    today,
    within,
    Boolean(options.all || options.url?.length),
  );
  const targets: Target[] = options.url?.length
    ? [...new Set(options.url.map((url) => canonicalUrl(url)))].map(
        (url) =>
          inventory.find((target) => target.url === url) || {
            url,
            source_ids: [],
            club_ids: [],
            record_ids: [],
            access: [],
            reasons: ['explicit URL; identity unverified'],
          },
      )
    : inventory;
  const cache = path.resolve(
    options.cache || path.join(root, '.cache/source-refresh'),
  );
  // Prevent a typo from putting snapshots in canonical data or a Pages asset tree.
  const relative = path.relative(root, cache);
  if (
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '.cache/source-refresh' &&
    !relative.startsWith(`.cache/source-refresh${path.sep}`)
  )
    throw new Error(
      'Inside the checkout, cache must be under .cache/source-refresh',
    );
  fs.mkdirSync(cache, { recursive: true });
  if (fs.realpathSync(cache) !== cache)
    throw new Error('Use a real cache path, not a symlink');
  let revision = 'unknown';
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    /* A source archive has no Git revision. */
  }
  const key = process.env.OPENAI_API_KEY;
  if (options.model && !key && !options.offline && maxParses > 0)
    console.error(
      'OPENAI_API_KEY is unset; cached parses are reused and new evidence will be pending.',
    );
  const { report, reportFile } = await run({
    cache,
    targets,
    asOf: today,
    baseRevision: revision,
    dataHash: hash(JSON.stringify(data)),
    limit,
    discover,
    maxParses,
    offline: options.offline,
    model: options.model,
    parser: options.model && key ? openaiParser(options.model, key) : undefined,
    onProgress: (message) => console.error(message),
  });
  console.log(
    JSON.stringify({ ...report.summary, report: reportFile }, null, 2),
  );
  return report.rows.some(
    (row) => row.fetch === 'failed' || row.parse === 'failed',
  )
    ? 2
    : 0;
}
if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
