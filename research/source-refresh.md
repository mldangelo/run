# Dry-run source refresh

`npm run refresh:sources` fetches public source pages, extracts compact evidence, caches it, and writes a review report. It never edits `data/`, renews research check dates, generates a data patch, opens a PR, or publishes listings. Reviewers read the cached evidence and record their conclusions as a [findings file](findings.md), applied with `npm run apply-findings` through the [research update process](tracking.md#updating-safely).

## Run it

Use the repository's Node version and `npm ci`, then start with a small sample:

```sh
npm run refresh:sources -- --limit 10
```

The default plan reuses `npm run review`: due clubs/patterns, flagged or aging upcoming events, upcoming races and registration checks, plus the recorded channels of clubs without upcoming published runs. `--within` changes the club review horizon; `--as-of YYYY-MM-DD` fixes the **planning** date, not the actual retrieval timestamp. URLs are deduplicated. The least recently attempted sources run first so repeated bounded runs work through the queue. Sources whose event details need a login are fetched signed out for their public part, after public and unknown sources; sources recorded as restricted are skipped.

To select specific pages, repeat `--url`. To inventory all recorded club and race sources, use `--all`. Race sources include distance-specific registration pages; selected runs include separately cited practical-detail sources. The plan does not search for new clubs or sources on the web. The default budget is **20 source pages**, including discovered links; `--limit` changes it.

```sh
npm run refresh:sources -- --url https://www.dserunners.com/ --limit 4
```

## Review the evidence

The CLI prints the report path and a compact summary. Each report row names its source, plan associations, fetch outcome, observation time and `evidence_file`; open that file in the cache to read the extracted page text, and compare `previous_evidence_file` when the content changed. Record what the evidence shows, its conflicts and the next check in a findings file. Treat the evidence as an unreviewed snapshot of one page at one time.

Exact source-URL associations are **not** an occurrence match: a rolling Friday URL may now describe a different Friday. The tool intentionally does not interpret the evidence, merge records, infer cancellations from missing listings, project recurrence, or decide which side of conflicting metadata/prose is correct.

## Cache and reports

The default cache is `.cache/source-refresh/`, ignored by Git and excluded from the Pages artifact. `--cache /absolute/path` can select external persistent storage. Use one cache per process: a lock rejects overlapping runs. After an interrupted process has exited, remove its stale `run.lock` directory before restarting. Completed pages survive interruption; reports are finalized at the end of a run.

- `urls/`: latest attempt and pointer to last successfully extracted evidence for each URL.
- `evidence/`: immutable extracted text, same-origin links, final URL, retrieval time, body hash, content hash and HTTP validators. Raw HTML, cookies and authenticated sessions are not saved.
- `runs/`: versioned JSON reports containing the plan associations, per-page fetch outcomes (`new`, `changed`, `unchanged`, `not_modified`, `offline`, `skipped` or `failed`, with the error), evidence pointers, discovery counts and request totals. Run manifests identify the Git revision, hash of input research data, extractor version and limits.

`--offline` reads compatible cached evidence, makes **no network requests**, and preserves original observation times. It is useful for rereading a cached result; it is not a fresh check.

```sh
npm run refresh:sources -- --offline --limit 20
```

Exit status is `0` for a completed report (including budget-deferred or skipped work), `2` if any processed source failed, and `1` for configuration/cache errors. Inspect `skipped` and `deferred` counts before assessing coverage. Clubs in the plan are counted separately from pages processed; neither means a club was fully researched. Cache files are not automatically expired; remove the cache to start over, at the cost of fetching again. A change to the extractor version makes older evidence incompatible, so the next run fetches the page in full.

## Fetch safety

Every fetch uses public HTTP without browser sessions, cookies or authorization headers. Source URLs that carry credentials or tokens, and hosts that resolve to non-public addresses, are rejected. Each page has a 20-second timeout, follows at most five redirects, rejects HTTPS-to-HTTP redirects, and stops at 2 MB; evidence over 60,000 characters fails and needs a focused adapter. ETag/Last-Modified permit conditional requests. Navigation/footer/script churn does not change the extracted content hash; event JSON-LD and visible prose are both retained so disagreements remain inspectable. A failed fetch, challenge page, malformed JSON-LD, empty shell, oversized evidence or unsupported response does not replace the last usable snapshot or present it as a fresh result. No failure proves inactivity, deletion or cancellation.

## Host adapters

Luma, Heylo and Strava event pages fill in their dates in the browser, so the visible text a no-JS fetch receives lacks the date, year or UTC offset. For `luma.com`/`lu.ma` event pages, `heylo.com/event/…` and `strava.com/clubs/…/group_events/…`, the extractor reads a few listed fields from the event JSON embedded in the same public response (`__NEXT_DATA__`) and adds an `EVENT-DATA` line. It makes no extra request, does not execute the data, and copies no guest, host, registration-count or build fields. Luma and Heylo give a UTC instant and an IANA zone, so the line states `start`/`end` in the event's zone with year and offset beside the reported `start_utc`/`end_utc`. Luma embeds the same object that `https://api.lu.ma/url?url=<slug>` serves, which reviewers can open to cross-check. Heylo's JSON-LD dates carry no offset and are the UTC instant, not local time. Strava gives only a local `start_local` with no zone or offset, labeled as the next occurrence: a recurring series advances to its next date, so it is not a confirmed date for a specific run. Fields the data lacks are listed in `omitted`, never inferred; a hidden Heylo location stays hidden. A missing or malformed embedded object yields an `unavailable` line and keeps the rest of the page's evidence.

## Discovery and limits

Discovery follows at most `--discover 3` same-origin event links per seed, one hop, within the page budget. It recognizes event paths, RunSignup race paths, SFRRC event IDs and Luma event links, and skips calendar exports and other files, dashboards, and race-platform utility pages such as donation, insurance, sponsor, refund and course-map pages. `--discover 0` disables it. The report records the parent URL and omitted link count. A discovered link is an unverified lead; it inherits club context but never an existing event identity. Cross-domain registration links, pagination, images/PDFs, client-rendered calendars and sign-in sources require manual review or a future focused adapter. Bot-protected sources also need manual review: REI event pages and Let's Do This return HTTP 403 to a plain public fetch, and Haku registration passes through a waiting-room queue whose return URL carries a queue token, which the refresher rejects as credential-bearing. Getting past them would take a browser session, cookies or that token, which this tool never uses; a 403 or queue is not evidence about the event. The extractor uses [parse5](https://parse5.js.org/) and does not execute page JavaScript.

For the next version, use dry-run reports to measure usable source coverage, missed changes and extraction failures. Add focused adapters where those reports show a concrete gap before adding automated canonical-data writes or scheduled execution.
