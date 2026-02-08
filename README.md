# YouTube Trending App

Flask + DuckDB app for exploring YouTube trending data, with a US-first dashboard for videos, channels, and tags.

## Highlights

- Kaggle ingestion from `canerkonuk/youtube-trending-videos-global`
- DuckDB build pipeline with data cleaning and validation
- US analytics for top videos, channel leaderboards, stickiness, reach, and tags
- Lightweight Flask API + browser UI

## Quick Start

From the project root:

```bash
cd backend
python -m venv .venv
```

Activate venv:

```powershell
.\.venv\Scripts\Activate.ps1
```

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create `backend/.env`:

```env
PORT=5000
DUCKDB_PATH=../data/processed/trending.duckdb
```

Refresh data and analytics:

```bash
python scripts/refresh_data.py --force-download
```

Start app:

```bash
python -m app.main
```

Open:

- `http://localhost:5000/` (dashboard)
- `http://localhost:5000/channels`
- `http://localhost:5000/tags`
- `http://localhost:5000/health`

## Data Refresh

Run from `backend/`.

1. `python scripts/refresh_data.py`
2. `python scripts/refresh_data.py --force-download` for a guaranteed fresh Kaggle pull

What it runs:

1. `python scripts/download_dataset.py`
2. `python scripts/build_duckdb.py`
3. `python scripts/create_analytics.py`
4. `python scripts/create_tag_clean_analytics.py`

Important:

- UI `Refresh` buttons only reload API results from local DuckDB.
- They do not download new Kaggle data.
- After refresh completes, restart Flask to ensure the updated DB is in use.

## Project Structure

```text
youtube-trending-app/
  backend/
    app/
      api/routes.py
      db/duckdb_client.py
      main.py
      static/
      templates/
    scripts/
      download_dataset.py
      build_duckdb.py
      create_analytics.py
      create_tag_clean_analytics.py
      refresh_data.py
      inspect_raw.py
    requirements.txt
  data/
    raw/        # generated locally (gitignored)
    processed/  # generated locally (gitignored)
  notebooks/
  README.md
```

## API Overview

Base path: `/api`.

US routes:

- `GET /api/us/dates`
- `GET /api/us/trending?date=YYYY-MM-DD&limit=200`
- `GET /api/us/top?metric=views|likes&date=YYYY-MM-DD&limit=20`
- `GET /api/us/top_advanced?metric=stickiness|reach&date=YYYY-MM-DD&limit=20`
- `GET /api/us/channels/daily?date=YYYY-MM-DD&limit=20`
- `GET /api/us/channels/alltime?limit=20`
- `GET /api/us/tags/top?month=YYYY-MM-01&limit=50`
- `GET /api/us/tags/rising?month=YYYY-MM-01&limit=50`
- `GET /api/us/tags/falling?month=YYYY-MM-01&limit=50`

Detail routes:

- `GET /api/video/<video_id>?country=United%20States`
- `GET /api/us/channel/<channel_id>?limit=200`

Generic routes:

- `GET /api/countries`
- `GET /api/trending?country=<name>&date=YYYY-MM-DD&limit=50`

## Requirements

- Python 3.10+
- Kaggle credentials configured for `kagglehub`
- Enough disk space for raw CSV + DuckDB output
