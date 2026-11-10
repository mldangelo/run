# Race research and maintenance

`data/races.json` is a manually researched starting index of San Francisco races, Marin County races and selected Bay Area events. It is not exhaustive, live, or an assertion that registration is open. Races are separate from club events and are not included in the club-run RSS feed.

Each record represents one race edition or an explicitly labeled multi-day weekend. Write `notes` for runners: the facts they need and what to check. Keep source-by-source comparisons in the optional `research_notes`, which the race dialog shows collapsed. It has a stable ID, date and optional end date, city, broad area (`sf`, `marin` or `bay`; see [marin.md](marin.md)), general location, distances with categories, optional individual start times and locations, an HTTPS primary source, optional additional sources, checked date, status, review flag, and notes. A `needs_review` flag makes discrepancies or incomplete edition details visible in the index. Dates and times are local to the Bay Area. Null times mean unknown; do not invent midnight or use a prior year’s schedule. List only distances and start times supported by a source and describe weekend or event-specific dates in notes.

The optional `format: small_group` identifies listings whose source describes a small-group run. Records without the field are not classified; the site's other/unclassified filter does not promise a conventional timed race. Use the notes to explain self-timing and potential shared gatherings, and do not merge separate registrations without evidence.

## Updating

1. Start with organizer or organizer-hosted registration pages. Use directories such as [SF Runs](https://www.sfruns.com/) and [Races Near](https://racesnear.com/bay-area/) to discover leads, then check the organizer; label any secondary evidence or discrepancies in notes and include the relevant links.
2. Recheck the date, location, distance and starts for the correct edition. Explicitly distinguish an event start from packet pickup or an entire weekend. Retain nulls for unknown starts; do not assume a race has happened just because it is annual.
3. Update status when cancelled or postponed, preserve stable IDs, update the check date, and record uncertainty or access limitations. Check registration and costs on the organizer’s page rather than assuming they stay current.
4. Run `npm run verify` and regenerate the feed and clubs CSV with `npm run generate` when data changes; races are intentionally excluded from that feed. Review the race view at desktop and mobile sizes before merging.

The weekly research reminder includes scheduled races starting in the next 30 days (and races in progress) if they are flagged `needs_review` or their check is, or will become, at least 30 days old by the race start date or next weekly reminder, whichever comes first. For a race already in progress, it checks the age as of today. This lookahead catches checks that would become stale before race day between weekly reminders. It reports each race once and gives both reasons when applicable. Recheck the current edition against the organizer before updating `checked_on`; a fresh check alone does not clear an unresolved conflict. Cancelled, postponed, and finished races are excluded from this reminder. The reminder uses the San Francisco calendar date and does not contact sources automatically.

The initial research was checked November 8, 2026. DSE’s organizer schedule lists Rainbow Falls Festivus for December 13 while SF Runs lists December 20, and the San Francisco Half Marathon race-information page lists the half and 5K while an older registration page mentions a 10K. The review pass below settled both.

## Further research: November 8, 2026

A second pass checked individual race and registration pages in San Francisco and nearby trail venues. Some race directories list the first date of a virtual window instead of the in-person date; Krampus Cross Country's in-person races are December 6, not December 4. The Golden Gate Trail Classic is split into Saturday and Sunday records because the distances happen on different days. The Women's Run organizer and registration pages disagree on the Mermaid Dash start and age eligibility, and Beer City's own description calls April 11, 2027 a Saturday although the date is a Sunday. These are flagged for review.

The Best Races lists several themed small-group runs at Crissy Field with the same dates and wave times. They are individually named registration listings, and may share a physical gathering; the count of records is not a count of distinct race venues or gatherings. Organizer descriptions characterize the runs as small and optionally self-timed without timing chips. Final maps, meeting points, and wave assignments are sent to participants. Preserve these caveats and avoid treating the first published wave as the only start. A listing marked for review is still an organizer-published listing, not independently verified operational status.

## Review pass: November 8, 2026

Every record flagged `needs_review` was rechecked against all of its organizer's public channels, not only the page first cited: the organizer's website and event pages, FAQs, other registration platforms they link to, and dated event posts. A flag was cleared only when a current-edition organizer source settled the specific question and no other organizer source contradicted it. Directory listings never cleared a flag, and text left over from a previous edition, such as a stale year in a description, did not count as a contradiction when the same page's current-edition header and schedule agreed. This cleared six flags and left 35:

- **Cleared:** DSE Rainbow Falls Festivus (DSE's event page, schedule and registration all give December 13 and list December 20 as "No DSE Run"); SF Turkey Trot (the organizer's site and registration both show 2026); Hunter S. Thompson Fear & Loathing and Woodside Ramble (their organizer sources agree on the date and starts); Kiwanis Resolution Run and RunThrough Crissy Field (current-edition dates and starts agree, with only stale text from earlier editions).
- **Answered, still flagged:** the San Francisco Half has no 10K in 2027, but its race-information and registration pages give different start times, so both starts are now blank. Krampus's organizer page confirms staggered 8:00, 8:05 and 8:10 starts, but its registration cards still show 8:00 for every distance.
- **The Best Races:** the organizer's San Francisco calendar lists one run per Saturday and leaves out the second registration on each date, which suggests the paired listings share one gathering, but the organizer doesn't say so. Meeting points are emailed to registrants by the Wednesday before each run, so these records stay flagged until the organizer confirms.

When two organizer sources give different start times, the record keeps a time only when the more specific organizer statements agree with each other, and notes the conflict. Otherwise the start is left blank.

## Open organizer questions

These questions would settle the remaining flags. Contacts were taken from each organizer's own site on November 8, 2026. When an organizer answers, update the record, clear its flag if nothing else is in doubt and remove its row here.

| Race | Question | Contact |
| --- | --- | --- |
| The Best Races (19 listings) | On each Saturday with two San Francisco registrations, is it one shared gathering? Is the March 20 Sunrise Marathon ZIP (92149) an error, and is April 10 a Sloth Run or a bagel run? | info@thebestraces.com |
| Finding Kids 5K with LuxFit | Does the November 15, 2026 5K start at 9:00 AM or at 9:45 AM after check-in and remarks? | info@findingkids.org |
| Silicon Valley Turkey Trot | Is the start line at W Santa Clara Street and N First Street, or just west of Market Street? | [RunSignup contact form](https://runsignup.com/Race/Info/CA/SanJose/SiliconValleyTurkeyTrot#contactFormSection) |
| Krampus Cross Country | Do the 5K and Naughty Nine Miler start at 8:05 and 8:10 AM, or at 8:00 AM as the registration cards show? | [Sasquatch Racing contact](https://sasquatchracing.com/contacts/) |
| Hark the Herald | What time do the half marathon and 10K start on Angel Island after the 8:00 AM ferries leave Tiburon? | info@envirosports.com |
| DSE Stern Grove 4 Mile | Is the start at Wawona and 33rd Avenue, or at the mini-park at 34th Avenue? | [DSE contact](https://dserunners.com/contact-us/) |
| Brazen New Year's Eve | Is the 8:55 AM race a 13K, with the 10K labels on the race-info page out of date? | [Brazen contact](https://brazenracing.com/contact/) |
| Golden Gate Trail Classic (2 records) | Where does each distance start on January 23 and 24, 2027? | [Spartan support](https://spartanrace.zendesk.com/hc/en-us/requests/new) |
| San Francisco Half Marathon | Do the half and 5K start at 7:45 and 8:20 AM, or at 8:00 and 7:50 AM? | raceinfo@sanfranciscohalfmarathon.org |
| Marin Ultra Challenge | Does the 50-mile start at 6:00 or 6:30 AM, and does race-morning pickup open at 5:30 or 6:00? | [Inside Trail contact](https://insidetrail.com/contact/) |
| Pi Day 3.14 Mile Run | Does the run start at the Conservatory of Flowers or along the Embarcadero? | [RunSignup contact](https://runsignup.com/Race/piday314/Page/ContactUs) |
| Beer City San Francisco | Is the race on Sunday, April 11, 2027? Who organizes it, and are there age rules? | [RunSignup contact](https://runsignup.com/Race/BeerCitySanFrancisco/Page/ContactUs) |
| Women's Run San Francisco | Does the Mermaid Dash start at 9:30 AM for all ages or at 9:55 AM for ages 6–12? | info@mermaidseries.com |
| San Jose Half Marathon (2 records) | What are the kids course lengths, where does the Speed City Mile start, and are Race Roster's June 6–7 times errors? | info@runlocalevents.com |
| San Francisco Marathon | Does the 10K start at 7:00 or 7:15 AM, and does the full marathon start at Market or Mission? | [SF Marathon contact](https://www.thesfmarathon.com/contact/) |

## Registration snapshots: November 9, 2026

Registration is independent of the race's `scheduled`, `cancelled` or `postponed` status. The race list and detail dialog now show availability, and the race filters can select it. An upcoming race is not necessarily accepting entries.

Optional `registration` objects on a race and its individual `distances` use these fields:

- `status`: `open`, `not_yet_open`, `sold_out`, `waitlist`, `closed` or `unknown`. `waitlist` means an application or early-access list, not a confirmed entry; explain which kind in `notes`. `sold_out` requires explicit capacity evidence. A closed registration page alone does not establish a sellout.
- `url`: optional public registration or organizer URL. `source_url`: the exact public page or public storefront response actually inspected for the claim.
- `checked_on`, `access_method` (`web`, `http` or `browser`), `notes` and `review_due`: observation date, retrieval method, practical qualifications and next check. Optional `evidence_notes` retains technical retrieval findings and source conflicts without displaying research mechanics in the race dialog. Recheck within 14 days at most, sooner for an imminent opening or closing. A failed request does not renew the race's or registration's check date.
- Optional `opens_at` and `closes_at`: an explicit local Pacific date (`YYYY-MM-DD`) or date and time (`YYYY-MM-DDTHH:MM`). Date-only values retain unknown times. Store neither an inferred midnight nor a pricing, packet-mailing, transfer or deferral deadline as a registration deadline. Record online versus race-day limits and category-specific exceptions in the notes.

A distance's complete registration object takes precedence over the race default; it does not merge individual fields from the default. The list reports “Varies by distance” when selected distances have different availability. A specific registration filter matches only options that also satisfy the distance and time filters. The dialog retains all options and their qualifications, including through a shared URL.

An absent object remains unverified. Inspected pages that do not establish availability use `unknown`. The site returns to “Check registration” after `review_due`, once a known opening arrives without a new check, or once an open-entry closing deadline passes. From race day, an `open`, `waitlist` or `not_yet_open` snapshot counts only while a published `closes_at` is still ahead, because starts may already have passed. An `open` snapshot whose `opens_at` is still ahead is contradictory and shows as “Check registration”. It does not infer that registration opened, remained open or closed. Past and cancelled/postponed races show no registration status or prompt. These are display rules; they do not contact organizers or refresh the data.

Validation rejects fields outside this list (so a misspelled `closes_on` cannot be silently ignored), an empty `url`, a `closes_at` after the race ends, and statuses that contradict their dates when checked: `open` with a later `opens_at`, `not_yet_open` with an earlier `opens_at`, and `open` or `waitlist` with an earlier `closes_at`. The weekly review reminder lists races within 90 days whose registration snapshot is due by the next reminder, alongside the 30-day race-edition checks.

This pass attempted the primary pages for all 87 race records using public HTTP HTML reads. There were 79 successful record-level responses and eight HTTP 403 failures; repeated organizer URLs are not independent sources. Organizer-linked registration pages were then inspected, including the Berkeley Race Roster page through HTTP and the web reader. The resulting 81 registration snapshots cite 77 distinct supporting URLs; six editions retain unverified registration. Availability remains unknown for 36 inspected editions whose public pages did not settle it. No existing race-detail check dates or review flags were renewed or cleared by this registration-only pass.

Examples of the distinctions preserved:

- SF Turkey Trot explicitly reports full capacity and no race-day registration, so it is `sold_out`. Quad Dipsea explicitly reports registration closed October 1; its discussion of existing wait-list invitations does not establish that new applications are open.
- Fear & Loathing and Woodside Ramble explicitly offer waitlists for sold-out distances. Woodside's waitlist is shown only through December 16, when its waitlist movement ends, although UltraSignup stays open until December 18. Golden Gate Half instead offers a 2027 early-access mailing list before public entries open, so it is `not_yet_open` with no opening date; past finishers get separate private access.
- Beer City publishes a December 1, 2026, 1:13 PM Pacific opening. Its distance-specific closing times stay separate: the Beer Stroll closes at 9:20 AM and the Beer Mile at 11:00 AM. Concord has different standard, charity, family-pack and kids deadlines; no universal cutoff is implied.
- The Palo Alto storefront's raw HTML includes hidden sold-out template text, while its public product JSON reports all five variants available. The JSON is cited for the open status. Generic UltraSignup template text about registration opening is likewise not used to establish an opening date.
- Kiwanis's platform and organizer give different online closing times. The conflict is retained in registration notes and the structured closing time is omitted. Race-day entry remains a separate qualification.

For the six unverified editions, retry their own registration platforms before assigning a status: Silicon Valley Turkey Trot, Oakland Marathon, the Saturday and Sunday San Jose Half listings, and the Saturday 5K and Sunday San Francisco Marathon listings. Primary HTTP retrieval failures are access-method results, not proof that these events or their registrations are unavailable. The web reader exposed the Silicon Valley and Sunday SF Marathon organizer pages, but their generic registration links did not verify distance inventory in this pass. For inspected `unknown` entries, follow the registration URL and resolve the missing distance/wave inventory; for known statuses, recheck the cited page by the recorded review date and again before entering.
