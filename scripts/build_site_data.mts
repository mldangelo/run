/** Build `data/site.json`, the one file the website loads, so a page load
 *  cannot mix listings from two deploys. Generated at deploy time and by
 *  `npm run generate`; never committed.
 *
 *  It holds only what the site shows. Each source gains its check date,
 *  derived from the page checks in audit research logs (the logs are the only
 *  home for that fact). Research logs and audit review dates, source roles
 *  and registration evidence notes are left out. */
import fs from 'node:fs';
import path from 'node:path';
import { args, cli, load, ROOT } from './lib.mts';
import type {
  Audit,
  Race,
  Registration,
  SiteAudit,
  SiteData,
  SiteSource,
  Source,
} from './types.mts';

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
  return sources.map(({ roles: _roles, ...source }) => ({
    ...source,
    last_checked: dates.get(source.id) ?? null,
  }));
}
function siteAudits(audits: Audit[]): SiteAudit[] {
  return audits.map(
    ({ research_log: _log, review_due: _due, ...audit }) => audit,
  );
}
/* Registration evidence notes say how availability was checked; the race
   dialog shows the organizer's notes instead. */
function siteRaces(races: Race[]): Race[] {
  const withoutEvidence = <T extends { registration?: Registration }>(
    item: T,
  ): T => {
    if (!item.registration) return item;
    const { evidence_notes: _notes, ...registration } = item.registration;
    return { ...item, registration };
  };
  return races.map((race) => ({
    ...withoutEvidence(race),
    distances: race.distances.map(withoutEvidence),
  }));
}
function siteData(root = ROOT): SiteData {
  const audits = load('audits', root);
  return {
    clubs: load('clubs', root),
    events: load('events', root),
    schedules: load('schedules', root),
    sources: siteSources(load('sources', root), audits),
    audits: siteAudits(audits),
    races: siteRaces(load('races', root)),
  };
}
function main(argv?: string[], root = ROOT) {
  const options = args({}, argv);
  if (options.help) {
    console.log(
      'Generate data/site.json, the file the website loads. Usage: node scripts/build_site_data.mts',
    );
    return 0;
  }
  fs.writeFileSync(
    path.join(root, 'data', 'site.json'),
    `${JSON.stringify(siteData(root))}\n`,
  );
  console.log('Wrote data/site.json.');
  return 0;
}

export { main, siteAudits, siteData, siteRaces, siteSources, sourceCheckDates };

if (import.meta.main) cli(main);
