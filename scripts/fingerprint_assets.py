#!/usr/bin/env python3
"""Give deployed HTML content-addressed asset URLs; keep local source unchanged."""
import argparse
import hashlib
from pathlib import Path
import re
from urllib.parse import urlsplit, urlunsplit

ASSET_SUFFIXES = {'.js', '.css', '.svg', '.png', '.webp', '.ico', '.webmanifest'}
REFERENCE = re.compile(r'\b(?:src|href)="([^"]+)"')


def fingerprint(site_root: Path) -> None:
    root = site_root.resolve()
    index = root / 'index.html'

    def replace(match):
        url = urlsplit(match.group(1))
        relative = Path(url.path)
        if url.scheme or url.netloc or relative.suffix not in ASSET_SUFFIXES:
            return match.group(0)
        asset = (root / relative).resolve()
        if relative.is_absolute() or not asset.is_relative_to(root):
            raise ValueError(f'Asset must stay relative to the deployed site: {url.path}')
        content = asset.read_bytes()
        digest = hashlib.sha256(content).hexdigest()[:12]
        if relative.stem.endswith('.' + digest):
            return match.group(0)
        versioned = relative.with_name(f'{relative.stem}.{digest}{relative.suffix}')
        (root / versioned).write_bytes(content)
        reference = urlunsplit(('', '', versioned.as_posix(), url.query, url.fragment))
        return match.group(0).replace(match.group(1), reference)

    index.write_text(REFERENCE.sub(replace, index.read_text(encoding='utf-8')), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('site_root', type=Path, help='Assembled Pages artifact directory')
    fingerprint(parser.parse_args().site_root)
