#!/usr/bin/env python3
"""Check the integrity of the research snapshot. No network access required.

``validate(data)`` returns every problem it finds as a readable message naming
the file and record, for example ``events.json evt-123: unknown source_id
'src-x'``. Running this file checks ``data/*.json``, prints any problems to
stderr and exits 1, or prints a short summary and exits 0.

The checks are deterministic: nothing is compared with today's date.
"""
from __future__ import annotations

import json
import math
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Collection, Dict, List, Optional
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATASETS = ('clubs', 'sources', 'audits', 'schedules', 'events', 'races', 'neighborhoods')

WEEKDAYS = ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
RESEARCH_STATUSES = {'identified', 'historical_evidence', 'lead_only'}
SOURCE_AUTHORITIES = {'club', 'host', 'secondary'}
SOURCE_ACCESS = {'public', 'restricted', 'login_for_events', 'unknown'}
AUDIT_RESULTS = {'identity_unresolved', 'no_current_details', 'pattern_found', 'dated_event_found'}
SCHEDULE_EVIDENCE = {'organizer_pattern', 'secondary_pattern'}
SCHEDULE_STATUSES = {'active', 'needs_review', 'superseded'}
EVENT_STATUSES = {'published', 'unconfirmed', 'cancelled', 'postponed'}
EVENT_SOURCE_TYPES = {'club', 'host', 'secondary'}
RACE_AREAS = {'sf', 'bay'}
RACE_FORMATS = {None, 'small_group'}
RACE_STATUSES = {'scheduled', 'cancelled', 'postponed'}
DISTANCE_CATEGORIES = {'5k', '10k', 'half', 'marathon', 'ultra', 'other'}
MAX_RACE_SPAN_DAYS = 31
# A sentence ends at ., ! or ? followed by whitespace. Short fragments such as
# 'TBD.' may legitimately recur, so only longer sentences count as repeats.
SENTENCE_BREAK = re.compile(r'(?<=[.!?])\s+')
MIN_REPEATED_SENTENCE = 20

# Exact shapes. The site slices these strings (for example
# starts_at_local[0:10] and [11:16]), so lenient parsing is not enough.
# Each shape is (pattern, strptime format, description for messages).
DATE_FORMAT = (re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}'), '%Y-%m-%d', 'date as YYYY-MM-DD')
CLOCK_FORMAT = (re.compile(r'[0-9]{2}:[0-9]{2}'), '%H:%M', 'time as HH:MM')
LOCAL_DATETIME_FORMAT = (
    re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}'),
    '%Y-%m-%dT%H:%M',
    'local date and time as YYYY-MM-DDTHH:MM, with no seconds, offset or space',
)

_MISSING = object()


def _kind(value: Any) -> str:
    """Name a value's JSON type for error messages."""
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'boolean'
    if isinstance(value, (int, float)):
        return 'number'
    if isinstance(value, str):
        return 'string'
    if isinstance(value, list):
        return 'array'
    if isinstance(value, dict):
        return 'object'
    return type(value).__name__


def _is_member(value: Any, allowed: Collection) -> bool:
    try:
        return value in allowed
    except TypeError:  # unhashable values such as lists
        return False


def _expected(allowed: Collection) -> str:
    return ', '.join(sorted(repr(option) for option in allowed))


def _url_problem(url: Any) -> Optional[str]:
    """Describe why ``url`` is not an absolute https URL, or return None."""
    if not isinstance(url, str):
        return f'must be an https URL string, got {_kind(url)}'
    try:
        parsed = urlparse(url)
    except ValueError:
        return f'is not a valid URL: {url!r}'
    if parsed.scheme != 'https':
        return f'must use https: {url!r}'
    if not parsed.netloc:
        return f'must include a host: {url!r}'
    return None


