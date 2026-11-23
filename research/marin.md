# Marin County

San Francisco is the index's primary focus. Marin County is the one neighbor featured as its own area. It is across the Golden Gate Bridge, SF clubs already run and race there, and much of the region's trail running happens there: the Marin Headlands, Mt. Tamalpais and the Dipsea. Everywhere else in the Bay Area stays in one `bay` area of selected listings.

## Areas

Every race, run `location_info` and neighborhood label has an area:

| Area | Meaning | Shown as |
| --- | --- | --- |
| `sf` | The City and County of San Francisco, including Treasure Island | San Francisco |
| `marin` | Marin County: its towns, unincorporated communities, and parks such as the Marin Headlands, Mt. Tamalpais, Muir Woods, Angel Island and Point Reyes | Marin County |
| `bay` | Anywhere else | Elsewhere in the Bay Area |

San Francisco is listed first in every menu, then Marin County, then everywhere else. The default view is still all areas.

## What counts as Marin

- Use the place where the run or race starts. The north end of the Golden Gate Bridge (Vista Point), the Headlands, Sausalito and Tiburon are Marin. A run that starts in San Francisco and crosses the bridge is a San Francisco run, so record the route in its notes.
- A club is shown under Marin if its `geography` names Marin (for example "Marin County") or if any of its current runs starts in Marin. An SF club with a regular Headlands run therefore appears under both areas.
- `scripts/validate.mts` lists Marin's towns and unincorporated communities in `MARIN_PLACES`. A race city or neighborhood label named for one of them must use `marin`. Parks and landmarks such as "Marin Headlands" may use `marin` without being on the list.
- Marin neighborhood labels are towns or well-known running areas, such as Mill Valley, Sausalito, Marin Headlands or Mt. Tamalpais. Add them to `data/neighborhoods.json` with `"area": "marin"` as runs need them.

## Coverage and discovery

Include established Marin clubs, regular runs that SF runners can reach, and notable races. Use `"geography": "Marin County"` for Marin-based clubs. The directory shows [clubs with Marin ties](https://mldangelo.github.io/run/?view=clubs&area=marin) and [regular runs that start in Marin](https://mldangelo.github.io/run/?view=patterns&area=marin). Each club’s audit records the sources and any unresolved questions.

### Leads from the November 9 survey

- Check [Sports Basement’s store groups](https://www.sportsbasement.com/pages/sb-x-strava-groups) for Novato runs and the [Trail Sisters Marin chapter](https://communities.trailsisters.net/groups/marin-county-california/) for a current organizer schedule.
- The [SFRC events page](https://store.sfrunco.com/pages/weekly-runs-with-sfrc) also lists independent community runs. Verify who hosts them before adding a club for those meetups.
- Look for a dated organizer listing for the Beyond Yoga and Arc’teryx store runs in Corte Madera.

**SF clubs that run in Marin:**

- San Francisco Road Runners' Sunday trail runs usually start in the Headlands, on Mt. Tam or at Phoenix Lake. The start is announced to members by email and Slack.
- Run Club SF's winter Friday hill repeats are in the Marin Headlands, starting from a "NW Golden Gate Bridge" lot. Confirm which end of the bridge before tagging it `marin`.

### Marin races to add (organizer dates)

| Date | Race | Source |
| --- | --- | --- |
| Apr 3, 2027 | Golden Gate Headlands Marathon, Half & 10K | Race Roster; Enviro-Sports |
| Apr 10, 2027 | Romancing the Island Half & 10K, Angel Island | Race Roster |
| Apr 24, 2027 | Mt. Tam Wild Boar Half & 10K | Enviro-Sports calendar |
| May 1, 2027 | Miwok 100K, Stinson Beach | RunSignup (organizer site not yet checked) |
| May 8, 2027 | Stinson Beach/Muir Woods Marathon, Half & 7 Mile | Race Roster |
| May 29, 2027 | China Camp Trail Run | Inside Trail calendar |
| Jun 13, 2027 ✓ | Dipsea Race, 8:00 AM | [dipsea.org](https://www.dipsea.org/) |

The Golden Gate Trail Classic (January 23–24) is recorded as `sf`. Its course runs through the Marin Headlands but its start venue is unconfirmed, so it stays `sf` until the organizer confirms.
