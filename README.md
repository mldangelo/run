# San Francisco running clubs — research tracker

A research project for a future directory of San Francisco running clubs. There is no website yet. The data is a **dated research snapshot**, not a live calendar: check the organizer's current event and cancellation notices before attending.

Start with the generated [upcoming schedule](research/upcoming-schedule.md), which separates individually dated listings from recurring patterns. The JSON files remain the source of truth.

## Use the tracker

Requires Python 3.9+ and no third-party packages:

```sh
python3 scripts/validate.py
python3 scripts/report.py --days 14 --include-patterns --include-unconfirmed
python3 scripts/report.py --club 'Marina'
python3 scripts/report.py --club 'Mission' --as-of 2026-11-08T12:00 --days 7
python3 scripts/export_schedule.py --days 45 > research/upcoming-schedule.md
python3 -m unittest discover -s tests -v
```

By default the report shows only dated listings in `events.json`. `--include-unconfirmed` adds unconfirmed third-party leads, and `--include-patterns` separately projects supported recurring patterns as **unconfirmed candidates**, never as published events. Patterns with missing times, ambiguous frequencies, or review flags are not projected. A generated candidate may overlap a dated event; verify the organizer page rather than assuming it is a separate run. `--as-of` uses San Francisco time if no offset is specified. An empty result means nothing was recorded in this snapshot, not that no runs exist.

## Data model

The canonical files are human-editable JSON arrays in `data/`, related by stable IDs:

- **clubs.json** — club identity, original names, broad geography and initial discovery evidence. A name match may still be uncertain.
- **sources.json** — organizer, host and third-party sources; roles, access limits and when a page was checked. A source with a null `last_checked` is a retained discovery link, not evidence of a successful current read.
- **audits.json** — one review per club, its outcome, references, unresolved issues and review date. An audit result does not imply every source was accessible or that a club is inactive.
- **schedules.json** — reported recurring patterns, with local time zone, location, source, evidence level, effective dates and review date. These are leads, not a promise that every occurrence is happening.
- **events.json** — individual dated listings with explicit source evidence, including unconfirmed leads separately labeled. Unknown locations remain explicitly unknown; cancellations can be recorded without deleting the original record. An event labeled `published` means it appeared in a source during the audit, not that it has been reconfirmed since.

The original [CSV](data/clubs.csv) and [Markdown inventory](research/club-inventory.md) are retained as the **November 8 initial discovery snapshot**. They are not automatically synchronized with the new tracker and should not be used as a current calendar. See [data and maintenance notes](research/tracking.md) and [initial research notes](research/methodology.md).
