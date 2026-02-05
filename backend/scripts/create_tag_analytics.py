from pathlib import Path
import duckdb

REPO_ROOT = Path(__file__).resolve().parents[2]
DB_PATH = REPO_ROOT / "data" / "processed" / "trending.duckdb"

COUNTRY = "United States"


def main():
    if not DB_PATH.exists():
        raise FileNotFoundError(f"DuckDB not found at: {DB_PATH}")

    con = duckdb.connect(str(DB_PATH))
    con.execute("PRAGMA threads=4;")

    print(f"Using DB: {DB_PATH}")
    print(f"Building monthly tag analytics for: {COUNTRY}")

    # 1) Exploded tag events (US)
    # - handles both commas and the rare pipe delimiter
    # - strips leading hashtags, strips surrounding quotes, lowercases
    con.execute(f"""
    CREATE OR REPLACE TABLE us_tag_events AS
    WITH base AS (
      SELECT
        video_id,
        video_trending_date,
        video_tags
      FROM trending
      WHERE video_trending_country = '{COUNTRY}'
        AND video_trending_date IS NOT NULL
        AND video_tags IS NOT NULL
        AND trim(video_tags) <> ''
        AND lower(trim(video_tags)) NOT IN ('[none]','none','nan','null')
    ),
    exploded AS (
      SELECT
        video_id,
        video_trending_date,
        date_trunc('month', video_trending_date) AS month,
        lower(trim(
          regexp_replace(
            regexp_replace(tag, '^#+', ''),   -- drop leading hashtags
            '^"|"$', ''                      -- drop surrounding quotes
          )
        )) AS tag
      FROM base,
      UNNEST(string_split(replace(video_tags, '|', ','), ',')) AS t(tag)
      WHERE trim(tag) <> ''
    )
    SELECT *
    FROM exploded
    WHERE tag <> '';
    """)

    # Helpful indexes (DuckDB doesn't do traditional indexes, but we can cluster by sorting)
    con.execute("""
      CREATE OR REPLACE TABLE us_tag_events_sorted AS
      SELECT *
      FROM us_tag_events
      ORDER BY month, tag, video_id;
    """)
    con.execute("DROP TABLE us_tag_events;")
    con.execute("ALTER TABLE us_tag_events_sorted RENAME TO us_tag_events;")

    # 2) Monthly totals (distinct videos per month)
    con.execute("""
    CREATE OR REPLACE TABLE us_month_totals AS
    SELECT
      month,
      count(DISTINCT video_id) AS total_videos
    FROM us_tag_events
    GROUP BY 1
    ORDER BY month;
    """)

    # 3) Monthly tag metrics
    con.execute("""
    CREATE OR REPLACE TABLE us_tag_monthly AS
    WITH tag_month AS (
      SELECT
        month,
        tag,
        count(*) AS tag_appearances,
        count(DISTINCT video_id) AS distinct_videos
      FROM us_tag_events
      GROUP BY 1,2
    )
    SELECT
      tm.month,
      tm.tag,
      tm.distinct_videos,
      tm.tag_appearances,
      mt.total_videos,
      round(1.0 * tm.distinct_videos / mt.total_videos, 8) AS video_share
    FROM tag_month tm
    JOIN us_month_totals mt USING (month)
    ORDER BY tm.month, tm.distinct_videos DESC;
    """)

    # 4) Monthly movers (month-over-month change)
    con.execute("""
    CREATE OR REPLACE TABLE us_tag_movers_monthly AS
    WITH s AS (
      SELECT
        month,
        tag,
        video_share
      FROM us_tag_monthly
    ),
    paired AS (
      SELECT
        a.month AS month,
        a.tag AS tag,
        a.video_share AS share_now,
        b.video_share AS share_prev,
        (a.video_share - b.video_share) AS delta,
        CASE
          WHEN b.video_share IS NULL OR b.video_share = 0 THEN NULL
          ELSE (a.video_share / b.video_share)
        END AS lift
      FROM s a
      LEFT JOIN s b
        ON a.tag = b.tag
       AND b.month = a.month - INTERVAL '1 month'
    )
    SELECT *
    FROM paired
    ORDER BY month, delta DESC;
    """)

    # --- Quick sanity prints ---
    events = con.execute("SELECT count(*) FROM us_tag_events").fetchone()[0]
    uniq_tags = con.execute("SELECT count(DISTINCT tag) FROM us_tag_events").fetchone()[0]
    months = con.execute("SELECT count(*) FROM us_month_totals").fetchone()[0]
    min_m = con.execute("SELECT CAST(min(month) AS VARCHAR) FROM us_month_totals").fetchone()[0]
    max_m = con.execute("SELECT CAST(max(month) AS VARCHAR) FROM us_month_totals").fetchone()[0]

    print(f"✅ us_tag_events rows: {events:,}")
    print(f"✅ unique tags: {uniq_tags:,}")
    print(f"✅ months: {months} ({min_m} → {max_m})")

    print("\nTop 10 tags in latest month:")
    con.execute("""
      SELECT CAST(max(month) AS DATE) FROM us_month_totals
    """)
    latest_month = con.fetchone()[0]

    top10 = con.execute("""
      SELECT tag, distinct_videos, total_videos, video_share
      FROM us_tag_monthly
      WHERE month = ?
      ORDER BY distinct_videos DESC
      LIMIT 10
    """, [latest_month]).fetchall()

    for t in top10:
        print(" -", t)

    con.close()


if __name__ == "__main__":
    main()
