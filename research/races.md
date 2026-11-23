# Races

`data/races.json` is a manually researched starting index of San Francisco races, Marin County races and selected Bay Area events. It is not exhaustive, live, or an assertion that registration is open. Races are separate from club events and are not included in the club-run RSS feed.

Each record represents one race edition or an explicitly labeled multi-day weekend. It has a stable ID, date and optional end date, city, broad area (see [marin.md](marin.md)), general location, distances with categories, optional individual start times and locations, an HTTPS primary source, optional additional sources, checked date, status, review flag, `notes` and optional `research_notes`. Write `notes` for runners: the facts they need and what to check. Keep source-by-source comparisons in `research_notes`, which the race dialog shows collapsed. Dates and times are local to the Bay Area. Null times mean unknown; do not invent midnight or use a prior year’s schedule. List only distances and start times supported by a source.

The optional `format` is `small_group` (a source-described small-group run; the site labels these as optional self-timing with no timing chips), `kids` (a standalone kids-only race, not a mixed adult and kids program) or `relay`. Records without the field are not classified; the site's other filter does not promise a conventional timed race.

A race may list its hosting clubs in `club_ids`; the club's profile shows it from there, so nothing is stored on the club. When a race was mistakenly recorded as a group run, delete the event and keep its ID in the race's `former_event_ids`; the site redirects the old link and the race stays out of the club RSS feed.

## Updating

1. Start with organizer or organizer-hosted registration pages. Use directories such as [SF Runs](https://www.sfruns.com/) and [Races Near](https://racesnear.com/bay-area/) only to discover leads, then check the organizer.
2. Recheck the date, location, distances and starts for the correct edition. Distinguish an event start from packet pickup or a whole weekend, and an in-person date from a virtual window, which directories sometimes list instead. Split a race into separate records when its distances happen on different days.
3. Update status when cancelled or postponed, preserve stable IDs, update the check date only for what you checked, and record uncertainty or access limits in `research_notes`.
4. Run `npm run verify` and review the race view at desktop and mobile sizes.

When organizer sources disagree, keep a start time only when the more specific organizer statements agree; otherwise leave it blank and explain in `research_notes`. Set `needs_review` for an unresolved conflict, and clear it only when a current-edition organizer source settles the question and no other organizer source contradicts it. Directory listings never clear a flag. Text left over from a previous edition is not a contradiction when the same page's current-edition header and schedule agree. Several same-day registrations from one organizer (such as The Best Races) may be one gathering; keep them as separate records unless the organizer says otherwise, and say so in `notes`.

The weekly research reminder lists scheduled races starting in the next 30 days (and races in progress) that are flagged or whose check is, or will become, at least 30 days old by race day or the next weekly reminder, whichever comes first. It also lists races within 90 days whose registration snapshot is due by the next reminder. Cancelled, postponed and finished races are excluded. It uses the San Francisco calendar date and never contacts sources.

## Registration

Registration is independent of the race's `scheduled`, `cancelled` or `postponed` status. An upcoming race is not necessarily accepting entries, and a race without a `registration` object is unverified.

Optional `registration` objects on a race and its individual `distances` use these fields:

- `status`: `open`, `not_yet_open`, `sold_out`, `waitlist`, `closed` or `unknown`. `waitlist` means an application or early-access list, not a confirmed entry; explain which kind in `notes`. `sold_out` requires explicit capacity evidence. A closed registration page alone does not establish a sellout.
- `source_url`: the exact public page or storefront response inspected for the claim. `url`: where to register, only when that is a different page; the site otherwise links to `source_url`.
- `checked_on`, `access_method` (`web`, `http` or `browser`), `notes` and `review_due`: observation date, retrieval method, practical qualifications and next check. Optional `evidence_notes` retains technical retrieval findings and source conflicts without displaying research mechanics in the race dialog. Recheck within 14 days at most, sooner for an imminent opening or closing. A failed request does not renew the race's or registration's check date.
- Optional `opens_at` and `closes_at`: an explicit local Pacific date (`YYYY-MM-DD`) or date and time (`YYYY-MM-DDTHH:MM`). Date-only values retain unknown times. Store neither an inferred midnight nor a pricing, packet-mailing, transfer or deferral deadline as a registration deadline. Record online versus race-day limits and category-specific exceptions in the notes.

Price tiers, hidden template text in a page's source and generic platform boilerplate are not evidence of a deadline, sellout or opening date. When a platform and the organizer give different deadlines, omit `closes_at` and explain the conflict.

A distance's complete registration object takes precedence over the race default; it does not merge individual fields from the default. The list reports “Varies by distance” when selected distances differ, and a registration filter matches only options that also satisfy the distance and time filters.

The site shows “Check registration” after `review_due`, once a known opening arrives without a new check, or once an open-entry closing deadline passes; it never infers that registration opened, stayed open or closed. From race day, an `open`, `waitlist` or `not_yet_open` snapshot counts only while a published `closes_at` is still ahead. Past, cancelled and postponed races show no registration status or prompt.

Validation rejects fields outside this list, an empty `url`, a `closes_at` after the race ends, and statuses that contradict their dates when checked: `open` with a later `opens_at`, `not_yet_open` with an earlier `opens_at`, and `open` or `waitlist` with an earlier `closes_at`.

## Open organizer questions

A flagged race whose question only its organizer can settle ends its `research_notes` with that question and the organizer contact to ask. When the organizer answers, update the record and clear its flag if nothing else is in doubt.
