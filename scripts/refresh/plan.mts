import { addDays } from '../lib.mts';
import {
  coverageGaps,
  dueClubs,
  eventQueue,
  racesDue,
} from '../review_status.mts';
import type { Snapshot } from '../types.mts';
import { canonicalUrl } from './evidence.mts';

export type Research = Pick<
  Snapshot,
  'clubs' | 'audits' | 'sources' | 'events' | 'schedules' | 'races'
>;
export interface Target {
  url: string;
  source_ids: string[];
  club_ids: string[];
  record_ids: string[];
  reasons: string[];
  access: string[];
  discovered_from?: string;
}
export function plan(
  data: Research,
  today: string,
  within: number,
  all = false,
): Target[] {
  const targets = new Map<string, Target>();
  const sourceById = new Map(data.sources.map((source) => [source.id, source]));
  const add = (
    value: string,
    reason: string,
    sourceId?: string,
    clubId?: string,
    recordId?: string,
  ) => {
    const url = canonicalUrl(value);
    const target = targets.get(url) || {
      url,
      source_ids: [],
      club_ids: [],
      record_ids: [],
      reasons: [],
      access: [],
    };
    for (const [field, value] of [
      ['source_ids', sourceId],
      ['club_ids', clubId],
      ['record_ids', recordId],
      ['reasons', reason],
      ['access', sourceId ? sourceById.get(sourceId)?.access : undefined],
    ] as const)
      if (value && !target[field].includes(value)) target[field].push(value);
    targets.set(url, target);
  };
  const source = (
    id: string,
    reason: string,
    clubId?: string,
    recordId?: string,
  ) => {
    const found = sourceById.get(id);
    if (found) add(found.url, reason, id, clubId, recordId);
  };
  for (const item of dueClubs(
    data.clubs,
    data.audits,
    data.schedules,
    today,
    addDays(today, within),
  ))
    for (const id of item.source_ids) source(id, 'club review due', item.id);
  for (const { event } of eventQueue(data.events, today))
    for (const id of [event.source_id, ...(event.additional_source_ids || [])])
      source(id, 'event review due', event.club_id, event.id);
  for (const { club, sources } of coverageGaps(
    data.clubs,
    data.events,
    data.audits,
    data.sources,
    today,
  ))
    for (const item of sources)
      source(item.id, 'no published upcoming run', club.id);
  const races = all
    ? data.races
    : racesDue(data.races, today).map((item) => item.race);
  for (const race of races) {
    const urls = [race.source_url, ...race.additional_sources];
    for (const registration of [
      race.registration,
      ...race.distances.map((d) => d.registration),
    ])
      if (registration)
        urls.push(
          registration.source_url,
          registration.url || registration.source_url,
        );
    for (const url of urls)
      for (const clubId of race.club_ids?.length ? race.club_ids : [undefined])
        add(
          url,
          all ? 'all race sources' : 'race review due',
          undefined,
          clubId,
          race.id,
        );
  }
  if (all) for (const item of data.sources) source(item.id, 'all club sources');
  // Attach existing records by exact source URL only, never fuzzy title matching.
  for (const item of data.sources) {
    const target = targets.get(canonicalUrl(item.url));
    if (!target) continue;
    source(item.id, 'recorded source');
    for (const audit of data.audits)
      if (audit.reference_source_ids.includes(item.id))
        source(item.id, 'recorded source', audit.club_id);
    for (const run of [...data.events, ...data.schedules])
      if (
        run.source_id === item.id ||
        ('additional_source_ids' in run &&
          run.additional_source_ids?.includes(item.id))
      )
        source(item.id, 'recorded source', run.club_id, run.id);
  }
  const linkedRuns = new Set(
    [...targets.values()].flatMap((target) => target.record_ids),
  );
  for (const run of [...data.events, ...data.schedules])
    if (all || linkedRuns.has(run.id))
      for (const url of run.run_details?.sources || [])
        add(
          url,
          'separate run-details evidence',
          undefined,
          run.club_id,
          run.id,
        );
  return [...targets.values()].sort((a, b) => a.url.localeCompare(b.url));
}
