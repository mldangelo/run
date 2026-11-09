# SF Run Club Index

Find running clubs, group runs and races in San Francisco and nearby Bay Area communities.

**[Explore the website](https://mldangelo.github.io/run/)** · [Suggest a club or correction](https://github.com/mldangelo/run/issues/new?template=suggest-a-club.yml)

## Find a run

| Looking for | Start here |
| --- | --- |
| A run on a particular day | [Dated runs](https://mldangelo.github.io/run/?view=events) |
| A recurring meetup | [Regular runs](https://mldangelo.github.io/run/?view=patterns) |
| A group to join | [Clubs](https://mldangelo.github.io/run/?view=clubs) |
| A race to enter | [Races](https://mldangelo.github.io/run/?view=races) |

Filter runs by day, time, neighborhood, distance or whether beginners are welcome. Open a listing for meeting details, pace, cost, RSVP requirements and source links where recorded. Share or bookmark the page URL to save your filters or an open listing. Times are San Francisco local time.

## Before you go

This is a research snapshot, not a live calendar. Check the listing's source and date checked, then confirm the meeting point, joining requirements and any changes or cancellations with the organizer. Some sources require an account.

A **published** run appeared in a dated source; it has not necessarily been reconfirmed. **Unconfirmed** listings need verification, and **regular runs** describe recurring schedules without confirming a particular date. Missing listings do not mean a club is inactive. Filters match documented details; choose **Unknown** to find runs with missing distance or experience information.

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

Use Node 24+. From the repository root:

```sh
npm ci
npx playwright install chromium
npm run verify
npm run serve
```

Open [localhost:4173](http://localhost:4173/). The site is static and reads the JSON directly; it needs an HTTP server and has no build step.

See [AGENTS.md](AGENTS.md) for contribution and validation guidance, and the [artwork notes](artwork/README.md) for editing images. Open pull requests against `main` with a conventional title such as `docs: clarify run listings`. GitHub Actions validates changes and deploys the site after they reach `main`.

## License

Code and research data are [MIT licensed](LICENSE). Linked organizer and event content belongs to its respective owners.
