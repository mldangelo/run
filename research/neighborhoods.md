# Neighborhoods

The site filters dated runs, regular runs and clubs by neighborhood. This note explains the model, the labels and how to assign one.

## Runs have neighborhoods; clubs inherit them

A neighborhood belongs to a **meeting place**. A pattern or dated run records it as `location_info.neighborhood`, alongside `location_info.area` (`sf`, `marin` or `bay`). A club has no neighborhood field. The site lists the neighborhoods of the club's runs, most frequent first. It counts current or upcoming recurring patterns and published dated runs. Unconfirmed leads, expired schedules and superseded schedules do not count, because they are weak evidence of where a club meets. The Clubs filter matches a club if any counted run meets in the chosen neighborhood. A club also matches an area if its stated geography or any counted run is in that area, so the Area and Neighborhood filters cannot contradict each other.

Clubs are not tagged directly because:

- many clubs meet in several places. Marina Run Club's runs are in six neighborhoods, from the Marina to Mission Bay.
- a club's name is not evidence of where it runs. Excelsior Running Club meets in Golden Gate Park, and Nob Hill Run Club meets at Fort Mason.

A club with no labeled runs appears under "Not listed". That is a research gap, not a statement that the club has no home.

Each neighborhood in the menu shows how many results it would match with the other filters kept. Neighborhoods with no matches are left out.

## Labels

`data/neighborhoods.json` lists every allowed label with its area and what it `includes`. The validator rejects a label that is not listed, or one whose area does not match the run's `location_info.area`, so a typo cannot create a stray filter option. Marin County and other Bay Area runs use the town or city. The menu groups labels as San Francisco, then Marin County, then elsewhere in the Bay Area.

The labels are curated running areas, not official boundaries. In November 2026 each meeting place was also checked against DataSF's 41 [Analysis Neighborhoods](https://data.sfgov.org/d/j2bu-swwd). The official boundaries split places that runners treat as one area:

| Place | Official neighborhood | Label |
| --- | --- | --- |
| Mission Dolores Park (the Mission boundary is Dolores Street) | Castro/Upper Market | Mission / Dolores |
| The Panhandle, Kezar Stadium, McLaren Lodge | Golden Gate Park | Golden Gate Park / Panhandle |
| Crissy Field and Sports Basement Presidio; Marina Green and Fort Mason | Presidio; Marina | Marina / Presidio |
| Ferry Building | Financial District/South Beach | Embarcadero |
| Crane Cove Park (OpenStreetMap calls it Mission Bay) | Potrero Hill | Dogpatch / Potrero |
| 900 Beach St, Aquatic Park | Russian Hill | Fisherman's Wharf / Aquatic Park |

The comparison showed the existing labels were applied consistently. They are coarser than the official neighborhoods and closer to local usage, which is what a runner choosing where to run needs.

## Assigning a label

1. Use a label only when the source identifies the place well enough: an address, landmark, intersection or a named area such as "Inner Richmond; exact start not shown". Pick the listed label whose `includes` covers it.
2. Leave `neighborhood` out when the place rotates, is unpublished, conflicts between sources, or is a rotation among different areas. Achilles rotates among Ocean Beach, Crissy Field and Lake Merritt, so it has no label.
3. If no label fits, add one to `data/neighborhoods.json` with a clear `includes`, rather than stretching a neighboring label.

Some places stay unlabeled because they cannot be pinned to one area, such as Il Parco, Uncle John's Tree, the "Northwest Golden Gate Bridge parking lot" and "REI / Mission".

## Possible next steps

- "Duboce Park" is a park, not an area. Fold it into a broader label such as "Haight / Duboce Triangle" if more runs start nearby.
- Store coordinates for each meeting place. That would allow a map and a "near me" sort, which handles boundaries better than any fixed list.
- Add neighborhoods to races, and a derived neighborhoods column to the club CSV export.
