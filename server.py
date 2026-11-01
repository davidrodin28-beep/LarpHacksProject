"""Stillwatch accounts and local SQLite storage."""
import hashlib
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from datetime import timedelta

from flask import Flask, abort, g, redirect, render_template, request, send_from_directory, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    production = os.environ.get('APP_ENV') == 'production'
    app.config.update(
        DATABASE=os.environ.get('DATABASE_PATH', str(ROOT / 'instance' / 'stillwatch.sqlite3')),
        SECRET_KEY=os.environ.get('SECRET_KEY'),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_SECURE=production,
        PERMANENT_SESSION_LIFETIME=timedelta(days=7),
        MAX_CONTENT_LENGTH=16 * 1024,
    )
    if test_config:
        app.config.update(test_config)
    if not app.config['SECRET_KEY']:
        if production:
            raise RuntimeError('Set SECRET_KEY in production.')
        secret_path = ROOT / 'instance' / 'secret.key'
        secret_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with secret_path.open('x') as handle:
                os.chmod(secret_path, 0o600)
                handle.write(secrets.token_hex(32))
        except FileExistsError:
            pass
        app.config['SECRET_KEY'] = secret_path.read_text()

    def db():
        if 'db' not in g:
            g.db = sqlite3.connect(app.config['DATABASE'], timeout=10)
            g.db.row_factory = sqlite3.Row
            g.db.execute('PRAGMA foreign_keys = ON')
        return g.db

    @app.teardown_appcontext
    def close_db(error=None):
        connection = g.pop('db', None)
        if connection is not None:
            connection.close()

    Path(app.config['DATABASE']).parent.mkdir(parents=True, exist_ok=True)
    with app.app_context():
        db().executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS auth_attempts (
                email TEXT NOT NULL,
                attempted_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS attempts_email_time ON auth_attempts(email, attempted_at);
        ''')
    dummy_hash = generate_password_hash(secrets.token_hex(32))

    def token_hash(token):
        return hashlib.sha256(token.encode()).hexdigest()

    @app.before_request
    def load_account_and_check_csrf():
        g.user = None
        token = session.get('auth_token')
        if token:
            g.user = db().execute('''SELECT users.id, users.name, users.email FROM users
                JOIN sessions ON users.id = sessions.user_id
                WHERE token_hash = ? AND expires_at > ?''', (token_hash(token), int(time.time()))).fetchone()
        if 'csrf_token' not in session:
            session['csrf_token'] = secrets.token_urlsafe(32)
        if request.method == 'POST':
            supplied = request.form.get('csrf_token', '')
            if not secrets.compare_digest(supplied, session['csrf_token']):
                abort(400, description='This form expired. Refresh the page and try again.')

    @app.after_request
    def security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'same-origin'
        if request.endpoint not in ('assets', 'styles', 'health'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    def start_session(user_id):
        previous = session.get('auth_token')
        if previous:
            db().execute('DELETE FROM sessions WHERE token_hash = ?', (token_hash(previous),))
        session.clear()
        session.permanent = True
        token = secrets.token_urlsafe(32)
        session['auth_token'] = token
        session['csrf_token'] = secrets.token_urlsafe(32)
        now = int(time.time())
        db().execute('DELETE FROM sessions WHERE expires_at <= ?', (now,))
        db().execute('INSERT INTO sessions VALUES (?, ?, ?)', (token_hash(token), user_id, now + 7 * 86400))
        db().commit()

    @app.route('/signup', methods=['GET', 'POST'])
    @app.route('/login', methods=['GET', 'POST'])
    def auth():
        if g.user:
            return redirect(url_for('tracker'))
        signup = request.path == '/signup'
        error = None
        status = 200
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip().lower()
        if request.method == 'POST':
            password = request.form.get('password', '')
            now = int(time.time())
            connection = db()
            connection.execute('DELETE FROM auth_attempts WHERE attempted_at < ?', (now - 900,))
            attempts = connection.execute('SELECT count(*) FROM auth_attempts WHERE email = ?', (email,)).fetchone()[0]
            if attempts >= 10:
                connection.commit()
                error, status = 'Too many attempts. Please try again in 15 minutes.', 429
            else:
                connection.execute('INSERT INTO auth_attempts VALUES (?, ?)', (email, now))
                connection.commit()
                if len(email) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
                    error = 'Enter a valid email address.'
                elif signup and not 1 <= len(name) <= 80:
                    error = 'Enter a name between 1 and 80 characters.'
                elif not 12 <= len(password) <= 128:
                    error = 'Use a password between 12 and 128 characters.' if signup else 'Email or password is incorrect.'
                elif signup and password != request.form.get('confirm_password'):
                    error = 'Your passwords do not match.'
                elif signup:
                    try:
                        cursor = connection.execute('INSERT INTO users (name,email,password_hash,created_at) VALUES (?,?,?,?)',
                                                    (name, email, generate_password_hash(password), now))
                        connection.commit()
                        start_session(cursor.lastrowid)
                        return redirect(url_for('tracker'), code=303)
                    except sqlite3.IntegrityError:
                        connection.rollback()
                        error = 'Unable to create an account with that email. Try signing in.'
                else:
                    user = connection.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
                    valid = check_password_hash(user['password_hash'] if user else dummy_hash, password)
                    if user and valid:
                        connection.execute('DELETE FROM auth_attempts WHERE email = ?', (email,))
                        start_session(user['id'])
                        return redirect(url_for('tracker'), code=303)
                    error = 'Email or password is incorrect.'
                if error:
                    status = 400
        return render_template('auth.html', signup=signup, error=error, name=name, email=email), status

    @app.post('/logout')
    def logout():
        token = session.get('auth_token')
        if token:
            db().execute('DELETE FROM sessions WHERE token_hash = ?', (token_hash(token),))
            db().commit()
        session.clear()
        return redirect('/login', code=303)

    @app.get('/')
    @app.get('/index.html')
    def tracker():
        if not g.user:
            return redirect('/login')
        # Keep the existing tracker markup as the single source of truth.
        return app.jinja_env.from_string((ROOT / 'index.html').read_text()).render()

    @app.get('/styles.css')
    def styles():
        return send_from_directory(ROOT, 'styles.css')

    @app.get('/src/<path:filename>')
    def assets(filename):
        return send_from_directory(ROOT / 'src', filename)

    @app.get('/health')
    def health():
        db().execute('SELECT 1')
        return {'status': 'ok'}

    return app


if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=int(os.environ.get('PORT', 8000)))
