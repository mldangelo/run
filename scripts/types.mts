/** Canonical research records. Optional fields remain explicitly unknown. */
export type Area = 'sf' | 'marin' | 'bay';
export type RunStatus = 'published' | 'unconfirmed' | 'cancelled' | 'postponed';
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
  meeting_point?: 'listed' | 'pending' | 'after_registration' | 'members_only';
  participation?:
    | 'open'
    | 'registration_required'
    | 'approval_required'
    | 'members_only'
    | 'waiver_required';
  sources?: string[];
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
/** An editorial suggestion. Facts such as time, place and sources stay on
 *  the event it points to. */
export interface CommunityPick {
  event_id: string;
  headline: string;
  reason: string;
  selected_on: string;
  review_due: string;
}
export interface Club {
  id: string;
  name: string;
  user_supplied_name: string;
  geography: string;
  description: string;
  source_url: string | null;
  source_type: string;
  research_status: string;
  checked_on: string;
}
export interface Source {
  id: string;
  url: string;
  authority: string;
  roles: string[];
  access: string;
  last_checked: string | null;
}
export interface Audit {
  club_id: string;
  checked_on: string;
  review_due: string;
  result: string;
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
    method:
      | 'page'
      | 'search_result'
      | 'restricted'
      | 'unavailable'
      | 'not_checked'
      | 'not_recorded';
    notes: string;
  }[];
}
export interface Schedule extends Run {
  label: string;
  days: string[];
  frequency: string;
  local_time: string | null;
  evidence: string;
  status?: 'active' | 'needs_review' | 'superseded';
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
  source_type: string;
  status: RunStatus;
  meeting_options?: MeetingOption[];
  additional_source_ids?: string[];
  needs_review?: boolean;
}
export type RegistrationStatus =
  | 'open'
  | 'not_yet_open'
  | 'closed'
  | 'sold_out'
  | 'waitlist'
  | 'unknown';
export interface Registration {
  status: RegistrationStatus;
  url?: string;
  source_url: string;
  checked_on: string;
  review_due: string;
  access_method: 'web' | 'http' | 'browser';
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
  status: 'scheduled' | 'cancelled' | 'postponed';
  format?: 'small_group' | 'kids' | 'relay' | null;
  needs_review: boolean;
  registration?: Registration;
  checked_on: string;
  distances: {
    name: string;
    category: string;
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
  result:
    | 'store_found'
    | 'merch_info_only'
    | 'lead_only'
    | 'no_public_link_found';
  notes: string;
  search_queries: string[];
  checked_urls: string[];
  links: {
    label: string;
    url: string;
    kind: string;
    scope: string;
    availability: string;
    authority: string;
    notes: string;
    items: string[];
    evidence_urls: string[];
  }[];
}
export interface Snapshot {
  merchandise: Merchandise[];
  picks: CommunityPick[];
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