class Record:
    """One JSON object under validation.

    Each check reads a field, reports problems against this record's label and
    returns the parsed value, or None when the field is absent or invalid, so
    later checks can depend on it without raising.
    """

    def __init__(self, errors: List[str], label: str, row: dict, prefix: str = ''):
        self.errors = errors
        self.label = label
        self.row = row
        self.prefix = prefix

    def error(self, message: str) -> None:
        self.errors.append(f'{self.label}: {message}')

    def name(self, key: str) -> str:
        return self.prefix + key

    def children(self, key: str, *, optional: bool = False, nonempty: bool = False) -> List['Record']:
        """Records for a list of nested objects, such as race distances."""
        nested = []
        for index, row in enumerate(self.items(key, optional=optional, nonempty=nonempty)):
            path = f'{self.name(key)}[{index}]'
            if isinstance(row, dict):
                nested.append(Record(self.errors, self.label, row, path + '.'))
            else:
                self.error(f'{path} must be an object, got {_kind(row)}')
        return nested

    def value(self, key: str, *, optional: bool = False) -> Any:
        """Return the raw value, or _MISSING (reported unless ``optional``)."""
        if key in self.row:
            return self.row[key]
        if not optional:
            self.error(f'missing required field {self.name(key)!r}')
        return _MISSING

    def text(self, key: str, *, allow_empty: bool = False, nullable: bool = False,
             optional: bool = False) -> Optional[str]:
        value = self.value(key, optional=optional)
        if value is _MISSING or (value is None and nullable):
            return None
        if not isinstance(value, str):
            self.error(f'{self.name(key)} must be a string, got {_kind(value)}')
            return None
        if not allow_empty and not value.strip():
            self.error(f'{self.name(key)} must not be empty')
            return None
        return value

    def choice(self, key: str, allowed: Collection, *, default: Any = _MISSING) -> Any:
        if default is not _MISSING and key not in self.row:
            return default
        value = self.value(key)
        if value is _MISSING:
            return None
        if not _is_member(value, allowed):
            self.error(f'{self.name(key)} is {value!r}; expected one of {_expected(allowed)}')
            return None
        return value

    def flag(self, key: str, *, optional: bool = False) -> Optional[bool]:
        value = self.value(key, optional=optional)
        if value is _MISSING:
            return None
        if not isinstance(value, bool):
            self.error(f'{self.name(key)} must be true or false, got {_kind(value)}')
            return None
        return value

    def items(self, key: str, *, optional: bool = False, nonempty: bool = False) -> list:
        value = self.value(key, optional=optional)
        if value is _MISSING:
            return []
        if not isinstance(value, list):
            self.error(f'{self.name(key)} must be an array, got {_kind(value)}')
            return []
        if nonempty and not value:
            self.error(f'{self.name(key)} must not be empty')
        return value

    def _parsed(self, key: str, shape: tuple, *, optional: bool, nullable: bool) -> Optional[datetime]:
        pattern, fmt, description = shape
        value = self.value(key, optional=optional)
        # Optional and nullable values may be null or blank, as before.
        if value is _MISSING or ((optional or nullable) and value in (None, '')):
            return None
        if isinstance(value, str) and pattern.fullmatch(value):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                pass
        self.error(f'{self.name(key)} must be a valid {description}, got {value!r}')
        return None

    def date(self, key: str, *, nullable: bool = False) -> Optional[date]:
        parsed = self._parsed(key, DATE_FORMAT, optional=False, nullable=nullable)
        return parsed.date() if parsed else None

    def clock(self, key: str, *, nullable: bool = False) -> Optional[str]:
        parsed = self._parsed(key, CLOCK_FORMAT, optional=False, nullable=nullable)
        return self.row[key] if parsed else None

    def local_datetime(self, key: str, *, optional: bool = False) -> Optional[datetime]:
        return self._parsed(key, LOCAL_DATETIME_FORMAT, optional=optional, nullable=False)

    def timezone(self, key: str) -> None:
        value = self.text(key)
        if value is None:
            return
        try:
            ZoneInfo(value)
        except (KeyError, ValueError, OSError):  # ZoneInfoNotFoundError is a KeyError
            self.error(f'{self.name(key)} {value!r} is not a known IANA time zone')

    def https_url(self, key: str, *, optional: bool = False) -> Optional[str]:
        """Check an https URL; ``optional`` also accepts an absent, null or blank value."""
        value = self.value(key, optional=optional)
        if value is _MISSING or (optional and value in (None, '')):
            return None
        problem = _url_problem(value)
        if problem:
            self.error(f'{self.name(key)} {problem}')
            return None
        return value

    def reference(self, key: str, known: Collection[str]) -> None:
        value = self.text(key)
        if value is not None and value not in known:
            self.error(f'unknown {self.name(key)} {value!r}')

    def references(self, key: str, known: Collection[str], *, optional: bool = False) -> None:
        for index, value in enumerate(self.items(key, optional=optional)):
            if not isinstance(value, str):
                self.error(f'{self.name(key)}[{index}] must be a string, got {_kind(value)}')
            elif value not in known:
                self.error(f'unknown {self.name(key)} entry {value!r}')

    def not_before(self, later_key: str, later: Optional[date], earlier_key: str,
                   earlier: Optional[date]) -> None:
        if later and earlier and later < earlier:
            self.error(f'{self.name(later_key)} {later.isoformat()} is before '
                       f'{self.name(earlier_key)} {earlier.isoformat()}')


