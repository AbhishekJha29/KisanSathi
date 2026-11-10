"""API Blueprint package initialization for KisanSathi backend.

Creates the 'api' Blueprint prefixed with '/api' and imports child route modules
to register endpoints.
"""
from flask import Blueprint

api_bp: Blueprint = Blueprint("api", __name__, url_prefix="/api")

# Register routes on api_bp (imported after blueprint definition to avoid circular imports)
from backend.api import health  # noqa: E402, F401
from backend.api import crops  # noqa: E402, F401
from backend.api import advisory  # noqa: E402, F401
from backend.api import ai  # noqa: E402, F401

