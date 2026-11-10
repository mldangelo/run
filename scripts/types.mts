/** Canonical research records. Optional fields remain explicitly unknown.
 *  Enumerated values come from `vocabulary.mts`, their single definition. */
import type {
  ACCESS_METHODS,
  AREAS,
  AUDIT_RESULTS,
  CHECK_METHODS,
  DISTANCE_CATEGORIES,
  MEETING_POINTS,
  MERCHANDISE_AUTHORITIES,
  MERCHANDISE_AVAILABILITY,
  MERCHANDISE_LINK_KINDS,
  MERCHANDISE_RESULTS,
  MERCHANDISE_SCOPES,
  PARTICIPATION,
  RACE_FORMATS,
  RACE_STATUSES,
  REGISTRATION_STATUSES,
  RUN_STATUSES,
  SCHEDULE_EVIDENCE,
  SCHEDULE_STATUSES,
  SOURCE_ACCESS,
  SOURCE_AUTHORITIES,
} from './vocabulary.mts';

type Of<T extends readonly unknown[]> = T[number];
export type Area = Of<typeof AREAS>;
export type RunStatus = Of<typeof RUN_STATUSES>;
export type RegistrationStatus = Of<typeof REGISTRATION_STATUSES>;
export type SourceAuthority = Of<typeof SOURCE_AUTHORITIES>;
export interface LocationInfo {
  area?: Area;
  neighborhood?: string;
  directions_query?: string;
}
export interface RunDetails {
  distances?: { label: string; min_miles: number; max_miles: number | null }[];
  pace?: string;
  cost?: string;
  rsvp?: string;
  access?: string;
  beginner_friendly?: boolean;
  no_drop?: boolean;
  meeting_point?: Of<typeof MEETING_POINTS>;
  participation?: Of<typeof PARTICIPATION>;
  /** Evidence URLs, when they differ from the record's own source. */
  sources?: string[];
  /** When the details were checked, if not the record's `checked_on`. */
  checked_on?: string;
}
export interface Run {
  id: string;
  club_id: string;
  source_id: string;
  timezone: string;
  location: string;
  checked_on: string;
  notes?: string;
  /** Evidence detail for maintainers; shown collapsed, never in the feed. */
  research_notes?: string;
  run_details?: RunDetails;
  location_info?: LocationInfo;
}
export interface Club {
  id: string;
  name: string;
  user_supplied_name: string;
  geography: string;
  description: string;
}
export interface Source {
  id: string;
  url: string;
  authority: SourceAuthority;
  roles: string[];
  access: Of<typeof SOURCE_ACCESS>;
  last_checked: string | null;
  note: string;
}
export interface Audit {
  club_id: string;
  checked_on: string;
  review_due: string;
  result: Of<typeof AUDIT_RESULTS>;
  /** The first reference is the club's primary source. */
  reference_source_ids: string[];
  notes: string;
  research_log?: ResearchLogEntry[];
}
export interface ResearchLogEntry {
  checked_on: string;
  summary: string;
  next_steps: string;
  source_checks: {
    source_id: string;
    method: Of<typeof CHECK_METHODS>;
    notes: string;
  }[];
}
export interface Schedule extends Run {
  label: string;
  days: string[];
  frequency: string;
  local_time: string | null;
  evidence: Of<typeof SCHEDULE_EVIDENCE>;
  status?: Of<typeof SCHEDULE_STATUSES>;
  review_due: string;
  valid_from: string | null;
  valid_until: string | null;
}
export interface MeetingOption {
  local_time: string;
  location: string;
  details?: string;
}
export interface DatedEvent extends Run {
  title: string;
  starts_at_local: string;
  ends_at_local?: string | null;
  status: RunStatus;
  meeting_options?: MeetingOption[];
  additional_source_ids?: string[];
  needs_review?: boolean;
}
export interface Registration {
  status: RegistrationStatus;
  /** Where to register, when it differs from `source_url`. */
  url?: string;
  source_url: string;
  checked_on: string;
  review_due: string;
  access_method: Of<typeof ACCESS_METHODS>;
  notes: string;
  evidence_notes?: string;
  opens_at?: string;
  closes_at?: string;
}
export interface Race {
  /** Clubs hosting this race; the edition stays out of club-run feeds. */
  club_ids?: string[];
  /** Old group-run permalinks redirected to this canonical race edition. */
  former_event_ids?: string[];
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  city: string;
  area: Area;
  location: string;
  notes: string;
  /** Evidence detail for maintainers; shown collapsed. */
  research_notes?: string;
  status: Of<typeof RACE_STATUSES>;
  format?: Of<typeof RACE_FORMATS> | null;
  needs_review: boolean;
  registration?: Registration;
  checked_on: string;
  distances: {
    name: string;
    category: Of<typeof DISTANCE_CATEGORIES>;
    start_time: string | null;
    registration?: Registration;
    location: string | null;
  }[];
  source_url: string;
  additional_sources: string[];
}
export interface Merchandise {
  club_id: string;
  checked_on: string;
  result: Of<typeof MERCHANDISE_RESULTS>;
  notes: string;
  search_queries: string[];
  checked_urls: string[];
  links: {
    label: string;
    url: string;
    kind: Of<typeof MERCHANDISE_LINK_KINDS>;
    scope: Of<typeof MERCHANDISE_SCOPES>;
    availability: Of<typeof MERCHANDISE_AVAILABILITY>;
    authority: Of<typeof MERCHANDISE_AUTHORITIES>;
    notes: string;
    items: string[];
    evidence_urls: string[];
  }[];
}
export interface Snapshot {
  merchandise: Merchandise[];
  clubs: Club[];
  sources: Source[];
  audits: Audit[];
  schedules: Schedule[];
  events: DatedEvent[];
  races: Race[];
  neighborhoods: { name: string; area: Area; includes: string }[];
}
export interface Filter {
  period: string;
  month: string;
  day: string;
  time: string;
  status: string;
  area: string;
  distance: string;
  format: string;
  registration?: string;
  neighborhood?: string;
  beginner?: string;
  run_area?: string;
  run_distance?: string;
}
export interface ClubPlaces {
  neighborhoods: string[];
  areas: string[];
}
