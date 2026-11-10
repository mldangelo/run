/** Build the downloadable club list. It is generated at deploy time from
 *  the canonical JSON and is not committed. */
import fs from 'node:fs';
import path from 'node:path';
import { args, cli, load, ROOT } from './lib.mts';
import type { Audit, Club, Source } from './types.mts';

const FIELDS = [
  'id',
  'name',
  'user_supplied_name',
  'geography',
  'description',
  'source_url',
  'source_authority',
  'research_result',
  'checked_on',
] as const;
/* One row per club. The source, research result and check date come from
   the club's audit and its primary (first referenced) source. */
function buildCsv(clubs: Club[], audits: Audit[], sources: Source[]) {
  const auditByClub = new Map(audits.map((audit) => [audit.club_id, audit]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const quote = (value: unknown) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = [FIELDS.join(',')];
  for (const club of clubs) {
    const audit = auditByClub.get(club.id);
    const primary = sourceById.get(audit?.reference_source_ids[0] ?? '');
    const values: { [field in (typeof FIELDS)[number]]: unknown } = {
      ...club,
      source_url: primary?.url,
      source_authority: primary?.authority,
      research_result: audit?.result,
      checked_on: audit?.checked_on,
    };
    rows.push(FIELDS.map((field) => quote(values[field])).join(','));
  }
  return Buffer.from(`${rows.join('\r\n')}\r\n`);
}
function main(argv?: string[], root = ROOT) {
  const options = args({}, argv);
  if (options.help) {
    console.log(
      'Generate data/clubs.csv. Usage: node scripts/build_clubs_csv.mts',
    );
    return 0;
  }
  fs.writeFileSync(
    path.join(root, 'data/clubs.csv'),
    buildCsv(load('clubs', root), load('audits', root), load('sources', root)),
  );
  console.log('Wrote data/clubs.csv.');
  return 0;
}

export { buildCsv, FIELDS, main };

if (import.meta.main) cli(main);
