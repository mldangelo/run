# Working in this repository

This project is a research-backed San Francisco running-club directory and static website. The JSON files in `data/` are the source of truth; the site and RSS feed are snapshots, not a live calendar.

## Start from the current checkout

- Check the repository root, branch, status and remote before editing. Fetch `origin/main` for a task based on latest main, record the base revision, and inspect overlapping work. Preserve unrelated changes; use an isolated branch/worktree when needed.
- Read current `package.json`, workflows and relevant implementation. Old agent traces and open PRs explain decisions but do not establish what is merged or which commands and schema exist now.
- Assign agents explicit file or record ownership. For research into the same JSON file, have agents return findings or patches to one integrator. Keep Git mutations with that integrator. Review merges by record and field, preserving both sides' sources, practical details and uncertainty.

## Research and data changes

- Start with [tracking and maintenance](research/tracking.md); use [race guidance](research/races.md) for race editions. Prefer a club's own dated event or organizer-hosted registration page. Search results and directories are discovery leads; retain their limits and use stable event links instead of changing search pages.
- For each changed claim, record its supporting URL, observation date, access method, findings, conflicts and next check in the supported source/audit fields. A carried-forward link or search snippet is not a page read. Distinguish retrieval failures from observed sign-in restrictions; neither proves inactivity or deletion. Keep source publication dates, event dates and research dates distinct. Report club coverage separately from sources actually inspected.
- Update `checked_on` or `last_checked` only for evidence actually checked in that pass. Formatting, normalization and copying old findings do not renew their dates. A recent visit to an old page does not make its contents current. Preserve prior findings and explain changes; clear a review flag only when the underlying issue is resolved.
- Keep published dated club events, unconfirmed leads and recurring patterns distinct. Never project a recurrence into a confirmed dated event or borrow a previous edition's date, start or location. Verify the year, local timezone and event type. Preserve cancellations, postponements and alternate starts. Use `unconfirmed` when a club event or its critical meeting details are not established; retain other unresolved details explicitly with `needs_review`. Keep unknown values unknown.
- For club events and patterns, store documented distance options, pace, cost, RSVP and access in `run_details`, with supporting URLs and check dates. An all-paces statement alone does not establish beginner suitability or a no-drop policy. Use only listed [neighborhood labels](research/neighborhoods.md), backed by a known meeting point; never infer geography from a club name. Areas are `sf` (primary), `marin` (Marin County) and `bay` (elsewhere); use `marin` for anything in a Marin town, which the validator checks for race cities and neighborhood labels (see [marin.md](research/marin.md)).
- Keep race editions in `data/races.json`, separate from club meetups. Preserve distance-specific starts, locations, wave and multi-day qualifications. Do not collapse separate registration listings into one gathering without evidence.
- Treat schema validation as a structural check, not source verification. Read the validator and consumers before adding fields; extend validation and relevant consumers together when changing the data contract. Never store credentials, private account details or raw authenticated browser content.

## Implementation and verification

- Use the runtimes specified in the current README, package and workflows. Install with `npm ci`; install the browser with `npx playwright install chromium` when needed. Use `npm run serve` for the local preview and `npm run verify` for the full suite; Biome checks formatting and `npm run format` applies it.
- Edit browser code in `site/*.ts`; `npm run site` generates the ignored `site/*.js`, and serving, testing and `npm run generate` run it first. Restart `npm run serve` after editing TypeScript. Node tools are `.mts` files run with native type stripping; `npm run verify` includes strict type checking.
- Before browser checks, prove the server serves this checkout. Playwright can reuse an existing local server; an occupied port does not identify its checkout. Preserve existing previews and use a free port with matching test `baseURL` and `webServer` settings in a temporary external config when needed. Anchor `testDir` and `webServer.cwd` to this checkout and keep test output temporary. Report any override used.
- After data changes, run `npm run generate` and commit changed `feed.xml` and `data/clubs.csv`. The Markdown schedule is a separate retained snapshot; refresh it using [tracking.md](research/tracking.md) when updating that view. Artwork has its own [export instructions](artwork/README.md). Do not hand-edit generated outputs.
- The RSS feed contains published dated club events only, including past listings; exclude unconfirmed, cancelled and postponed entries, recurring projections and races. RSS publication dates mean dates checked, not run dates; item links lead to the recorded sources.
- For interface changes, inspect desktop and mobile layouts, both themes, keyboard interaction and affected shared URLs. Preserve relative paths for GitHub Pages' `/run/` base. Keep text at WCAG AA contrast in both themes using the palette tokens in `site/style.css`, and add text/surface pairs to `tests/palette.test.cjs` when introducing colors.
- Keep the interface accessible. `tests/browser/accessibility.spec.mts` runs axe (WCAG 2.2 A/AA and best practices) on every view, filter panel and detail dialog in both themes, and checks keyboard focus and forced colors; Biome enforces its full `a11y` rule group on `index.html`. Generated markup must use `external()` for new-tab links so screen readers hear that they open a new tab, keep decorative symbols such as ↗ `aria-hidden`, and keep detail sections as headings.
- Run the required checks on the final integrated state. After a merge or conflict resolution changes that state, regenerate affected outputs and rerun affected checks. Report commands actually completed and unresolved failures; do not describe partial verification as a full pass.

## Pull requests and delivery

- Inspect the staged diff and file list before committing; stage intended paths. Keep raw agent traces, browser snapshots, test output and agent scratch files outside tracked changes. Preserve configured commit signing; use the supported permission flow for sandbox-blocked signing instead of disabling it.
- Make changes through a PR with conventional commit and PR titles, such as `fix(data): correct a meeting point`. Before pushing, recheck remote heads and preserve concurrent work. Check required CI on the pushed head before calling a PR ready. Before an authorized merge, recheck main, the head, reviews, unresolved threads and rules; squash with a conventional final title. Do not bypass protections.
- Distinguish local verification, pushed changes, CI success, merging and deployment. Follow the task's merge authorization. Only claim the site is live after the Pages deployment for the merged revision succeeds; deployments run from `main`.

## Code Review Rules

- Flag unsupported freshness or certainty, lost sources/access qualifications, and duplicate JSON fields that silently discard data. Compare changed claims with their evidence, not only schema checks.
- Check that filters, rows, detail dialogs and permalinks agree on status, the applicable start/location and distance option. Preserve San Francisco time, alternate starts and date-only/multi-day race behavior.
- When adding data files or assets, verify that the Pages artifact includes everything the site fetches. Leave formatting checks to CI; prioritize data correctness and user-visible regressions.
