# SF Run Club Index

Find running clubs, group runs and races in San Francisco and nearby Bay Area communities.

**[Explore the website](https://mldangelo.github.io/run/)** · [Suggest a club or correction](https://github.com/mldangelo/run/issues/new?template=suggest-a-club.yml)

## Find a run

| Looking for | Start here |
| --- | --- |
| A run on a particular day | [Upcoming runs](https://mldangelo.github.io/run/?view=events) |
| A recurring meetup | [Regular runs](https://mldangelo.github.io/run/?view=patterns) |
| A group to join | [Clubs](https://mldangelo.github.io/run/?view=clubs) |
| A race to enter | [Races](https://mldangelo.github.io/run/?view=races) |

Filter runs by day, time, neighborhood, distance or whether beginners are welcome. Open a listing for meeting details, pace, cost, RSVP requirements and source links where recorded. Share or bookmark the page URL to save your filters or an open listing. Use your browser’s Back button to return from a listing to your filtered results, and Forward to reopen it. Times are San Francisco local time.

Races show whether registration is open. Use **More filters → Registration** to find open entries, waitlists, sold-out races and races not yet open; a race's details list its opening and closing dates and registration link. Availability can differ by distance and change quickly, and an old or unsettled check says **Check registration**, so confirm with the organizer before you pay.

Search, date and area controls stay visible. Open **More filters** for month, day, time, listing status, neighborhood, distance, experience and race registration; bookmarked advanced filters expand automatically. **Clear filters** appears whenever a search or filter is active.

## Before you go

Listings are gathered by hand from club calendars, event pages and directories, so they are not live. Before you go, confirm the meeting point, any sign-up requirements and any changes or cancellations with the club or organizer. Some club pages need an account.

**Listed** runs appeared on a dated event page. **Unconfirmed** runs came from a less direct source and need checking. **Regular runs** are a club's usual schedule, not a promise that a particular run will happen. If a club has no runs listed, we haven't found them yet. Filters only match details a club lists; choose **Not listed** to find runs without that detail.

The [RSS feed](https://mldangelo.github.io/run/feed.xml) contains published dated club runs, including past listings. It excludes recurring projections and races. Feed publication dates mean dates checked, not run dates. The feed does not refresh itself.

## Maintain the research

[Suggest a club or correction](https://github.com/mldangelo/run/issues/new?template=suggest-a-club.yml) with a source link and what needs changing. Issues are public, so leave out private contact information and login details. Each listing on the site also has a **Suggest a correction** link that opens an email draft with the listing's link filled in; you write and send it.

The [JSON files in `data/`](data/) are the source of truth, and each fact is stored once. The [RSS feed](https://mldangelo.github.io/run/feed.xml) and the [club list CSV](https://mldangelo.github.io/run/data/clubs.csv) are built from them when the site deploys. For data changes, follow the [research update process](research/tracking.md) and [race guidance](research/races.md), then run `npm run verify`. See the [methodology](research/methodology.md) for sources, coverage and unresolved questions.

The [club merchandise index](research/merchandise.md) records public shops, order forms, availability limits and unresolved leads. Its [JSON data](data/merchandise.json) is not shown on the website or included in the feed or club CSV.

## Run locally

Use Node 26. From the repository root:

```sh
npm ci
npx playwright install chromium
npm run verify
npm run serve
```

Open [localhost:4173](http://localhost:4173/). The site is static and reads the JSON directly. Browser TypeScript lives in `site/`; serving and testing generate its JavaScript automatically. Node 26 runs the tools directly from TypeScript; `npm run verify` also checks types.

During deployment, Pages copies referenced assets to content-fingerprinted filenames so cached scripts and styles from an earlier release cannot be mixed with new HTML. Local source filenames stay unchanged. Data requests revalidate the research snapshot when a page loads.

See [AGENTS.md](AGENTS.md) for contribution and validation guidance, and the [artwork notes](artwork/README.md) for editing images. Open pull requests against `main` with a conventional title such as `docs: clarify run listings`. GitHub Actions validates changes and deploys the site after they reach `main`.

## License

Code and research data are [MIT licensed](LICENSE). Linked organizer and event content belongs to its respective owners.
