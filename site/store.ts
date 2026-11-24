/* The loaded listings and their lookups. app.ts's loadData fills this one
   object, since modules cannot reassign each other's bindings. */
import type {
  Club,
  ClubPlaces,
  DatedEvent,
  Neighborhood,
  Race,
  Schedule,
  SiteAudit,
  SiteSource,
} from '../scripts/types.mts';

export const store = {
  clubs: [] as Club[],
  events: [] as DatedEvent[],
  schedules: [] as Schedule[],
  sources: [] as SiteSource[],
  audits: [] as SiteAudit[],
  races: [] as Race[],
  neighborhoods: [] as Neighborhood[],
  clubById: new Map<string, Club>(),
  sourceById: new Map<string, SiteSource>(),
  auditByClub: new Map<string, SiteAudit>(),
  patternsByClub: new Map<string, Schedule[]>(),
  placesByClub: new Map<string, ClubPlaces>(),
  upcomingByClub: new Map<string, number>(),
};
export const clubName = (id: string) => store.clubById.get(id)?.name || id;
export const clubNeighborhoods = (club: { id: string }) =>
  store.placesByClub.get(club.id)?.neighborhoods || [];
