# Race research and maintenance

`data/races.json` is a manually researched starting index of San Francisco races and selected nearby Bay Area events. It is not exhaustive, live, or an assertion that registration is open. Races are separate from club events and are not included in the club-run RSS feed.

Each record represents one race edition or an explicitly labeled multi-day weekend. It has a stable ID, date and optional end date, city, broad area (`sf` or `bay`), general location, distances with categories, optional individual start times and locations, an HTTPS primary source, optional additional sources, checked date, status, review flag, and notes. A `needs_review` flag makes discrepancies or incomplete edition details visible in the index. Dates and times are local to the Bay Area. Null times mean unknown; do not invent midnight or use a prior year’s schedule. List only distances and start times supported by a source and describe weekend or event-specific dates in notes.

The optional `format: small_group` identifies listings whose source describes a small-group run. Records without the field are not classified; the site's other/unclassified filter does not promise a conventional timed race. Use the notes to explain self-timing and potential shared gatherings, and do not merge separate registrations without evidence.

## Updating

1. Start with organizer or organizer-hosted registration pages. Use directories such as [SF Runs](https://www.sfruns.com/) and [Races Near](https://racesnear.com/bay-area/) to discover leads, then check the organizer; label any secondary evidence or discrepancies in notes and include the relevant links.
2. Recheck the date, location, distance and starts for the correct edition. Explicitly distinguish an event start from packet pickup or an entire weekend. Retain nulls for unknown starts; do not assume a race has happened just because it is annual.
3. Update status when cancelled or postponed, preserve stable IDs, update the check date, and record uncertainty or access limitations. Check registration and costs on the organizer’s page rather than assuming they stay current.
4. Run `npm run verify` and regenerate the feed and clubs CSV with `npm run generate` when data changes; races are intentionally excluded from that feed. Review the race view at desktop and mobile sizes before merging.

The initial research was checked November 8, 2026. DSE’s organizer schedule lists Rainbow Falls Festivus for December 13 while SF Runs lists December 20. The San Francisco Half Marathon race-information page lists the half and 5K while an older registration page mentions a 10K. Both are documented in the respective records and should be rechecked.

## Further research: November 8, 2026

A second pass checked individual race and registration pages in San Francisco and nearby trail venues. Some race directories list the first date of a virtual window instead of the in-person date; Krampus Cross Country's in-person races are December 6, not December 4. The Golden Gate Trail Classic is split into Saturday and Sunday records because the distances happen on different days. The Women's Run organizer and registration pages disagree on the Mermaid Dash start and age eligibility, and Beer City's own description calls April 11, 2027 a Saturday although the date is a Sunday. These are flagged for review.

The Best Races lists several themed small-group runs at Crissy Field with the same dates and wave times. They are individually named registration listings, and may share a physical gathering; the count of records is not a count of distinct race venues or gatherings. Organizer descriptions characterize the runs as small and optionally self-timed without timing chips. Final maps, meeting points, and wave assignments are sent to participants. Preserve these caveats and avoid treating the first published wave as the only start. A listing marked for review is still an organizer-published listing, not independently verified operational status.
