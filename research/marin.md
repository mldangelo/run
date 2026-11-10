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

## How Marin is featured

1. **Filter and group (done).** Marin has its own option in every Area menu and its own group in the Neighborhood menu. Existing Marin races and runs are tagged `marin`.
2. **Add Marin clubs.** Add Marin's own clubs and their regular runs, using the same evidence rules as SF clubs. Use `"geography": "Marin County"`.
3. **Say so on the page.** Once Marin clubs are listed, the intro and page description can say "San Francisco & Marin", with San Francisco first.

Marin coverage should stay curated: established clubs, regular runs that SF runners can reach, and notable races. It is not meant to match the depth of the SF directory.

## Coverage survey: November 9, 2026

The index already had six Marin races and one Marin run. These were tagged `bay` until this change:

- Races: Quad Dipsea, Peacock Gap, Hark the Herald, Marin Ultra Challenge, Golden Gate Trail Run and the Bank of Marin Turkey Trot.
- Run: Progression Run Club's Turkey Trot in Mill Valley.

A survey of organizer pages found **no Marin clubs in the data**, and roughly 6–8 organizers with regular runs that can be checked. That is about a tenth of the San Francisco directory. Marin coverage would therefore lean toward trails and races.

### Candidate clubs and runs (not yet in the data)

Rows marked ✓ were rechecked on the organizer's page while this note was written. The others come from the survey and need checking before they are added.

| Organizer | Where | Published schedule | Source |
| --- | --- | --- | --- |
| Tamalpa Runners ✓ | Mill Valley, Ross, San Rafael, Novato | Sat 9am Mountain Home Inn; Sun 8:30am Ross Commons; Thu 6pm Pond Farm, San Rafael; Sat 8am Novato High School track; Tue 6:30pm track ("very unofficial") | [tamalparunners.org](https://tamalparunners.org/) |
| Marin Running Club ✓ | Tennessee Valley trailhead, Mill Valley | Tue 6pm beginner "Bunny Run"; Thu 6pm trail runs | [Meetup](https://www.meetup.com/marin-running-club/) |
| San Francisco Running Company ✓ | Store at 247 Shoreline Hwy, Mill Valley | Sat 8am Headlands trail runs, except race weekends | [Weekly runs](https://store.sfrunco.com/pages/weekly-runs-with-sfrc) |
| Sports Basement Novato | Store at 100 Vintage Way, Novato | Thu 6pm, about 3.2 mi | [Store run clubs](https://www.sportsbasement.com/pages/sb-x-strava-groups) |
| Community runs listed by SFRC | Mill Valley Depot; Conzelman Rd lot | Wed sunrise Mt. Tam; Thu 6am "Trail Thursdays" (organizer not named) | SFRC weekly runs page |
| Trail Sisters Marin | Tennessee Valley | Thursday evenings (2024 post; current page is behind a login) | [Trail Sisters](https://communities.trailsisters.net/groups/marin-county-california/) |

Caveats:

- Tamalpa calls its runs "informal group runs (that aren't always consistently meeting)". An older Tamalpa page gives different Thursday meeting places.
- Leads for Corte Madera store runs (Beyond Yoga, Arc'teryx) had no year or no current page.
- Several older Marin groups are gone or stale.

**SF clubs that run in Marin:**

- San Francisco Road Runners' Sunday trail runs usually start in the Headlands, on Mt. Tam or at Phoenix Lake. The start is announced to members by email and Slack.
- Run Club SF's winter Friday hill repeats are in the Marin Headlands, starting from a "NW Golden Gate Bridge" lot. Confirm which end of the bridge before tagging it `marin`.

### Marin races to add (organizer dates)

| Date | Race | Source |
| --- | --- | --- |
| Dec 13, 2026 | Sausalito Jingle Bell 5K | Active.com registration |
| Apr 3, 2027 | Golden Gate Headlands Marathon, Half & 10K | Race Roster; Enviro-Sports |
| Apr 10, 2027 | Romancing the Island Half & 10K, Angel Island | Race Roster |
| Apr 24, 2027 | Mt. Tam Wild Boar Half & 10K | Enviro-Sports calendar |
| May 1, 2027 | Miwok 100K, Stinson Beach | RunSignup (organizer site not yet checked) |
| May 8, 2027 | Stinson Beach/Muir Woods Marathon, Half & 7 Mile | Race Roster |
| May 29, 2027 | China Camp Trail Run | Inside Trail calendar |
| Jun 13, 2027 ✓ | Dipsea Race, 8:00 AM | [dipsea.org](https://www.dipsea.org/) |

The Golden Gate Trail Classic (January 23–24) is recorded as `sf`. Its course runs through the Marin Headlands but its start venue is unconfirmed, so it stays `sf` until the organizer confirms.
