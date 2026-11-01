"""Create an allowlisted static bundle. Never publish the repository root."""
import base64
import json
import os
from pathlib import Path
import shutil
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def build(destination=None):
    url = os.environ.get('SUPABASE_URL', '').strip().rstrip('/')
    key = os.environ.get('SUPABASE_PUBLISHABLE_KEY', '').strip()
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Set SUPABASE_URL to your HTTPS Supabase project URL.')
    if not key.startswith('sb_publishable_'):
        try:
            payload = key.split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
            assert isinstance(claims, dict) and claims.get('role') == 'anon'
        except (IndexError, ValueError, AssertionError, TypeError):
            raise ValueError('Use a Supabase publishable key (or legacy anon key), never a secret/service-role key.') from None
    output = Path(destination) if destination else ROOT / 'dist'
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    for name in ('index.html', 'login.html', 'signup.html'):
        shutil.copy2(ROOT / name, output / name)
    for source in (ROOT / 'src').rglob('*'):
        if source.is_file() and source.suffix in ('.js', '.css'):
            target = output / source.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    (output / 'auth-config.json').write_text(json.dumps({
        'supabaseUrl': url, 'supabasePublishableKey': key,
    }) + '\n')
    # Directory routes also work with a plain local static file server.
    for route in ('login', 'signup'):
        (output / route).mkdir()
        shutil.copy2(output / f'{route}.html', output / route / 'index.html')
    return output


if __name__ == '__main__':
    print(f'Static build ready: {build()}')
