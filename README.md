# SF Run Club Index

A research-backed directory of running clubs and group runs in San Francisco and the wider Bay Area.

**[Explore the website](https://mldangelo.github.io/run/)** · [Browse race listings](https://mldangelo.github.io/run/?view=races) · [Subscribe to the RSS feed](https://mldangelo.github.io/run/feed.xml) · [Suggest or update a club](https://github.com/mldangelo/run/issues/new?template=suggest-a-club.yml)

The directory is a **dated research snapshot, not a live calendar**. Listings may be incomplete or out of date. Check the linked organizer for the meeting point, access requirements, changes and cancellations before heading out.

## Find a run

The website has four views:

- **Dated runs** lists individually dated events found in a source. Filter by date, day, time of day or confirmation status. Past events are hidden by default.
- **Regular runs** lists recurring patterns. These are leads, not confirmation that a particular occurrence is happening.
- **Clubs** lists the groups in the research, including unresolved identities and clubs with no current schedule found.
- **Races** indexes dated race and small-group run registrations in San Francisco and selected nearby Bay Area locations, with distances, start times when known, and links to sources. Filter by distance, area and documented small-group format. Separately branded registrations may share a gathering; counts are listings, not necessarily distinct events.

Open a record to see its details, source and date checked. The address bar always reflects the current view, filters, search and open record, so any of them can be bookmarked or shared. The banner at the top shows when the research was last checked and warns when the snapshot is more than two weeks old. Some source pages require an account. The [RSS feed](https://mldangelo.github.io/run/feed.xml) includes published dated records, including historical events, and links to their sources. Its publication dates represent dates checked, not run dates. The feed does not contain projected recurring events or refresh itself.

## Run the site locally

The site is static, has no build step and reads the JSON in `data/` directly. From the repository root:

```sh
npm run serve   # or: python3 -m http.server 4173
```

Open [localhost:4173](http://localhost:4173/). Serve it over HTTP rather than opening `index.html` as a `file:` URL so the browser can load the data.

For development, use Node 24+ and Python 3.9+:

```sh
npm ci
npm run verify
```

`npm run verify` runs Biome, the JavaScript and Python tests, data validation and freshness checks for the generated feed and clubs CSV. `npm run format` formats the site and JavaScript tests. Biome's full HTML support is experimental.

| Path | Purpose |
| --- | --- |
| `index.html`, `site/` | The page, its script (`app.js`), shared filtering and date logic (`model.js`) and styles. |
| `data/` | Canonical research data (see below). |
| `scripts/` | Validation, feed generation and command-line reports. |
| `tests/` | Node tests for the site model and page structure; Python tests for the scripts. |
| `research/` | Methodology, maintenance notes and generated snapshots. |

All dates and times are San Francisco local time, regardless of the visitor's time zone. Keep paths in `index.html` relative: GitHub Pages serves the site from `/run/`.

## Maintain the research

The canonical data lives in [`data/`](data/) as JSON arrays related by stable IDs:

| File | Contents |
| --- | --- |
| [clubs.json](data/clubs.json) | Club names, original leads, geography and identity notes. |
| [sources.json](data/sources.json) | Source links, authority, access limits and dates checked. |
| [audits.json](data/audits.json) | One review per club, including gaps, conflicts and review dates. |
| [schedules.json](data/schedules.json) | Reported recurring patterns, with evidence and effective dates where known. |
| [events.json](data/events.json) | Individual dated club listings, including separately labeled unconfirmed leads. |
| [races.json](data/races.json) | Race editions, distance-specific starts, organizer links and research notes. |

A `published` event appeared in a source during the audit; it does not mean it has been reconfirmed since. A source with a null `last_checked` is a discovery link, not evidence of a current read. Unknowns and conflicts are kept explicit, and an inaccessible source is not evidence that a club is inactive.

Race records are a starting inventory, not a complete or automatically refreshed calendar. Verify dates, locations, individual distance starts and registration with the organizer. A multi-day race weekend may include non-race events; its individual race dates should be confirmed. See [race research notes](research/races.md). Races are not included in the club-run RSS feed. After updating data, regenerate the feed and clubs CSV, then validate the result:

```sh
npm run generate   # rebuilds feed.xml and data/clubs.csv
npm run verify
```

For a command-line view of the snapshot:

```sh
python3 scripts/report.py --days 14 --include-patterns --include-unconfirmed
python3 scripts/report.py --club 'Marina'
```

The optional pattern projection is labeled **unconfirmed**; it cannot account for changes or cancellations and may overlap an individual dated event. See [tracking and maintenance](research/tracking.md) for the full update process and [research notes](research/methodology.md) for scope, sources and unresolved names.

[`data/clubs.csv`](data/clubs.csv) is a spreadsheet-friendly export of `clubs.json`; `npm run generate` rebuilds it and `npm run verify` fails if it is stale. The [generated schedule](research/upcoming-schedule.md) and [original club inventory](research/club-inventory.md) are retained snapshots. They are not live or automatically synchronized with every data update.

## Contribute and deploy

To suggest a club or correction, [open a club suggestion](https://github.com/mldangelo/run/issues/new?template=suggest-a-club.yml) with a source link. Issues are public; do not include private contact information or credentials.

Changes go through a pull request targeting `main`. Use a conventional title such as `feat: add an event filter` or `fix(feed): escape source URLs`, and keep the final squash commit title conventional too. The repository requires the title and verification checks and accepts squash merges only. [AGENTS.md](AGENTS.md) contains the project-specific working guidance.

The [Pages workflow](.github/workflows/pages.yml) validates the project, assembles the static site and deploys it after changes reach `main`. Updating the repository does **not** automatically research or refresh club schedules.

Every Monday, the [research review reminder](.github/workflows/review-reminder.yml) opens or updates a *Research review due* issue listing clubs whose review is due within a week and upcoming races flagged for review, and closes it when nothing is due. Run `python3 scripts/review_status.py --within 7` for the same report locally. Dependabot proposes monthly updates to the pinned GitHub Actions and Biome.

## License

The code and research data in this repository are available under the [MIT License](LICENSE). Linked organizer, directory and event pages belong to their respective owners.
