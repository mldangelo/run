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

Filter runs by day, time, neighborhood, distance or whether beginners are welcome. Open a listing for meeting details, pace, cost, RSVP requirements and source links where recorded. Share or bookmark the page URL to save your filters or an open listing. Times are San Francisco local time.

Search, date and area controls stay visible. Open **More filters** for month, day, time, listing status, neighborhood, distance and experience; bookmarked advanced filters expand automatically. **Clear filters** appears whenever a search or filter is active.

## Before you go

Listings are gathered by hand from club calendars, event pages and directories, so they are not live. Before you go, confirm the meeting point, any sign-up requirements and any changes or cancellations with the club or organizer. Some club pages need an account.

**Listed** runs appeared on a dated event page. **Unconfirmed** runs came from a less direct source and need checking. **Regular runs** are a club's usual schedule, not a promise that a particular run will happen. If a club has no runs listed, we haven't found them yet. Filters only match details a club lists; choose **Not listed** to find runs without that detail.

The [RSS feed](https://mldangelo.github.io/run/feed.xml) contains published dated club runs, including past listings. It excludes recurring projections and races. Feed publication dates mean dates checked, not run dates. The feed does not refresh itself.

## Maintain the research

[Suggest a club or correction](https://github.com/mldangelo/run/issues/new?template=suggest-a-club.yml) with a source link and what needs changing. Issues are public, so leave out private contact information and login details.

The [JSON files in `data/`](data/) are the source of truth. You can also [download the club list as CSV](data/clubs.csv). For data changes, follow the [research update process](research/tracking.md) and [race research notes](research/races.md), then regenerate and check the exports:

```sh
npm run generate
npm run verify
```

Include the resulting `feed.xml` and `data/clubs.csv` in your pull request. See the [methodology](research/methodology.md) for sources, coverage and unresolved questions.

## Run locally

Use Node 24+ and Python 3.9+. From the repository root:

```sh
npm ci
npx playwright install chromium
npm run verify
npm run serve
```

Open [localhost:4173](http://localhost:4173/). The site is static and reads the JSON directly; it needs an HTTP server and has no build step.

During deployment, Pages copies referenced assets to content-fingerprinted filenames so cached scripts and styles from an earlier release cannot be mixed with new HTML. Local source filenames stay unchanged. Data requests revalidate the research snapshot when a page loads.

See [AGENTS.md](AGENTS.md) for contribution and validation guidance, and the [artwork notes](artwork/README.md) for editing images. Open pull requests against `main` with a conventional title such as `docs: clarify run listings`. GitHub Actions validates changes and deploys the site after they reach `main`.

## License

Code and research data are [MIT licensed](LICENSE). Linked organizer and event content belongs to its respective owners.
