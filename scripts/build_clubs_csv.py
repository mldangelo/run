#!/usr/bin/env python3
"""Generate data/clubs.csv, a spreadsheet-friendly export of data/clubs.json.

The JSON file is canonical. The CSV is regenerated from it and checked in CI so
the two cannot drift apart.
"""
import argparse
import csv
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIELDS = (
    'id',
    'name',
    'user_supplied_name',
    'geography',
    'description',
    'source_url',
    'source_type',
    'research_status',
    'checked_on',
)


def build_csv(clubs):
    """Return the CSV bytes for ``clubs``, in their JSON order.

    A club with a field that is not in FIELDS raises ValueError, so a new
    attribute is added to the export deliberately rather than dropped silently.
    """
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=FIELDS, extrasaction='raise')
    writer.writeheader()
    for club in clubs:
        writer.writerow(club)  # Missing fields and None become empty cells.
    return buffer.getvalue().encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--check', action='store_true', help='Fail if the committed CSV is stale')
    args = parser.parse_args()
    clubs = json.loads((ROOT / 'data' / 'clubs.json').read_text())
    result = build_csv(clubs)
    path = ROOT / 'data' / 'clubs.csv'
    if args.check:
        if not path.exists() or path.read_bytes() != result:
            print('data/clubs.csv is out of date; run npm run generate', file=sys.stderr)
            return 1
        print('Clubs CSV is up to date.')
    else:
        path.write_bytes(result)
        print(f'Wrote data/{path.name}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
