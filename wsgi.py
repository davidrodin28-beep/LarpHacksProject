"""Production entry point used by Gunicorn on Render."""
from server import create_app

app = create_app()
