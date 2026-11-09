# Tracking and maintenance

## Snapshot and coverage

Audit performed November 8, 2026, in San Francisco time. Every club in the current inventory has an audit entry. The event file is a selection of dated listings found in accessible sources, focused on November 9–22, 2026 plus some later events. Some organizer event cards were inspected using a signed-in Strava session; only event details and stable links are stored, not account information or credentials. It is **not** exhaustive across all calendars or every future occurrence. Recurring schedules and historical profiles cannot establish a dated event. Many Instagram, Strava and Meetup details were unavailable or require sign-in; source access reflects this research pass.

## Updating safely

1. Start with `audits.json`, order by `review_due`, and open the organizer's event channel in `sources.json`. Review upcoming dates, precise meeting point, registration, price and cancellation updates. Search for an organizer channel if only a third-party directory is known.
2. Add or update a source with a stable `src-` ID; keep authority and access honest. `last_checked` means a page was inspected, not that its contents are current. Capture source publication dates or the event date in notes where known; a recently visited old page is still old.
3. Update the club's audit notes and review date. Keep unknowns and conflicting accounts explicit. Do not treat a failed login, absent listing, or stale page as evidence of inactivity.
   Append a `research_log` entry to the audit: `checked_on`, `summary`, actionable `next_steps`, and `source_checks` with a `source_id`, `method`, and source-specific `notes`. The method is `page` for an inspected page, `search_result` for a search snippet or cached result, `restricted` when access was blocked, `not_checked` for a lead to investigate, or `not_recorded` if the method was not captured. The date is when the research was done, not the date the source was published. Source checks can be empty if the pass found no usable source. Keep previous entries so future research can trace what was checked and why; never include private credentials.
4. Add a `schedules.json` pattern only for an explicit source statement. Preserve the exact frequency and any date bounds; use null when time is unknown. A pattern is a lead and must not be expanded into claimed events. For special seasonal schedules set both `valid_from` and `valid_until` when known.

5. Add `events.json` records only for individually dated listings supported by a source. Use `published` for a dated listing found in a source and `unconfirmed` for a dated lead that needs verification. Set optional `needs_review: true` for an unresolved detail or conflict and explain it in notes; a fresh check alone does not clear the flag. Use `unconfirmed` when the event itself or a critical detail such as its meeting place is uncertain. Store local date/time and IANA time zone, source ID, precise location as stated, and a note when any detail is unknown or contradictory. Use a stable ID per club, source event and start; don't duplicate the same event from multiple aggregators. Record cancellation or postponement and recheck date changes instead of silently deleting history. Never infer an event's location from a different occurrence.
   Optional `run_details` holds documented distance options (`label`, `min_miles`, `max_miles`, with null maximum for open-ended distances), pace, beginner/no-drop status, cost, RSVP and access. Record the supporting HTTPS `sources` and `checked_on`; omit unknown facts rather than inventing them. The distance filters match any overlapping documented option, so discrete routes should be separate options. Optional `location_info` can record broad `area` (`sf` or `bay`), a neighborhood label listed in `data/neighborhoods.json` (see [neighborhoods.md](neighborhoods.md)) and a `directions_query` for a sufficiently precise meeting point. Leave these fields absent when location is unclear or rotates, and do not geocode a guessed address.

6. Run `npm run generate` to rebuild `feed.xml` and `data/clubs.csv`, then `npm run verify`. Inspect `python3 scripts/report.py --club 'name'` and, if needed, regenerate the schedule view below. Check that each source supports the changed claim before opening a pull request.

The initial `review_due` of November 22 is a reminder to recheck, **not** a guarantee that any event remains valid until then. Faster-changing club events should be checked closer to the run. Every Monday, the workflow opens or updates a *Research review due* issue. `python3 scripts/review_status.py --within 7` generates the same queue locally; `--as-of YYYY-MM-DD` makes a historical or future run reproducible. The queue includes:

- Club audits and active patterns due within seven days. Expired or superseded patterns do not create reminders, though a club's own audit can still be due.
- Published and unconfirmed runs on the local calendar date through 14 days ahead, if flagged `needs_review`, unconfirmed, missing a check date, or the check is or will be 14 days old by the earlier of the run or next weekly reminder. Open the linked source and review cancellations, changed start times and meeting points, and other details. A stale check is a prompt, not proof of a change; a recent check is not a guarantee or a reason to clear an unresolved flag.
- Clubs without a published dated run in that 14-day window. These are coverage gaps, not evidence that a club is inactive. The queue links recorded channels and identifies their authority and access limitations. Search for other current organizer sources as needed; never promote a recurring pattern into a dated event without evidence.
- Scheduled races within 30 days (or in progress) that are flagged or whose source check becomes 30 days old by the earlier of race day or the next weekly reminder. See `research/races.md` for details.

The windows are independent of `--within`, which changes only the club review horizon. The issue stays open while any of these queues has entries, including coverage gaps. It reads only committed data, never contacts sources or detects changes, and never edits data. Recheck sources and record the evidence before updating the snapshot; consider a same-day cancellation check before featuring a run. No scraping or automated refresh is enabled.

## Status vocabulary

- `dated_event_found`: at least one dated event was captured during this pass; not a completeness or real-time guarantee.
- `pattern_found`: only a recurring pattern was recorded, with its provenance and limits.
- `no_current_details`: no usable pattern or dated event was captured; the club may still be active.
- `identity_unresolved`: the supplied name has not been matched reliably to a particular organization.

Club-controlled sources are preferred for schedule and location. Host event pages are strong for a hosted event. Directory claims are useful leads but can be stale, omit exceptions, merge distinct groups or mistake East Bay for SF. Keep a link to all evidence, and separate organizer-controlled update channels from secondary discovery sources. Review each claim before publication rather than copying whole directories.

## Generated schedule view

Run `python3 scripts/export_schedule.py --days 45 > research/upcoming-schedule.md` to refresh the human-readable view after editing the JSON. The view is generated and may go stale immediately; the JSON records and source pages remain authoritative. `python3 scripts/report.py --include-patterns --include-unconfirmed` can show possible dated candidates separately from published listings, but it cannot know about cancellations or exceptions. It skips ambiguous frequencies, missing times, and patterns flagged for review. Never turn those candidates into confirmed records without a dated source.
