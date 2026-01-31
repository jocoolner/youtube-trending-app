import os
from flask import Flask, jsonify
from dotenv import load_dotenv
from flask_cors import CORS

def create_app() -> Flask:
    # Load backend/.env into environment variables
    load_dotenv()

    app = Flask(__name__)
    CORS(app)

    @app.get('/health')
    def health():
        return jsonify({'status': 'ok'})

    return app

if __name__ == '__main__':
    app = create_app()
    port = int(os.getenv('PORT', '5000'))
    app.run(host='0.0.0.0', port=port, debug=True)
