"""Build and serve the website, coaching voice, and sport API on localhost."""
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    try:
        from dotenv import load_dotenv
        import uvicorn
    except ImportError:
        parser.exit(1, 'Install dependencies first: .venv/bin/python -m pip install -e "./sportgen[dev]"\n')

    # Shell values take precedence; the root .env takes precedence over sportgen/.env.
    load_dotenv(ROOT / '.env')
    load_dotenv(ROOT / 'sportgen' / '.env')
    from scripts.build_static import build
    try:
        build()
    except ValueError as error:
        parser.exit(1, f'{error}\nSet the public Supabase values in {ROOT / ".env"}.\n')

    import os
    if not os.environ.get('ELEVENLABS_API_KEY', '').strip():
        print(f'Voice needs ELEVENLABS_API_KEY in {ROOT / ".env"}. Add it and restart.', flush=True)
    print(f'Open http://localhost:{args.port} — log in, then choose Enable voice and Read instructions.', flush=True)
    uvicorn.run('app:app', host='127.0.0.1', port=args.port)


if __name__ == '__main__':
    main()
