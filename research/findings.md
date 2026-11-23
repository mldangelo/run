# Applying research findings

A research pass often covers many clubs and races at once. Instead of editing several JSON files by hand, write what you checked as a findings file and apply it with `npm run apply-findings`. The tool turns each finding into the source, audit, run, pattern, club and race updates that [tracking](tracking.md#updating-safely) and [races](races.md) describe, then validates the whole snapshot. It never contacts sources: findings must already be reviewed evidence.

## Workflow

1. Gather evidence: organizer pages, and optionally the [dry-run source refresher](source-refresh.md). One researcher or agent per club group; each writes its own findings file and edits no data.
2. Preview: `npm run apply-findings -- --findings A.json --findings B.json`. It prints every change, warnings and validation errors, and writes nothing.
3. Resolve warnings: possible duplicate runs (same club and day), runs outside the window (`--date` through `--window` days, 21 by default) and review flags cleared without a `why`. Fix the findings, or pass `--allow-warnings` once you have checked each one.
4. Apply with `--write`. Nothing is written unless the resulting snapshot passes `npm run validate`. Then run `npm run verify` and review the diff record by record before opening a pull request.

`--date` is the research date (San Francisco time by default). It becomes the new research log entry's date, the audit's `checked_on`, and the check date of anything marked `verified: true`.

## Format

```json
{
  "clubs": [
    {
      "club_id": "sf-mission-fun-runs",
      "summary": "What this pass found, in one or two sentences.",
      "next_steps": "The next check and when.",
      "review_due": "2026-11-30",
      "result": "dated_event_found",
      "audit_notes": "Optional replacement for the audit's notes.",
      "club_description": "Optional replacement for the club's description.",
      "source_checks": [
        { "url": "https://www.meetup.com/missionfunruns/", "method": "page", "notes": "What the page showed." },
        { "url": "https://www.meetup.com/missionfunruns/events/1/", "method": "page", "notes": "Cached copy.", "observed_on": "2026-11-22" }
      ],
      "new_sources": [
        { "url": "https://www.meetup.com/missionfunruns/events/1/", "authority": "club", "roles": ["event"], "access": "public" }
      ],
      "events": [
        { "id": "evt-…", "verified": true, "set": { "location": "…" }, "unset": ["needs_review"], "why": "The event page now names the bar." },
        { "new": { "title": "Mission 5K", "starts_at_local": "2026-11-30T18:30", "status": "unconfirmed", "location": "Meeting point to be announced", "notes": "…", "source_url": "https://www.meetup.com/missionfunruns/events/1/", "additional_source_urls": [] } }
      ],
      "schedules": [{ "id": "sch-…", "verified": true, "set": { "review_due": "2026-12-07" }, "source_url": "https://…" }],
      "new_schedules": [{ "label": "Monday run", "days": ["monday"], "frequency": "weekly", "local_time": "18:30", "location": "…", "evidence": "organizer_pattern", "review_due": "2026-12-07", "source_url": "https://…" }]
    }
  ],
  "races": [
    { "race_id": "…", "verified": true, "set": { "notes": "…" }, "registration": { "status": "open", "source_url": "https://…", "checked_on": "2026-11-23", "review_due": "2026-12-07", "access_method": "web", "notes": "…" }, "why": "…" },
    { "new": { "id": "…", "title": "…", "date": "…" } }
  ]
}
```

- Every club finding adds one research log entry with its `source_checks`. A `page` check sets that source's check date; add `observed_on` when the page was fetched before the research date. Use the method vocabulary in [tracking](tracking.md#updating-safely).
- Cite sources by exact URL. A URL not yet in `data/sources.json` must be listed in that club's `new_sources`. Checked and cited sources are added to the audit's `reference_source_ids`.
- `set` replaces whole fields (send all of `run_details`, a race's `distances` or a `registration`), and `unset` removes them. The tool maintains `id`, `club_id`, `source_id` and `checked_on`; a schedule's `source_url` moves it to another source.
- `verified` means the record's own source was read and still supports it: `true` for the research date, or the date of an earlier read. Without it, a record keeps its check date even when other fields change.
- New runs, sources and patterns get IDs derived from their club, source URL and start or label, so applying the same finding twice is reported as a duplicate instead of adding a copy. New races keep the `id` you give them and are placed in date order.
