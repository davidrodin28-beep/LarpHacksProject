from contextlib import closing
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path

from server import create_app


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = str(Path(self.temp.name) / 'test.sqlite3')
        self.config = {'TESTING': True, 'SECRET_KEY': 'test-only-secret', 'DATABASE': self.database}
        self.app = create_app(self.config)
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp.cleanup()

    def post(self, path, **data):
        self.client.get('/login')
        with self.client.session_transaction() as session:
            data['csrf_token'] = session['csrf_token']
        return self.client.post(path, data=data)

    def signup(self, **changes):
        fields = dict(name='Test User', email='person@example.com', password='a long test password', confirm_password='a long test password')
        fields.update(changes)
        return self.post('/signup', **fields)

    def test_signup_protects_tracker_and_hashes_password(self):
        self.assertEqual(self.client.get('/').location, '/login')
        self.assertEqual(self.client.get('/index.html').location, '/login')
        self.assertEqual(self.signup(email=' PERSON@Example.com ').status_code, 303)
        page = self.client.get('/')
        self.assertEqual(page.status_code, 200)
        self.assertIn(b'data-account-name="Test User"', page.data)
        with self.client.session_transaction() as session:
            self.assertIn(session['csrf_token'].encode(), page.data)
        self.assertIn(b'/src/StillwatchUI.js', page.data)
        self.assertIn(b'/src/styles/app.css', page.data)
        self.assertNotIn(b'src/app.js', page.data)
        self.assertEqual(page.data.count(b'<head>'), 1)
        self.assertEqual(page.data.count(b'<body>'), 1)
        self.assertNotIn(b'{{', page.data)
        self.assertEqual(page.headers['Cache-Control'], 'no-store')
        with closing(sqlite3.connect(self.database)) as db:
            email, password_hash = db.execute('SELECT email, password_hash FROM users').fetchone()
        self.assertEqual(email, 'person@example.com')
        self.assertTrue(password_hash.startswith('scrypt:'))
        self.assertNotIn('a long test password', password_hash)

    def test_logout_revokes_cookie_and_login_survives_restart(self):
        self.signup()
        old_cookie = self.client.get_cookie('session').value
        self.assertEqual(self.post('/logout').status_code, 303)
        self.assertEqual(self.client.get('/').location, '/login')
        replay = self.app.test_client()
        replay.set_cookie('session', old_cookie)
        self.assertEqual(replay.get('/').location, '/login')
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.assertEqual(self.post('/login', email='person@example.com', password='a long test password').status_code, 303)
        self.assertEqual(self.client.get('/').status_code, 200)

    def test_duplicate_email_and_validation(self):
        self.assertEqual(self.signup(password='short', confirm_password='short').status_code, 400)
        self.assertEqual(self.signup(confirm_password='does not match').status_code, 400)
        self.assertEqual(self.signup(email='invalid').status_code, 400)
        self.assertEqual(self.signup(name='').status_code, 400)
        self.assertEqual(self.signup().status_code, 303)
        self.post('/logout')
        self.assertEqual(self.signup(email='PERSON@example.com').status_code, 400)
        with closing(sqlite3.connect(self.database)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM users').fetchone()[0], 1)

    def test_failed_login_has_generic_error_and_throttles(self):
        self.signup()
        self.post('/logout')
        known = self.post('/login', email='person@example.com', password='incorrect password')
        unknown = self.post('/login', email='unknown@example.com', password='incorrect password')
        self.assertIn(b'Email or password is incorrect.', known.data)
        self.assertIn(b'Email or password is incorrect.', unknown.data)
        for _ in range(9):
            self.post('/login', email='unknown@example.com', password='incorrect password')
        self.assertEqual(self.post('/login', email='unknown@example.com', password='incorrect password').status_code, 429)

    def test_csrf_required_on_every_mutation(self):
        for path in ('/signup', '/login', '/logout'):
            self.assertEqual(self.client.post(path, data={}).status_code, 400)
        self.signup()
        self.assertEqual(self.client.get('/logout').status_code, 405)
        self.assertEqual(self.client.post('/logout', data={'csrf_token': 'bad'}).status_code, 400)
        self.assertEqual(self.client.get('/').status_code, 200)

    def test_expired_session_and_private_files(self):
        self.signup()
        with closing(sqlite3.connect(self.database)) as db:
            db.execute('UPDATE sessions SET expires_at = ?', (int(time.time()) - 1,))
            db.commit()
        self.assertEqual(self.client.get('/').location, '/login')
        for path in ('/server.py', '/instance/stillwatch.sqlite3', '/.env', '/.git/config', '/src/../server.py'):
            self.assertEqual(self.client.get(path).status_code, 404)
        for path in ('/styles.css', '/src/app.js'):
            with self.client.get(path) as response:
                self.assertEqual(response.status_code, 200)

    def test_pages_escape_values_and_use_secure_production_cookie(self):
        response = self.signup(name='<script>alert(1)</script>', confirm_password='mismatch')
        self.assertNotIn(b'<script>alert(1)</script>', response.data)
        self.assertIn(b'&lt;script&gt;', response.data)
        client = create_app({**self.config, 'SESSION_COOKIE_SECURE': True}).test_client()
        cookie = client.get('/login').headers['Set-Cookie']
        for flag in ('Secure', 'HttpOnly', 'SameSite=Lax'):
            self.assertIn(flag, cookie)


if __name__ == '__main__':
    unittest.main()
