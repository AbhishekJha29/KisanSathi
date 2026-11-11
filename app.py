"""Vercel entrypoint: exposes the Flask application object as `app`."""
from flask import Flask

from backend.app import create_app

app: Flask = create_app()
