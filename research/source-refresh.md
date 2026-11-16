# Dry-run source refresh

`npm run refresh:sources` fetches public source pages, extracts compact evidence, and writes a review report. It never edits `data/`, renews research check dates, generates a data patch, opens a PR, or publishes listings. Apply reviewed findings through the [research update process](tracking.md#updating-safely).

## Run it

Use the repository's Node version and `npm ci`, then start with a small sample:

```sh
npm run refresh:sources -- --limit 10 --max-parses 0
```

The default plan reuses `npm run review`: due clubs/patterns, flagged or aging upcoming events, upcoming races and registration checks, plus the recorded channels of clubs without upcoming published runs. `--within` changes the club review horizon; `--as-of YYYY-MM-DD` fixes the **planning** date, not the actual retrieval timestamp. URLs are deduplicated. The least recently attempted sources run first so repeated bounded runs work through the queue. Sources recorded as restricted or requiring event login are skipped and prioritized after public/unknown sources.

To select specific pages, repeat `--url`. To inventory all recorded club and race sources, use `--all`. Race sources include distance-specific registration pages; selected runs include separately cited practical-detail sources. The plan does not search for new clubs or sources on the web.

```sh
npm run refresh:sources -- --url https://www.dserunners.com/ --limit 4
```

Enable optional parsing with an OpenAI API key in the process environment and an explicit model that supports [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Prefer a pinned model version when repeatability matters. The CLI does not load `.env` files; do not put keys in command arguments or commit them.

```sh
# Set OPENAI_API_KEY securely in your environment first.
npm run refresh:sources -- --model YOUR_MODEL --limit 20 --max-parses 5
```

The first run with a model parses eligible evidence without a cached result. Later runs call the model only for a missing parse: new/changed evidence, a changed model or prompt/schema/extractor version, or a previous failed/deferred parse. A cached parse is validated again before reuse. The default budget is **20 source pages and 5 model calls**, including failed calls; each request has a 6,000-output-token limit. Reported token counts cover successful responses, not failed/incomplete requests that may still incur charges. `--max-parses 0` disables new model calls. With no model or API key, retrieval still works and uncached parsing remains `pending`.

## Cache and reports

The default cache is `.cache/source-refresh/`, ignored by Git and excluded from the Pages artifact. `--cache /absolute/path` can select external persistent storage. Use one cache per process: a lock rejects overlapping runs. After an interrupted process has exited, remove its stale `run.lock` directory before restarting. Completed pages and parses survive interruption; reports are finalized at the end of a run.

- `urls/`: latest attempt and pointer to last successfully extracted evidence for each URL.
- `evidence/`: immutable extracted text, same-origin links, final URL, retrieval time, body hash, content hash and HTTP validators. Raw HTML, cookies and authenticated sessions are not saved.
- `parses/`: validated proposed facts and successful-response token counts, keyed by evidence hash, model and prompt/schema version.
- `runs/`: versioned JSON reports containing the plan associations, per-page outcomes, evidence pointers, proposed claims with exact quotes, warnings and counts. The CLI prints the report path and a compact summary.

Every fetch uses public HTTP without browser sessions, cookies or authorization headers. ETag/Last-Modified permit conditional requests. Navigation/footer/script churn does not change the extracted content hash; event JSON-LD and visible prose are both retained so disagreements remain inspectable. A failed fetch, challenge page, malformed JSON-LD, empty shell, oversized evidence or unsupported response does not replace the last usable snapshot or reuse its facts as a fresh result. No failure proves inactivity, deletion or cancellation.

`--offline` reads compatible evidence and parse caches, makes **no source or model requests**, and preserves original observation times. It is useful for inspecting a cached result; it is not a fresh check. Run manifests identify the Git revision, hash of input research data, versions, model and limits. Cached model output can be replayed; a fresh model call is not guaranteed deterministic.

```sh
npm run refresh:sources -- --offline --model YOUR_MODEL --limit 20
```

Exit status is `0` for a completed report (including budget-deferred or skipped work), `2` if any processed source/parser failed, and `1` for configuration/cache errors. Inspect `pending`, `skipped` and `deferred` counts before assessing coverage. Clubs in the plan are counted separately from pages processed; neither means a club was fully researched. Cache files are not automatically expired; remove the cache to start over, at the cost of fetching and parsing again.

## Discovery and review limits

Discovery follows at most `--discover 3` same-origin event links per seed, one hop, within the page budget. It recognizes event paths, RunSignup race paths, SFRRC event IDs and Luma event links. `--discover 0` disables it. The report records the parent URL and omitted link count. A discovered link is an unverified lead; it inherits club context but never an existing event identity. Cross-domain registration links, pagination, images/PDFs, client-rendered calendars and sign-in sources require manual review or a future focused adapter. The extractor uses [parse5](https://parse5.js.org/) and does not execute page JavaScript.

Each parsed claim must quote an exact substring of the extracted evidence. This catches invented quotations, not semantic misinterpretation. Treat all proposed facts as unreviewed, including a model's `usable` classification. Inspect the evidence, warning list and any previous snapshot. Exact source-URL associations are **not** an occurrence match: a rolling Friday URL may now describe a different Friday. The tool intentionally does not merge records, infer cancellations from missing listings, project recurrence, or decide which side of conflicting metadata/prose is correct.

For the next version, use dry-run reports to measure usable source coverage, missed changes, extraction failures, and tokens per accepted update. Add focused adapters where those reports show a concrete gap before adding automated canonical-data writes or scheduled execution.
