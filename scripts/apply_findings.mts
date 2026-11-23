/** Apply reviewed research findings to the canonical JSON.
 *
 *  Findings are written by a researcher (or research agent) in the format
 *  described in research/findings.md. This tool turns them into source,
 *  audit, run, pattern, club and race updates, then validates the whole
 *  snapshot. Nothing is written unless validation passes and the findings
 *  raise no warnings (or --allow-warnings is given). It never contacts
 *  sources. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  addDays,
  args,
  cli,
  duplicateKeys,
  fieldPath,
  localMinute,
  ROOT,
  SF,
} from './lib.mts';
import type {
  Audit,
  Club,
  DatedEvent,
  Race,
  Registration,
  ResearchLogEntry,
  Schedule,
  Snapshot,
  Source,
} from './types.mts';
import { DATASETS, loadData, validate } from './validate.mts';

type Check = ResearchLogEntry['source_checks'][number];

type Fields = { [key: string]: unknown };
interface Change {
  set?: Fields;
  unset?: string[];
  /** true: reread today; a date: the record's own source was read then. */
  verified?: boolean | string;
  why?: string;
}
interface EventChange extends Change {
  id?: string;
  new?: Fields & { source_url: string; additional_source_urls?: string[] };
  add_source_urls?: string[];
}
interface ScheduleChange extends Change {
  id: string;
  /** Move the pattern to this source, already recorded or in new_sources. */
  source_url?: string;
}
interface ClubFinding {
  club_id: string;
  summary: string;
  next_steps: string;
  review_due: string;
  result?: Audit['result'];
  audit_notes?: string;
  club_description?: string;
  source_checks?: (Omit<Check, 'source_id'> & {
    url: string;
    access?: Source['access'];
  })[];
  new_sources?: Omit<Source, 'id'>[];
  events?: EventChange[];
  schedules?: ScheduleChange[];
  new_schedules?: (Fields & { source_url: string })[];
}
interface RaceFinding extends Change {
  race_id?: string;
  new?: Race;
  registration?: Registration;
}
export interface Findings {
  clubs?: ClubFinding[];
  races?: RaceFinding[];
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
/* Fields the tool itself maintains, so findings cannot set them. */
const MANAGED = new Set(['id', 'club_id', 'source_id', 'checked_on']);
/* Identifiers a new run or pattern takes from the finding, never its payload;
   cite sources by URL instead. */
const NEW_RECORD_MANAGED = [
  'id',
  'club_id',
  'source_id',
  'additional_source_ids',
];
/* Read a findings file, rejecting repeated keys that JSON.parse would drop. */
export function parseFindings(text: string, label: string): Findings {
  const data = JSON.parse(text) as Findings;
  const repeated = duplicateKeys(text);
  if (repeated.length)
    throw new Error(
      `${label}: repeated keys would silently drop findings: ${repeated.map(fieldPath).join(', ')}`,
    );
  return data;
}
/* Removing the field and setting it false both clear a review flag. */
const clearsFlag = (before: unknown, change: Change) =>
  before === true &&
  (change.unset?.includes('needs_review') ||
    change.set?.needs_review === false);

/* Apply findings to a snapshot in place. Returns what changed and any
   warnings a reviewer should resolve before writing. */
export function applyFindings(
  data: Snapshot,
  findings: Findings[],
  today: string,
  windowDays = 21,
) {
  const log: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const sourceByUrl = new Map(
    data.sources.map((source) => [source.url, source]),
  );
  const clubById = new Map(data.clubs.map((club) => [club.id, club]));
  const lastDay = addDays(today, windowDays);

  const fields = (record: Fields, change: Change, label: string) => {
    for (const [key, value] of Object.entries(change.set ?? {}))
      if (MANAGED.has(key)) errors.push(`${label}: ${key} is set by this tool`);
      else record[key] = value;
    for (const key of change.unset ?? []) delete record[key];
  };
  const checkedOn = (change: Change) =>
    change.verified === true
      ? today
      : typeof change.verified === 'string'
        ? change.verified
        : null;

  for (const finding of findings.flatMap((file) => file.clubs ?? [])) {
    const club = finding.club_id;
    const audit = data.audits.find((item) => item.club_id === club);
    if (!audit || !clubById.has(club)) {
      errors.push(`unknown club ${club}`);
      continue;
    }
    const fresh = new Map(
      (finding.new_sources ?? []).map((source) => [source.url, source]),
    );
    const sourceFor = (url: string) => {
      const known = sourceByUrl.get(url);
      if (known) return known;
      const added = fresh.get(url);
      if (!added) {
        errors.push(`${club}: ${url} is neither recorded nor in new_sources`);
        return null;
      }
      const source: Source = { id: `src-${hash(url).slice(0, 12)}`, ...added };
      data.sources.push(source);
      sourceByUrl.set(url, source);
      log.push(`+ source ${source.id} ${url}`);
      return source;
    };
    const reference = (source: Source) => {
      if (!audit.reference_source_ids.includes(source.id))
        audit.reference_source_ids.push(source.id);
    };
    for (const url of fresh.keys()) {
      if (sourceByUrl.has(url))
        warnings.push(`${club}: new source ${url} is already recorded`);
      const source = sourceFor(url);
      if (source) reference(source);
    }

    const checks: Check[] = [];
    for (const { url, access, ...check } of finding.source_checks ?? []) {
      const source = sourceFor(url);
      if (!source) continue;
      if (access) source.access = access;
      reference(source);
      checks.push({ source_id: source.id, ...check });
    }
    audit.research_log ??= [];
    audit.research_log.push({
      checked_on: today,
      summary: finding.summary,
      next_steps: finding.next_steps,
      source_checks: checks,
    });
    audit.checked_on = today;
    audit.review_due = finding.review_due;
    if (finding.result) audit.result = finding.result;
    if (finding.audit_notes) audit.notes = finding.audit_notes;
    if (finding.club_description) {
      (clubById.get(club) as Club).description = finding.club_description;
      log.push(`~ club ${club} description`);
    }
    log.push(`~ audit ${club} (${checks.length} source checks)`);

    for (const change of finding.events ?? []) {
      if (change.new) {
        const { source_url, additional_source_urls = [], ...rest } = change.new;
        const start = String(rest.starts_at_local);
        const managed = NEW_RECORD_MANAGED.filter((key) => key in rest);
        if (managed.length) {
          errors.push(
            `${club}: new run ${start} sets ${managed.join(', ')}, which this tool assigns`,
          );
          continue;
        }
        const source = sourceFor(source_url);
        if (!source) continue;
        const extra = additional_source_urls
          .map(sourceFor)
          .filter((item): item is Source => Boolean(item));
        for (const item of [source, ...extra]) reference(item);
        const id = `evt-${hash(`${club}|${source_url}|${start}`).slice(0, 12)}`;
        if (data.events.some((event) => event.id === id)) {
          errors.push(`${club}: run ${id} already exists`);
          continue;
        }
        const sameDay = data.events.find(
          (event) =>
            event.club_id === club &&
            event.starts_at_local.slice(0, 10) === start.slice(0, 10),
        );
        if (sameDay)
          warnings.push(
            `${club}: new run on ${start.slice(0, 10)} shares a day with ${sameDay.id} (${sameDay.title}); check it is not a duplicate`,
          );
        if (start.slice(0, 10) < today || start.slice(0, 10) > lastDay)
          warnings.push(
            `${club}: new run ${start} is outside ${today}..${lastDay}`,
          );
        const event = {
          id,
          club_id: club,
          ...rest,
          timezone: (rest.timezone as string | undefined) ?? SF,
          source_id: source.id,
          checked_on: (rest.checked_on as string | undefined) ?? today,
          ...(extra.length
            ? { additional_source_ids: extra.map((item) => item.id) }
            : {}),
        } as unknown as DatedEvent;
        data.events.push(event);
        log.push(
          `+ run ${id} ${club} ${start} ${event.title} [${event.status}]`,
        );
        continue;
      }
      const event = data.events.find((item) => item.id === change.id);
      if (!event || event.club_id !== club) {
        errors.push(`${club}: unknown run ${change.id}`);
        continue;
      }
      if (clearsFlag(event.needs_review, change) && !change.why)
        warnings.push(`${club}: ${event.id} clears needs_review without a why`);
      fields(event as unknown as Fields, change, event.id);
      for (const url of change.add_source_urls ?? []) {
        const source = sourceFor(url);
        if (!source || source.id === event.source_id) continue;
        reference(source);
        event.additional_source_ids ??= [];
        if (!event.additional_source_ids.includes(source.id))
          event.additional_source_ids.push(source.id);
      }
      const date = checkedOn(change);
      if (date) event.checked_on = date;
      log.push(
        `~ run ${event.id} ${event.starts_at_local} ${event.title}${date ? ` (checked ${date})` : ''}`,
      );
    }

    for (const fresh of finding.new_schedules ?? []) {
      const { source_url, ...rest } = fresh;
      const managed = NEW_RECORD_MANAGED.filter((key) => key in rest);
      if (managed.length) {
        errors.push(
          `${club}: new pattern ${String(rest.label)} sets ${managed.join(', ')}, which this tool assigns`,
        );
        continue;
      }
      const source = sourceFor(source_url);
      if (!source) continue;
      reference(source);
      const days = (rest.days as string[] | undefined) ?? [];
      const id = `sch-${hash(`${club}|${source_url}|${rest.label}|${days.join(',')}`).slice(0, 10)}`;
      if (data.schedules.some((schedule) => schedule.id === id)) {
        errors.push(`${club}: pattern ${id} already exists`);
        continue;
      }
      const schedule = {
        id,
        club_id: club,
        ...rest,
        timezone: (rest.timezone as string | undefined) ?? SF,
        source_id: source.id,
        checked_on: (rest.checked_on as string | undefined) ?? today,
        valid_from: rest.valid_from ?? null,
        valid_until: rest.valid_until ?? null,
        notes: rest.notes ?? '',
      } as unknown as Schedule;
      data.schedules.push(schedule);
      log.push(`+ pattern ${id} ${club} ${schedule.label}`);
    }
    for (const change of finding.schedules ?? []) {
      const schedule = data.schedules.find((item) => item.id === change.id);
      if (!schedule || schedule.club_id !== club) {
        errors.push(`${club}: unknown pattern ${change.id}`);
        continue;
      }
      fields(schedule as unknown as Fields, change, schedule.id);
      if (change.source_url) {
        const source = sourceFor(change.source_url);
        if (source) {
          schedule.source_id = source.id;
          reference(source);
        }
      }
      const date = checkedOn(change);
      if (date) schedule.checked_on = date;
      log.push(
        `~ pattern ${schedule.id} ${schedule.label}${date ? ` (checked ${date})` : ''}`,
      );
    }
  }

  for (const change of findings.flatMap((file) => file.races ?? [])) {
    if (change.new) {
      if (data.races.some((race) => race.id === change.new?.id)) {
        errors.push(`race ${change.new.id} already exists`);
        continue;
      }
      const race = {
        ...change.new,
        checked_on: change.new.checked_on ?? today,
      };
      // Keep races in date order, as the file is maintained.
      const at = data.races.findIndex((item) => item.date > race.date);
      data.races.splice(at < 0 ? data.races.length : at, 0, race);
      log.push(`+ race ${race.id} ${race.date}`);
      continue;
    }
    const race = data.races.find((item) => item.id === change.race_id);
    if (!race) {
      errors.push(`unknown race ${change.race_id}`);
      continue;
    }
    if (clearsFlag(race.needs_review, change) && !change.why)
      warnings.push(`${race.id}: clears needs_review without a why`);
    fields(race as unknown as Fields, change, race.id);
    if (change.registration) race.registration = change.registration;
    const date = checkedOn(change);
    if (date) race.checked_on = date;
    log.push(`~ race ${race.id}${date ? ` (checked ${date})` : ''}`);
  }
  return { log, warnings, errors };
}

function main(argv?: string[], root = ROOT) {
  const options = args(
    {
      findings: { type: 'string', multiple: true },
      date: { type: 'string' },
      window: { type: 'string', default: '21' },
      write: { type: 'boolean', default: false },
      'allow-warnings': { type: 'boolean', default: false },
    },
    argv,
  );
  const files = options.findings ?? [];
  if (options.help || !files.length) {
    console.log(`Apply reviewed research findings (format: research/findings.md).
Usage: npm run apply-findings -- --findings FILE.json [--findings ...] [--date YYYY-MM-DD] [--window 21] [--write] [--allow-warnings]
Without --write, prints what would change. Writes only when the whole snapshot still validates and no warnings remain.`);
    return options.help ? 0 : 1;
  }
  // The research date in San Francisco unless given.
  const today = options.date ?? localMinute(new Date(), SF).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today))
    throw new Error('--date must be YYYY-MM-DD');
  const data = loadData(root) as unknown as Snapshot;
  const findings = files.map((file) =>
    parseFindings(fs.readFileSync(file, 'utf8'), file),
  );
  const { log, warnings, errors } = applyFindings(
    data,
    findings,
    today,
    Number(options.window),
  );
  errors.push(...validate(data));
  console.log(log.join('\n'));
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  for (const error of errors) console.error(`error: ${error}`);
  if (errors.length || (warnings.length && !options['allow-warnings'])) {
    console.error(
      `Not written: ${errors.length} error(s), ${warnings.length} warning(s).`,
    );
    return 1;
  }
  if (!options.write) {
    console.log('Dry run: nothing written. Add --write to apply.');
    return 0;
  }
  for (const name of DATASETS)
    fs.writeFileSync(
      path.join(root, 'data', `${name}.json`),
      `${JSON.stringify(data[name as keyof Snapshot], null, 2)}\n`,
    );
  console.log(`Wrote ${DATASETS.length} data files for ${today}.`);
  return 0;
}

export { main };

if (import.meta.main) cli(main);
