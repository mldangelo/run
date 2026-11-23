/** Build the research files the website loads. Generated at deploy time and
 *  by `npm run generate`; never committed.
 *
 *  - `data/site-sources.json`: each source with its check date, derived from
 *    the page checks in audit research logs (the logs are the only home for
 *    that fact).
 *  - `data/site-audits.json`: each audit without its research log, which the
 *    site does not show and which grows with every research pass. */
import fs from 'node:fs';
import path from 'node:path';
import { args, cli, load, ROOT } from './lib.mts';
import type { Audit, SiteAudit, SiteSource, Source } from './types.mts';

/* The latest date each source's page was inspected: a `page` check's
   `observed_on`, or else the research log entry's date. */
function sourceCheckDates(audits: Audit[]) {
  const dates = new Map<string, string>();
  for (const audit of audits)
    for (const entry of audit.research_log ?? [])
      for (const check of entry.source_checks) {
        if (check.method !== 'page') continue;
        const date = check.observed_on ?? entry.checked_on;
        const previous = dates.get(check.source_id);
        if (!previous || date > previous) dates.set(check.source_id, date);
      }
  return dates;
}
function siteSources(sources: Source[], audits: Audit[]): SiteSource[] {
  const dates = sourceCheckDates(audits);
  return sources.map((source) => ({
    ...source,
    last_checked: dates.get(source.id) ?? null,
  }));
}
function siteAudits(audits: Audit[]): SiteAudit[] {
  return audits.map(({ research_log: _log, ...audit }) => audit);
}
function main(argv?: string[], root = ROOT) {
  const options = args({}, argv);
  if (options.help) {
    console.log(
      'Generate data/site-sources.json and data/site-audits.json. Usage: node scripts/build_site_data.mts',
    );
    return 0;
  }
  const audits = load('audits', root);
  const write = (name: string, value: unknown) =>
    fs.writeFileSync(
      path.join(root, 'data', name),
      `${JSON.stringify(value)}\n`,
    );
  write('site-sources.json', siteSources(load('sources', root), audits));
  write('site-audits.json', siteAudits(audits));
  console.log('Wrote data/site-sources.json and data/site-audits.json.');
  return 0;
}

export { main, siteAudits, siteSources, sourceCheckDates };

if (import.meta.main) cli(main);
