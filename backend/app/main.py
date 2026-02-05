import os
from pathlib import Path

from flask import Flask, jsonify, render_template
from dotenv import load_dotenv
from flask_cors import CORS

from app.api.routes import api_bp


def create_app() -> Flask:
    # Load backend/.env reliably regardless of where you run the command from
    env_path = Path(__file__).resolve().parents[1] / ".env"  # backend/.env
    load_dotenv(env_path)

    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(api_bp, url_prefix="/api")

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"})

    # --- Pages ---
    @app.get("/")
    def index_page():
        return render_template("index.html")

    @app.get("/video/<video_id>")
    def video_page(video_id: str):
        return render_template("video.html", video_id=video_id)

    @app.get("/channels")
    def channels_page():
        return render_template("channels.html")

    @app.get("/channel/<channel_id>")
    def channel_page(channel_id: str):
        return render_template("channel.html", channel_id=channel_id)

    @app.get("/tags")
    def tags_page():
        return render_template("tags.html")
    
    @app.get("/tag/<path:tag>")
    def tag_page(tag: str):
        return render_template("tag.html", tag=tag)


    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
