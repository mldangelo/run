import hashlib
from pathlib import Path
import re
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from fingerprint_assets import fingerprint


class FingerprintTests(unittest.TestCase):
    def test_changed_assets_get_new_urls_and_unchanged_assets_keep_their_urls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'site').mkdir()
            (root / 'site/app.js').write_text('old app')
            (root / 'site/style.css').write_text('same css')
            template = '<script src="site/app.js"></script><link href="site/style.css" rel="stylesheet">'
            (root / 'index.html').write_text(template)
            fingerprint(root)
            old = re.findall(r'(?:src|href)="([^"]+)"', (root / 'index.html').read_text())
            (root / 'site/app.js').write_text('new app')
            (root / 'index.html').write_text(template)
            fingerprint(root)
            new = re.findall(r'(?:src|href)="([^"]+)"', (root / 'index.html').read_text())
            self.assertNotEqual(old[0], new[0])
            self.assertEqual(old[1], new[1])
            self.assertEqual((root / new[0]).read_text(), 'new app')
            self.assertEqual((root / old[0]).read_text(), 'old app')

    def test_feed_external_links_and_metadata_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            template = '<a href="feed.xml">RSS</a><a href="#index">Runs</a><link href="https://example.org/app.css"><meta content="https://example.org/card.png">'
            (root / 'index.html').write_text(template)
            fingerprint(root)
            self.assertEqual((root / 'index.html').read_text(), template)

    def test_real_site_assets_exist_at_relative_fingerprinted_paths(self):
        source = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copy(source / 'index.html', root)
            shutil.copytree(source / 'site', root / 'site')
            fingerprint(root)
            result = (root / 'index.html').read_text()
            for reference in re.findall(r'(?:src|href)="(site/[^"]+)"', result):
                asset = root / reference
                digest = hashlib.sha256(asset.read_bytes()).hexdigest()[:12]
                self.assertIn('.' + digest + '.', asset.name)
                self.assertFalse(reference.startswith('/'))
            fingerprint(root)
            self.assertEqual((root / 'index.html').read_text(), result)

    def test_assets_cannot_escape_the_artifact_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'index.html').write_text('<script src="../app.js"></script>')
            with self.assertRaises(ValueError):
                fingerprint(root)


if __name__ == '__main__':
    unittest.main()
