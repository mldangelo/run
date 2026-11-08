# San Francisco running clubs

A research inventory for a future directory of San Francisco running clubs. This repository contains **research only**: there is no website or application yet.

Start with [the readable club inventory](research/club-inventory.md). [CSV](data/clubs.csv) and [JSON](data/clubs.json) contain the same records for filtering and later use. The snapshot was researched on November 8, 2026; it is a starting point, not a complete census or a live calendar.

## What is in scope

Groups that run in San Francisco, including neighborhood social crews, organized racing teams, running stores' group runs, and communities that combine running with other activities. User-named regional organizations are retained even if their regular SF presence is unverified. Separate groups with similar names remain separate until evidence supports a merge.

## Reading the data

- `user_supplied_name` preserves the name given in the initial request; a semicolon can separate multiple names that appear to refer to one group. An empty value identifies a discovery added during research.
- `source_url` is the source used to identify the group or support its note. A club-owned site or event is preferable, but some records rely on a directory or older roundup. A linked page is not necessarily a current event calendar.
- `identified` means a plausible source was found, **not** that the club or its schedule is currently active. `historical_evidence` means the citation describes a past event or historical roundup; `lead_only` means no reliable match was found in this pass. Names explicitly marked as likely matches need confirmation.
- `checked_on` is the date of this research pass. Blank source fields represent unknowns, not inactive groups.
- `geography` is a broad research classification, not a verified meeting point. Details, membership, accessibility, costs, days and times must be checked against the club's own current event page before publication.

See [research notes](research/methodology.md) for sources, open questions, and the next audit steps. Contributions should include direct source links and dates; don't infer that a group is defunct from a missing post or inaccessible profile.
