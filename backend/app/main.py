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

    # Explicit template/static folders (more reliable when package layout grows)
    template_dir = Path(__file__).resolve().parent / "templates"  # backend/app/templates
    static_dir = Path(__file__).resolve().parent / "static"       # backend/app/static

    app = Flask(
        __name__,
        template_folder=str(template_dir),
        static_folder=str(static_dir),
        static_url_path="/static",
    )

    # Allow browser front-end to call API endpoints (fine for local dev)
    CORS(app)

    # Register API routes under /api
    app.register_blueprint(api_bp, url_prefix="/api")

    # -------------------------
    # Pages (Website UI)
    # -------------------------
    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/video/<video_id>")
    def video_page(video_id: str):
        # We'll improve this page later with real API-driven detail
        return render_template("video.html", video_id=video_id)

    # -------------------------
    # Health check
    # -------------------------
    @app.get("/health")
    def health():
        return jsonify({"status": "ok"})
    
    @app.get("/channels")
    def channels_page():
        return render_template("channels.html")


    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