def _records(errors: List[str], data: dict, name: str, id_key: str = 'id') -> List[Record]:
    """Wrap a dataset's rows, reporting a missing dataset or non-object rows."""
    filename = f'{name}.json'
    rows = data.get(name, _MISSING)
    if rows is _MISSING:
        errors.append(f'{filename}: dataset is missing')
        return []
    if not isinstance(rows, list):
        errors.append(f'{filename}: expected an array of records, got {_kind(rows)}')
        return []
    records = []
    for index, row in enumerate(rows):
        record_id = row.get(id_key) if isinstance(row, dict) else None
        has_id = isinstance(record_id, str) and record_id.strip()
        label = f'{filename} {record_id}' if has_id else f'{filename} [{index}]'
        if isinstance(row, dict):
            records.append(Record(errors, label, row))
        else:
            errors.append(f'{label}: expected an object, got {_kind(row)}')
    return records


def _unique(records: List[Record], key: str = 'id') -> Dict[str, Record]:
    """Map each valid key to its first record, reporting duplicates."""
    seen: Dict[str, List[Record]] = {}
    for record in records:
        value = record.text(key)
        if value is not None:
            seen.setdefault(value, []).append(record)
    for duplicates in seen.values():
        if len(duplicates) > 1:
            duplicates[0].error(f'duplicate {key} (appears {len(duplicates)} times)')
    return {value: duplicates[0] for value, duplicates in seen.items()}


def _check_clubs(clubs: List[Record]) -> None:
    for club in clubs:
        club.text('name')
        club.text('geography')
        club.text('user_supplied_name', allow_empty=True)  # searched by report.py
        club.https_url('source_url', optional=True)
        club.choice('research_status', RESEARCH_STATUSES)
        club.date('checked_on')


def _check_sources(sources: List[Record]) -> None:
    for source in sources:
        source.https_url('url')
        roles = source.items('roles', nonempty=True)
        for index, role in enumerate(roles):
            if not isinstance(role, str) or not role.strip():
                source.error(f'roles[{index}] must be a non-empty string, got {role!r}')
        source.choice('authority', SOURCE_AUTHORITIES)
        source.choice('access', SOURCE_ACCESS)
        source.date('last_checked', nullable=True)


def _check_audits(audits: List[Record], clubs: Dict[str, Record], source_ids: Collection[str]) -> None:
    audited = _unique(audits, 'club_id')
    for club_id, audit in audited.items():
        if club_id not in clubs:
            audit.error(f'unknown club_id {club_id!r}')
    for club_id, club in clubs.items():
        if club_id not in audited:
            club.error('has no audit in audits.json; every club needs one audit')
    for audit in audits:
        audit.references('reference_source_ids', source_ids)
        audit.choice('result', AUDIT_RESULTS)
        checked_on = audit.date('checked_on')
        audit.not_before('review_due', audit.date('review_due'), 'checked_on', checked_on)
        audit.text('notes')
        for entry in audit.children('research_log', optional=True):
            entry_checked = entry.date('checked_on')
            if checked_on and entry_checked and entry_checked > checked_on:
                entry.error(f'{entry.name("checked_on")} must not be after audit checked_on {checked_on.isoformat()}')
            entry.text('summary')
            entry.text('next_steps')
            for check in entry.children('source_checks'):
                check.reference('source_id', source_ids)
                source_id = check.row.get('source_id')
                references = audit.row.get('reference_source_ids')
                if isinstance(references, list) and isinstance(source_id, str) and source_id in source_ids and source_id not in references:
                    check.error(f'{check.name("source_id")} must also be listed in reference_source_ids')
                check.choice('method', {'page', 'search_result', 'restricted', 'unavailable', 'not_checked', 'not_recorded'})
                check.text('notes')


