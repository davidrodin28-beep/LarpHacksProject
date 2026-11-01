import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scripts.build_static import build


class StaticBuildTests(unittest.TestCase):
    def test_bundle_includes_frontend_but_excludes_backend_and_secrets(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {
            'SUPABASE_URL': 'https://example.supabase.co',
            'SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_test',
            'SECRET_KEY': 'must-not-be-published',
        }):
            output = build(Path(temp) / 'dist')
            config = json.loads((output / 'auth-config.json').read_text())
            self.assertEqual(set(config), {'supabaseUrl', 'supabasePublishableKey'})
            for path in ('index.html', 'login.html', 'signup.html', 'login/index.html', 'forgot-password.html', 'reset-password.html', 'forgot-password/index.html', 'reset-password/index.html', 'src/auth/client.js', 'src/StillwatchUI.js', 'src/coaching/coach.js', 'src/coaching/lessons.js'):
                self.assertTrue((output / path).is_file(), path)
            for path in ('server.py', 'instance', '.git', 'tests', 'templates', '.env'):
                self.assertFalse((output / path).exists(), path)
            self.assertNotIn('{{', (output / 'index.html').read_text())
            self.assertNotIn('method="post"', (output / 'login.html').read_text())
            self.assertIn('disabled', (output / 'signup.html').read_text())
            (output / 'secret.key').write_text('stale')
            build(output)
            self.assertFalse((output / 'secret.key').exists())

    def test_rejects_missing_configuration_and_privileged_keys(self):
        for key in ('', 'sb_secret_do-not-expose', 'invalid'):
            with patch.dict(os.environ, {'SUPABASE_URL': 'https://example.supabase.co', 'SUPABASE_PUBLISHABLE_KEY': key}):
                with self.assertRaises(ValueError):
                    build()
        with patch.dict(os.environ, {'SUPABASE_URL': '', 'SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_test'}):
            with self.assertRaises(ValueError):
                build()
