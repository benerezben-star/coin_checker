"""Coin Checker - a local error-hunting and collection tool."""

from pathlib import Path

from flask import Flask, g

from . import db

BASE_DIR = Path(__file__).resolve().parent.parent
INSTANCE_DIR = BASE_DIR / "instance"


def create_app():
    app = Flask(__name__, instance_path=str(INSTANCE_DIR))

    app.config.update(
        DATABASE=INSTANCE_DIR / "coins.db",
        PHOTO_DIR=INSTANCE_DIR / "photos",
        THUMB_DIR=INSTANCE_DIR / "thumbs",
        CACHE_DIR=INSTANCE_DIR / "cache",
        MAX_CONTENT_LENGTH=64 * 1024 * 1024,  # microscope captures can be large
        SECRET_KEY="local-only-not-a-secret",
    )

    for key in ("PHOTO_DIR", "THUMB_DIR", "CACHE_DIR"):
        app.config[key].mkdir(parents=True, exist_ok=True)

    db.init_db(app.config["DATABASE"])

    @app.before_request
    def open_conn():
        g.conn = db.connect(app.config["DATABASE"])

    @app.teardown_request
    def close_conn(exc):
        conn = g.pop("conn", None)
        if conn is not None:
            conn.close()

    from .routes import bp

    app.register_blueprint(bp)
    return app
