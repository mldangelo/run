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

- **Pick a day:** use Today, Tomorrow or This weekend, or **When → Specific date** for one San Francisco calendar day. Times are San Francisco local time.
- **Narrow the list:** search accepts words in any order and ignores punctuation and accents. Search, date and area stay visible; **More filters** holds month, day, time, listing status, neighborhood, distance, experience and race registration. Select an active filter label to remove it, or **Clear filters** to remove them all. Filters only match details a club lists; choose **Not listed** to find runs without that detail.
- **Open a listing** for meeting details, pace, cost, RSVP requirements and source links where recorded. **Copy link** shares just that listing, while the page address keeps your filters. Back returns to your results and Forward reopens the listing.
- **Add to calendar** on a dated run or race downloads a calendar file (.ics) with its time, place and links. The file doesn't update if plans change.
- **Races** show whether registration is open; **More filters → Registration** finds open entries, waitlists, sold-out races and races not yet open. Availability can differ by distance and change quickly, and an old or unsettled check says **Check registration**, so confirm with the organizer before you pay.

## Before you go

Listings are gathered by hand from club calendars, event pages and directories, so they are not live. Before you go, confirm the meeting point, any sign-up requirements and any changes or cancellations with the club or organizer. Some club pages need an account.

**Listed** runs appeared on a dated event page. **Unconfirmed** runs came from a less direct source and need checking. **Regular runs** are a club's usual schedule, not a promise that a particular run will happen. If a club has no runs listed, we haven't found them yet.

The [RSS feed](https://mldangelo.github.io/run/feed.xml) contains published dated club runs, including past listings. It excludes recurring projections and races. Feed publication dates mean dates checked, not run dates. The feed does not refresh itself.

## Maintain the research

[Suggest a club or correction](https://github.com/mldangelo/run/issues/new?template=suggest-a-club.yml) with a source link and what needs changing. Issues are public, so leave out private contact information and login details. Each listing on the site also has a **Suggest a correction** link that opens an email draft with the listing's link filled in; you write and send it.

The [JSON files in `data/`](data/) are the source of truth, and each fact is stored once. The [RSS feed](https://mldangelo.github.io/run/feed.xml) and the [club list CSV](https://mldangelo.github.io/run/data/clubs.csv) are built from them when the site deploys. For data changes, follow the [research update process](research/tracking.md) and [race guidance](research/races.md), then run `npm run verify`. [Tracking](research/tracking.md#discovery-sources-and-identity) lists the discovery sources and how club identities are decided.

For a repeatable public-source check, use the [dry-run source updater](research/source-refresh.md). It fetches public pages, caches the extracted evidence and writes a report without changing listings; reviewers read the evidence and record what it shows as a [findings file](research/findings.md).


## Run locally

Use Node 26. From the repository root:

```sh
npm ci
npx playwright install chromium
npm run verify
npm run serve
```

Open [localhost:4173](http://localhost:4173/), or set `PORT` to use another port for both `npm run serve` and the browser tests. The site is static and loads one snapshot of the JSON, `data/site.json`. Browser TypeScript lives in `site/`; serving and testing generate its JavaScript and that snapshot automatically. Node 26 runs the tools directly from TypeScript; `npm run verify` also checks types.

Deploys give scripts, styles, fonts and images content-fingerprinted names, so a cached file from an earlier release can't mix with new HTML; the data snapshot revalidates on every load.

See [AGENTS.md](AGENTS.md) for contribution and validation guidance, and the [artwork notes](artwork/README.md) for editing images. Open pull requests against `main` with a conventional title such as `docs: clarify run listings`. GitHub Actions validates changes and deploys the site after they reach `main`.

## License

Code and research data are [MIT licensed](LICENSE). The site serves its own copies of the DM Sans and Space Mono fonts, which are under the SIL Open Font License; their license files are in [`site/fonts/`](site/fonts/). Linked organizer and event content belongs to its respective owners.