def _check_run_details(record: Record) -> None:
    """Optional, sourced practical details; absent fields mean unknown."""
    value = record.value('run_details', optional=True)
    if value is _MISSING:
        return
    if not isinstance(value, dict):
        record.error(f'run_details must be an object, got {_kind(value)}')
        return
    details = Record(record.errors, record.label, value, 'run_details.')
    for key in ('pace', 'cost', 'rsvp', 'access'):
        details.text(key, optional=True)
    if 'sources' in value:
        for index, url in enumerate(details.items('sources', nonempty=True)):
            problem = _url_problem(url)
            if problem:
                details.error(f'{details.name("sources")}[{index}] {problem}')
    if 'checked_on' in value:
        details.date('checked_on')
    for key in ('beginner_friendly', 'no_drop'):
        if key in value:
            details.flag(key)
    for distance in details.children('distances', optional=True, nonempty=True):
        distance.text('label')
        valid = {}
        for key in ('min_miles', 'max_miles'):
            number = distance.value(key)
            if number is _MISSING:
                continue
            if key == 'max_miles' and number is None:
                continue  # A sourced open-ended distance such as 10+ miles.
            if (isinstance(number, bool) or not isinstance(number, (int, float))
                    or (isinstance(number, float) and not math.isfinite(number)) or number <= 0):
                distance.error(f'{distance.name(key)} must be a finite positive number, got {number!r}')
            else:
                valid[key] = number
        if len(valid) == 2 and valid['min_miles'] > valid['max_miles']:
            distance.error(f'{distance.name("min_miles")} must not exceed {distance.name("max_miles")}')


def _check_location_info(record: Record) -> None:
    """Optional curated geography; unknown fields are omitted."""
    value = record.value('location_info', optional=True)
    if value is _MISSING:
        return
    if not isinstance(value, dict):
        record.error(f'location_info must be an object, got {_kind(value)}')
        return
    info = Record(record.errors, record.label, value, 'location_info.')
    if 'area' in value:
        info.choice('area', RACE_AREAS)
    info.text('neighborhood', optional=True)
    info.text('directions_query', optional=True)


def _check_neighborhoods(neighborhoods: List[Record]) -> Dict[str, str]:
    """Check the label vocabulary and return each valid name's area."""
    areas = {}
    for neighborhood in neighborhoods:
        area = neighborhood.choice('area', RACE_AREAS)
        neighborhood.text('includes')
        name = neighborhood.row.get('name')
        if isinstance(name, str) and area in RACE_AREAS:
            areas[name] = area
    return areas


def _check_neighborhood_labels(records: List[Record], areas: Dict[str, str]) -> None:
    """A run's neighborhood must be a listed label, in the label's area."""
    for record in records:
        info = record.row.get('location_info')
        if not isinstance(info, dict) or not isinstance(info.get('neighborhood'), str):
            continue  # _check_location_info reports malformed values.
        name = info['neighborhood']
        if name not in areas:
            record.error(f'location_info.neighborhood {name!r} is not listed in neighborhoods.json')
            continue
        area = info.get('area', _MISSING)
        # An area that is not 'sf' or 'bay' is already reported by _check_location_info.
        if area is _MISSING or (_is_member(area, RACE_AREAS) and area != areas[name]):
            got = None if area is _MISSING else area
            record.error(f'location_info.area must be {areas[name]!r} to match neighborhood {name!r}, got {got!r}')


