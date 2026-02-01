import os
from pathlib import Path

from flask import Flask, jsonify
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

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
