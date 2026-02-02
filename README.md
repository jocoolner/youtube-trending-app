# YouTube Trending App

A small Flask + DuckDB app for exploring YouTube trending data, with a US-focused dashboard and video detail pages.

## Quick Start

From the project root (`youtube-trending-app/`):

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

- Windows PowerShell

```powershell
.\.venv\Scripts\Activate.ps1
```

- macOS/Linux

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

Build data (first run only):

```bash
python scripts/download_dataset.py
python scripts/build_duckdb.py
python scripts/create_analytics.py
```

Run the app:

```bash
python -m app.main
```

Open in browser:

- Dashboard: `http://localhost:5000/`
- Health: `http://localhost:5000/health`

## What the Project Includes

- Data download from Kaggle dataset `canerkonuk/youtube-trending-videos-global`
- DuckDB build/clean pipeline for trending records
- Analytics tables for:
  - top videos by views/likes
  - US stickiness (days trended in US)
  - global reach (number of countries)
- Flask API + simple web UI

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
      inspect_raw.py
    requirements.txt
  data/
    raw/        # generated locally (gitignored)
    processed/  # generated locally (gitignored)
  notebooks/
  README.md
```

## Data Pipeline

Run these from `backend/`:

1. `python scripts/download_dataset.py`
   - Downloads Kaggle files and copies them into `data/raw/youtube_trending_global/`
2. `python scripts/build_duckdb.py`
   - Reads CSV and builds cleaned table `trending` in `data/processed/trending.duckdb`
3. `python scripts/create_analytics.py`
   - Creates analytics tables/views:
     - `video_dim`
     - `video_reach`
     - `video_us_stickiness`
     - `v_us_dates`

Optional sanity check:

```bash
python scripts/inspect_raw.py
```

## API Overview

Base path: `/api`

US dashboard endpoints:

- `GET /api/us/dates`
- `GET /api/us/trending?date=YYYY-MM-DD&limit=200`
- `GET /api/us/top?metric=views|likes&date=YYYY-MM-DD&limit=20`
- `GET /api/us/top_advanced?metric=stickiness|reach&date=YYYY-MM-DD&limit=20`

Video detail endpoint:

- `GET /api/video/<video_id>?country=United%20States`

Generic endpoints:

- `GET /api/countries`
- `GET /api/trending?country=<name>&date=YYYY-MM-DD&limit=50`

## Requirements

- Python 3.10+
- Kaggle credentials configured for `kagglehub`
- Enough disk space for dataset + DuckDB (a few GB recommended)

## Notes

- `data/raw/` and `data/processed/` are gitignored by design.
- Current UI is US-first, but generic API routes support other countries.
