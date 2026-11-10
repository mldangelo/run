/** Allowed values for every enumerated research field, defined once.
 *  The validator checks data against these lists and `types.mts` derives
 *  its types from them, so adding a value here updates both. */

/** San Francisco is primary; Marin County is featured; `bay` is elsewhere. */
export const AREAS = ['sf', 'marin', 'bay'] as const;

export const SOURCE_AUTHORITIES = ['club', 'host', 'secondary'] as const;
export const SOURCE_ACCESS = [
  'public',
  'restricted',
  'login_for_events',
  'unknown',
] as const;

export const AUDIT_RESULTS = [
  'identity_unresolved',
  'no_current_details',
  'pattern_found',
  'dated_event_found',
] as const;
export const CHECK_METHODS = [
  'page',
  'search_result',
  'restricted',
  'unavailable',
  'not_checked',
  'not_recorded',
] as const;

export const SCHEDULE_STATUSES = [
  'active',
  'needs_review',
  'superseded',
] as const;
export const SCHEDULE_EVIDENCE = [
  'organizer_pattern',
  'secondary_pattern',
] as const;
/** What a runner needs to know about joining a run (`run_details`). */
export const MEETING_POINTS = [
  'listed',
  'pending',
  'after_registration',
  'members_only',
] as const;
export const PARTICIPATION = [
  'open',
  'registration_required',
  'approval_required',
  'members_only',
  'waiver_required',
] as const;
export const RUN_STATUSES = [
  'published',
  'unconfirmed',
  'cancelled',
  'postponed',
] as const;

export const RACE_STATUSES = ['scheduled', 'cancelled', 'postponed'] as const;
export const RACE_FORMATS = ['small_group', 'kids', 'relay'] as const;
export const DISTANCE_CATEGORIES = [
  '5k',
  '10k',
  'half',
  'marathon',
  'ultra',
  'other',
] as const;
export const REGISTRATION_STATUSES = [
  'open',
  'not_yet_open',
  'closed',
  'sold_out',
  'waitlist',
  'unknown',
] as const;
export const ACCESS_METHODS = ['web', 'http', 'browser'] as const;

export const MERCHANDISE_RESULTS = [
  'store_found',
  'merch_info_only',
  'lead_only',
  'no_public_link_found',
] as const;
export const MERCHANDISE_LINK_KINDS = [
  'store',
  'collection',
  'order_form',
  'merch_info',
] as const;
export const MERCHANDISE_SCOPES = [
  'club',
  'parent_organization',
  'host_brand',
  'other_chapter',
] as const;
export const MERCHANDISE_AVAILABILITY = [
  'catalog_visible',
  'membership_only',
  'coming_soon',
  'sold_out',
  'closed',
  'not_verified',
] as const;
export const MERCHANDISE_AUTHORITIES = ['club', 'vendor', 'secondary'] as const;
