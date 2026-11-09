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
  run_details?: RunDetails;
  location_info?: LocationInfo;
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
}
export interface Race {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  city: string;
  area: Area;
  location: string;
  notes: string;
  status: 'scheduled' | 'cancelled' | 'postponed';
  format?: 'small_group' | null;
  needs_review: boolean;
  checked_on: string;
  distances: {
    name: string;
    category: string;
    start_time: string | null;
    location: string | null;
  }[];
  source_url: string;
  additional_sources: string[];
}
export interface Snapshot {
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
  neighborhood?: string;
  beginner?: string;
  run_area?: string;
  run_distance?: string;
}
export interface ClubPlaces {
  neighborhoods: string[];
  areas: string[];
}
