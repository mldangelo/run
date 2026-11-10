# Club merchandise research

[`data/merchandise.json`](../data/merchandise.json) is the source of truth for club shops, order forms, membership-only gear, unresolved leads and searches that found no public link. Each club has one record with its `result`, the searches run, the pages checked and any `links`; read the JSON for per-club details rather than a copy here. The first pass, on November 9, 2026, searched the 72 clubs then listed; clubs added later have no record until they are searched. It cannot establish that every club with gear has been found.

A store being indexed does **not** mean orders are open. Closed, sold-out and coming-soon destinations stay in the index with their observed state. Organization-wide and host-brand shops are labeled with their `scope`.

## Method and maintenance

- Start with the exact club name plus merch/shop/shirt/apparel terms. `search_queries` records at least one actual query per club, not every search performed. `checked_urls` lists public pages or destinations opened, including failed fetches.
- Prefer links from the club or parent organization. Each indexed destination has `evidence_urls`, `authority` (club, vendor or secondary), a scope, observed availability, example items and a note. A vendor catalog is evidence of that catalog, not proof of current local endorsement.
- Search excerpts can help discover stores, but some sites only render in a browser; open the destination and record what it showed, including closed stores and failed lookups, in that record's notes.
- `catalog_visible` means products were readable, not that any size is in stock. `membership_only` means the page states a membership benefit or restriction. `coming_soon`, `sold_out` and `closed` preserve explicit observed labels. `not_verified` means the public evidence does not establish availability. Never infer current sales from these records.
- A generic directory “Club Store” button, general sporting-goods catalog, race shirt, giveaway, resale listing, or store for a similarly named club does not establish a club shop. National stores and other chapters remain separate; FRC Austin is only a lead for SF research.
- No purchases, form submissions, private groups or signed-in account data were used. Social-only drops and inaccessible/private ordering channels remain unknown. Published dates are retained in notes when material; `checked_on` is the research date, not a drop date or freshness guarantee.
- Recheck official navigation and the destination before using a link in the site. Resolve identity leads and record new stock/closure evidence instead of silently removing conflicts. Add a new dated record or refresh this snapshot when research is repeated.
- The site, RSS feed and club CSV do not use this index; it is deployed only as a raw data file. Run `npm run verify` after edits.
