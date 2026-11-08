# Tracking and maintenance

## Snapshot and coverage

Audit performed November 8, 2026, in San Francisco time. Every one of the 70 original records has an audit entry. The event file is a selection of explicitly dated events found in accessible sources, focused on the coming week plus some later events. It is **not** exhaustive across all calendars or every future occurrence. Recurring schedules and historical profiles cannot establish a dated event. Many Instagram, Strava and Meetup details were unavailable or require sign-in; source access reflects this research pass.

## Updating safely

1. Start with `audits.json`, order by `review_due`, and open the organizer's event channel in `sources.json`. Review upcoming dates, precise meeting point, registration, price and cancellation updates. Search for an organizer channel if only a third-party directory is known.
2. Add or update a source with a stable `src-` ID; keep authority and access honest. `last_checked` means a page was inspected, not that its contents are current. Capture source publication dates or the event date in notes where known; a recently visited old page is still old.
3. Update the club's audit notes and review date. Keep unknowns and conflicting accounts explicit. Do not treat a failed login, absent listing, or stale page as evidence of inactivity.
4. Add a `schedules.json` pattern only for an explicit source statement. Preserve the exact frequency and any date bounds; use null when time is unknown. A pattern is a lead and must not be expanded into claimed events. For special seasonal schedules set both `valid_from` and `valid_until` when known.
5. Add `events.json` records only for dated occurrences actually published by a source. Store local date/time and IANA time zone, source ID, precise location as published, and a note when any detail is unknown or contradictory. Use a stable ID per club, source event and start; don't duplicate the same event from multiple aggregators. Record cancellation or postponement and recheck date changes instead of silently deleting history. Never infer an event's location from a different occurrence.
6. Run `python3 scripts/validate.py`; inspect `python3 scripts/report.py --club 'name'`. Check that the source supports every changed claim and that local and remote Git histories are current before publishing the update.

The initial `review_due` of November 22 is a reminder to recheck, **not** a guarantee that any event remains valid until then. Faster-changing club events should be checked closer to the run. Consider a weekly manual sweep and a same-day cancellation check when the site eventually exists. No scraping, automated refresh or scheduled monitor has been enabled.

## Status vocabulary

- `dated_event_found`: at least one dated event was captured during this pass; not a completeness or real-time guarantee.
- `pattern_found`: only a recurring pattern was recorded, with its provenance and limits.
- `no_current_details`: no usable pattern or dated event was captured; the club may still be active.
- `identity_unresolved`: the supplied name has not been matched reliably to a particular organization.

Club-controlled sources are preferred for schedule and location. Host event pages are strong for a hosted event. Directory claims are useful leads but can be stale, omit exceptions, merge distinct groups or mistake East Bay for SF. Keep a link to all evidence, and separate organizer-controlled update channels from secondary discovery sources. Review each claim before publication rather than copying whole directories.
