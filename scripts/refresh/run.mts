import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  type Evidence,
  EXTRACTOR_VERSION,
  eventLinks,
  extract,
  hash,
} from './evidence.mts';
import { type FetchPage, fetchPage } from './http.mts';
import type { Target } from './plan.mts';

interface Snapshot {
  url: string;
  fetched_at: string;
  content_hash: string;
  body_hash: string;
  etag?: string;
  modified?: string;
  evidence: Evidence;
}
interface Entry {
  attempted_at: string;
  snapshot?: string;
}
export interface Options {
  cache: string;
  targets: Target[];
  asOf: string;
  baseRevision: string;
  dataHash: string;
  limit: number;
  discover: number;
  offline?: boolean;
  fetch?: FetchPage;
  now?: () => Date;
  onProgress?: (message: string) => void;
}
export interface Row {
  target: Target;
  fetch:
    | 'new'
    | 'changed'
    | 'unchanged'
    | 'not_modified'
    | 'offline'
    | 'skipped'
    | 'failed';
  observed_at?: string;
  evidence_file?: string;
  previous_evidence_file?: string;
  error?: string;
  content_hash?: string;
  final_url?: string;
  discovery_omitted?: number;
}
function read<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new Error(
      `Unreadable cache file: ${path.basename(file)}; move it aside and retry`,
    );
  }
}
function write(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.renameSync(temporary, file);
}
export async function run(options: Options) {
  fs.mkdirSync(options.cache, { recursive: true });
  const lock = path.join(options.cache, 'run.lock');
  try {
    fs.mkdirSync(lock);
  } catch {
    throw new Error(
      'Cache is locked by another run; remove run.lock only after that process exits',
    );
  }
  const now = () => (options.now?.() || new Date()).toISOString();
  const started = now();
  const rows: Row[] = [];
  let requests = 0;
  const file = (relative: string) => path.join(options.cache, relative);
  const entryFile = (url: string) => file(`urls/${hash(url)}.json`);
  const byAttempt = (left: string, right: string) =>
    (read<Entry>(entryFile(left))?.attempted_at || '').localeCompare(
      read<Entry>(entryFile(right))?.attempted_at || '',
    ) || left.localeCompare(right);
  // Public and unknown pages first, then pages whose event details need a
  // login (their public part is still fetched, signed out), then restricted
  // pages, which are not fetched.
  const rank = (target: Target) =>
    target.access.includes('restricted')
      ? 2
      : target.access.includes('login_for_events')
        ? 1
        : 0;
  try {
    const queue = [...options.targets].sort(
      (a, b) => rank(a) - rank(b) || byAttempt(a.url, b.url),
    );
    const seen = new Set(queue.map((target) => target.url));
    for (
      let index = 0;
      index < queue.length && index < options.limit;
      index++
    ) {
      const target = queue[index];
      const row: Row = { target, fetch: 'failed' };
      rows.push(row);
      options.onProgress?.(
        `[${index + 1}/${Math.min(queue.length, options.limit)}] ${target.url}`,
      );
      if (rank(target) === 2) {
        row.fetch = 'skipped';
        row.error =
          'Recorded access restriction; manual public-access recheck required';
        continue;
      }
      const entry = read<Entry>(entryFile(target.url));
      let snapshot = entry?.snapshot
        ? read<Snapshot>(file(entry.snapshot))
        : undefined;
      const oldFile = entry?.snapshot;
      const oldSnapshot = snapshot;
      try {
        if (options.offline) {
          if (!snapshot || snapshot.evidence.version !== EXTRACTOR_VERSION)
            throw new Error('No compatible cached evidence');
          row.fetch = 'offline';
        } else {
          const conditional: Record<string, string> = {};
          if (
            snapshot?.evidence.version === EXTRACTOR_VERSION &&
            snapshot.url === target.url
          ) {
            if (snapshot.etag) conditional['If-None-Match'] = snapshot.etag;
            if (snapshot.modified)
              conditional['If-Modified-Since'] = snapshot.modified;
          }
          requests++;
          const response = await (options.fetch || fetchPage)(
            target.url,
            conditional,
          );
          if (response.status === 304) {
            if (
              !snapshot ||
              snapshot.evidence.version !== EXTRACTOR_VERSION ||
              response.url !== snapshot.url ||
              !Object.keys(conditional).length
            )
              throw new Error('304 without matching conditional evidence');
            row.fetch = 'not_modified';
            // Preserve the actual body retrieval date; a 304 is a revalidation.
          } else if (response.status === 200) {
            if (
              !/^text\/html\b|^application\/xhtml\+xml\b/i.test(
                response.contentType,
              )
            )
              throw new Error('Unsupported content type; HTML required');
            const evidence = extract(response.body, response.url);
            const contentHash = hash(
              JSON.stringify({
                version: evidence.version,
                url: response.url,
                text: evidence.text,
              }),
            );
            row.fetch = !oldSnapshot
              ? 'new'
              : oldSnapshot.content_hash === contentHash
                ? 'unchanged'
                : 'changed';
            snapshot = {
              url: response.url,
              fetched_at: now(),
              content_hash: contentHash,
              body_hash: hash(response.body),
              etag: response.etag,
              modified: response.modified,
              evidence,
            };
          } else
            throw new Error(
              `Source HTTP ${response.status}; not evidence of inactivity or deletion`,
            );
          if (!snapshot) throw new Error('No evidence retrieved');
          const snapshotFile = `evidence/${hash(JSON.stringify(snapshot))}.json`;
          write(file(snapshotFile), snapshot);
          write(entryFile(target.url), {
            attempted_at: now(),
            snapshot: snapshotFile,
          } satisfies Entry);
          row.evidence_file = snapshotFile;
        }
        if (!snapshot) throw new Error('No evidence retrieved');
        row.evidence_file ||= oldFile;
        row.previous_evidence_file = oldFile;
        row.observed_at = options.offline ? snapshot.fetched_at : now();
        row.final_url = snapshot.url;
        row.content_hash = snapshot.content_hash;
        if (!target.discovered_from) {
          const candidates = eventLinks(snapshot.evidence, snapshot.url)
            .filter((url) => !seen.has(url))
            .sort(byAttempt);
          row.discovery_omitted = Math.max(
            0,
            candidates.length - options.discover,
          );
          const discoveries = candidates
            .slice(0, options.discover)
            .map((url) => {
              seen.add(url);
              return {
                url,
                source_ids: [],
                club_ids: target.club_ids,
                record_ids: [],
                access: [],
                reasons: ['new same-origin event link; identity unverified'],
                discovered_from: target.url,
              };
            });
          queue.splice(index + 1, 0, ...discoveries);
        }
      } catch (error) {
        row.fetch = 'failed';
        row.error = error instanceof Error ? error.message : 'Retrieval failed';
        // Preserve last usable snapshot. Failed attempts never become unchanged.
        if (!options.offline)
          write(entryFile(target.url), {
            attempted_at: now(),
            snapshot: oldFile,
          } satisfies Entry);
      }
    }
    const fetchCounts = Object.fromEntries(
      [...new Set(rows.map((row) => row.fetch))]
        .sort()
        .map((value) => [
          value,
          rows.filter((row) => row.fetch === value).length,
        ]),
    );
    const report = {
      version: 2,
      mode: 'dry-run',
      started_at: started,
      finished_at: now(),
      planning_date: options.asOf,
      base_revision: options.baseRevision,
      data_hash: options.dataHash,
      extractor_version: EXTRACTOR_VERSION,
      limits: {
        pages: options.limit,
        discovery_per_page: options.discover,
      },
      offline: Boolean(options.offline),
      summary: {
        requests,
        selected_sources: options.targets.length,
        processed: rows.length,
        deferred: Math.max(0, queue.length - rows.length),
        clubs_in_plan: new Set(
          options.targets.flatMap((target) => target.club_ids),
        ).size,
        fetch: fetchCounts,
      },
      caution:
        'Fetched evidence only. No canonical data or check dates changed. Exact URL associations are not occurrence matches. Review dates, conflicts and access in the evidence before recording findings; absence is not cancellation.',
      rows,
      deferred_targets: queue.slice(rows.length),
    };
    const reportFile = file(
      `runs/${started.replace(/[:.]/g, '-')}-${randomUUID()}.json`,
    );
    write(reportFile, report);
    return { report, reportFile };
  } finally {
    fs.rmdirSync(lock);
  }
}