def _check_schedules(schedules: List[Record], club_ids: Collection[str], source_ids: Collection[str]) -> None:
    for schedule in schedules:
        schedule.reference('club_id', club_ids)
        schedule.reference('source_id', source_ids)
        for key in ('label', 'frequency', 'location'):  # read by the report tools
            schedule.text(key)
        days = schedule.items('days', nonempty=True)
        unknown_days = [day for day in days if not _is_member(day, WEEKDAYS)]
        if unknown_days:
            schedule.error(f'days has unknown values {unknown_days!r}; expected lower-case weekday names')
        schedule.choice('evidence', SCHEDULE_EVIDENCE)
        schedule.choice('status', SCHEDULE_STATUSES, default='active')
        schedule.timezone('timezone')
        schedule.clock('local_time', nullable=True)
        checked_on = schedule.date('checked_on')
        schedule.not_before('review_due', schedule.date('review_due'), 'checked_on', checked_on)
        valid_from = schedule.date('valid_from', nullable=True)
        schedule.not_before('valid_until', schedule.date('valid_until', nullable=True), 'valid_from', valid_from)
        _check_run_details(schedule)
        _check_location_info(schedule)


def _check_events(events: List[Record], club_ids: Collection[str], source_ids: Collection[str]) -> None:
    for event in events:
        event.reference('club_id', club_ids)
        event.reference('source_id', source_ids)
        event.references('additional_source_ids', source_ids, optional=True)
        event.choice('status', EVENT_STATUSES)
        event.flag('needs_review', optional=True)
        event.choice('source_type', EVENT_SOURCE_TYPES)
        event.text('title')
        starts = event.local_datetime('starts_at_local')
        ends = event.local_datetime('ends_at_local', optional=True)
        if starts and ends and ends <= starts:
            event.error(f"ends_at_local {event.row['ends_at_local']!r} must be after "
                        f"starts_at_local {event.row['starts_at_local']!r}")
        event.timezone('timezone')
        event.date('checked_on')
        event.text('location')
        event.text('notes', allow_empty=True)
        _check_run_details(event)
        _check_location_info(event)
        for option in event.children('meeting_options', optional=True):
            option.clock('local_time')
            option.text('location')
            option.text('details')


def _check_published_event_sources(events: List[Record], sources: List[Record]) -> None:
    lookup = {source.row.get('id'): source.row for source in sources
              if isinstance(source.row.get('id'), str)}
    for event in events:
        source_id = event.row.get('source_id')
        source = lookup.get(source_id, {}) if isinstance(source_id, str) else {}
        url = source.get('url')
        if event.row.get('status') != 'published' or not isinstance(url, str):
            continue
        try:
            parsed = urlparse(url)
        except ValueError:
            continue  # The source URL check reports malformed values.
        if parsed.hostname in {'meetup.com', 'www.meetup.com'} and parsed.path.startswith('/find/'):
            event.error('published Meetup events must cite an event permalink, not a changing search page; use unconfirmed until dated evidence is available')


def _check_races(races: List[Record]) -> None:
    # Race editions are separate from club meetups. Unknown starts stay null.
    _unique(races)
    for race in races:
        starts = race.date('date')
        ends = race.date('end_date', nullable=True) or starts
        if starts and ends:
            if ends < starts:
                race.error(f'end_date {ends.isoformat()} precedes date {starts.isoformat()}')
            elif (ends - starts).days > MAX_RACE_SPAN_DAYS:
                race.error(f'spans {(ends - starts).days} days; at most {MAX_RACE_SPAN_DAYS} are allowed')
        for key in ('title', 'city', 'location'):
            race.text(key)
        race.text('notes', allow_empty=True)
        race.choice('area', RACE_AREAS)
        race.choice('format', RACE_FORMATS, default=None)
        race.flag('needs_review')
        race.choice('status', RACE_STATUSES)
        race.date('checked_on')
        for distance in race.children('distances', nonempty=True):
            distance.text('name')
            distance.choice('category', DISTANCE_CATEGORIES)
            distance.clock('start_time', nullable=True)
            distance.text('location', nullable=True)
        urls = [race.https_url('source_url')]
        for index, url in enumerate(race.items('additional_sources')):
            problem = _url_problem(url)
            if problem:
                race.error(f'additional_sources[{index}] {problem}')
            else:
                urls.append(url)
        urls = [url for url in urls if url]
        for url in sorted({url for url in urls if urls.count(url) > 1}):
            race.error(f'source URL listed more than once: {url!r}')


