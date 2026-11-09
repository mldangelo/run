# Working in this repository

This project is a research-backed San Francisco running-club directory and static website. The JSON files in `data/` are the source of truth; the site and RSS feed are snapshots, not a live calendar.

## Evidence and data

- Prefer a club's own dated event and update channels. Record source URLs, access limitations, dates checked, conflicts and unknowns. Never turn a recurring schedule into a claimed dated event or assume a club is inactive because a source is inaccessible.
- Keep published dated events, unconfirmed leads and recurring patterns distinct. Respect cancellations, variable locations, alternate starts, local time zones and `needs_review` flags. Do not add private account data or credentials.
- Keep race editions in `data/races.json`, separate from club meetups. Use dated organizer evidence where possible; preserve distance-specific start times and locations, source URLs, date checked, conflicts and unknowns. Do not infer dates or starts from previous years. See `research/races.md`.
- After changing data, run `python3 scripts/validate.py` and `npm run feed`. Commit the resulting `feed.xml`. Its item publication date represents the date checked, not the run date, and its event links go to source pages.

## Development and validation

- Use Node 24+ and Python 3.9+; run `npm ci` and `npm run verify`. Biome checks and formats the site and JavaScript tests; `npm run format` applies formatting. HTML support in Biome is experimental.
- Serve the repository root using `npm run serve` (`python3 -m http.server 4173`). Verify the site at desktop and mobile sizes when changing the interface; use relative paths so GitHub Pages' `/run/` base works. Keep text colors at WCAG AA contrast using the tokens in `site/style.css`.
- Preserve attribution and clear freshness and uncertainty labels. The feed must contain published dated listings only and never projected recurring events.
- Make changes through a pull request with a conventional title such as `feat: add run filters`; use squash merging and preserve a conventional final commit title. CI checks the PR title, but GitHub permits changing the squash title when merging. Do not weaken repository protections or deploy unverified changes. GitHub Actions validates changes and deploys only pushes to `main`.