def _check_text(record: Record) -> None:
    """Report text with surrounding whitespace or a repeated sentence, at any depth.

    Stray spaces show up on the site and in the exports, and make otherwise
    identical values compare as different. A sentence that appears twice in one
    value is almost always a note appended more than once by an editing script.
    """
    def walk(value: Any, path: str) -> None:
        if isinstance(value, str):
            if value != value.strip():
                record.error(f'{path} has leading or trailing whitespace: {value[:40]!r}')
            sentences = [part for part in SENTENCE_BREAK.split(value.strip()) if len(part) >= MIN_REPEATED_SENTENCE]
            for sentence in sorted({part for part in sentences if sentences.count(part) > 1}):
                record.error(f'{path} repeats the sentence {sentence[:60]!r}')
        elif isinstance(value, dict):
            for key, item in value.items():
                walk(item, f'{path}.{key}' if path else str(key))
        elif isinstance(value, list):
            for index, item in enumerate(value):
                walk(item, f'{path}[{index}]')

    walk(record.row, '')


def validate(data: dict) -> List[str]:
    """Return every problem in the six datasets as a readable message.

    ``data`` maps 'clubs', 'sources', 'audits', 'schedules', 'events' and
    'races' to their parsed JSON arrays. An empty list means the data is valid.
    Malformed records produce messages, not exceptions.
    """
    errors: List[str] = []
    if not isinstance(data, dict):
        return [f'expected a mapping of datasets, got {type(data).__name__}']
    record_keys = {'audits': 'club_id', 'neighborhoods': 'name'}
    records = {name: _records(errors, data, name, record_keys.get(name, 'id')) for name in DATASETS}
    clubs = _unique(records['clubs'])
    source_ids = set(_unique(records['sources']))
    _unique(records['neighborhoods'], 'name')
    neighborhood_areas = _check_neighborhoods(records['neighborhoods'])
    _check_clubs(records['clubs'])
    _check_sources(records['sources'])
    _check_audits(records['audits'], clubs, source_ids)
    _unique(records['schedules'])
    _check_schedules(records['schedules'], clubs, source_ids)
    _unique(records['events'])
    _check_events(records['events'], clubs, source_ids)
    _check_published_event_sources(records['events'], records['sources'])
    if isinstance(data.get('neighborhoods'), list):  # Otherwise every label would be reported as unlisted.
        _check_neighborhood_labels(records['schedules'] + records['events'], neighborhood_areas)
    _check_races(records['races'])
    for name in DATASETS:
        for record in records[name]:
            _check_text(record)
    # Group messages by file (in DATASETS order), keeping check order within each.
    file_order = {f'{name}.json': index for index, name in enumerate(DATASETS)}
    return sorted(errors, key=lambda message: file_order.get(message.split(' ', 1)[0].rstrip(':'), 0))


def load_data(root: Path = ROOT) -> dict:
    """Load data/<name>.json for each dataset. Raises ValueError on a bad file."""
    data = {}
    for name in DATASETS:
        path = root / 'data' / f'{name}.json'
        try:
            data[name] = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError) as exc:  # JSONDecodeError is a ValueError
            raise ValueError(f'{path.name}: could not be read as JSON: {exc}') from exc
    return data


def main(root: Path = ROOT) -> int:
    try:
        data = load_data(root)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 1
    errors = validate(data)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        print(f'{len(errors)} validation error(s) found.', file=sys.stderr)
        return 1
    print(f"Valid: {len(data['clubs'])} clubs, {len(data['sources'])} sources, {len(data['audits'])} audits, "
          f"{len(data['schedules'])} patterns, {len(data['events'])} dated events.")
    print(f"Valid: {len(data['races'])} race editions, {len(data['neighborhoods'])} neighborhoods.")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
