from __future__ import annotations

from pathlib import Path
import duckdb


def main():
    repo_root = Path(__file__).resolve().parents[2]  # .../backend/scripts -> repo root
    db_path = repo_root / "data" / "processed" / "trending.duckdb"

    print(f"Using DB: {db_path}")
    con = duckdb.connect(str(db_path))
    con.execute("PRAGMA threads=4")

    # Drop old cleaned artifacts if they exist
    con.execute("DROP VIEW IF EXISTS v_us_tag_months_clean;")
    con.execute("DROP TABLE IF EXISTS us_tag_monthly_clean;")
    con.execute("DROP TABLE IF EXISTS us_tag_events_clean;")

    # 1) Build cleaned tag events (US only)
    # - explode tags
    # - normalize: lowercase, trim, remove leading '#', collapse spaces, strip quotes
    # - filter junk: yt:*, urls, @mentions, empty, too short/too long
    # - dedupe per video/day/tag
    con.execute(
        r"""
        CREATE TABLE us_tag_events_clean AS
        WITH base AS (
          SELECT
            t.video_id,
            t.video_trending_date,
            date_trunc('month', t.video_trending_date) AS month,
            unnest(str_split(t.video_tags, ',')) AS tag_raw
          FROM trending t
          WHERE t.video_trending_country = 'United States'
            AND t.video_trending_date IS NOT NULL
            AND t.video_tags IS NOT NULL
        ),
        norm AS (
          SELECT
            video_id,
            video_trending_date,
            month,
            lower(trim(tag_raw)) AS tag0
          FROM base
        ),
        cleaned AS (
          SELECT
            video_id,
            video_trending_date,
            month,
            regexp_replace(
              regexp_replace(
                regexp_replace(tag0, '^#+', ''),      -- remove leading ####
                '\s+', ' '                             -- collapse whitespace
              ),
              '(^"+|"+$)', ''                          -- strip surrounding quotes
            ) AS tag
          FROM norm
        )
        SELECT DISTINCT
          video_id,
          video_trending_date,
          month,
          tag
        FROM cleaned
        WHERE tag IS NOT NULL
          AND tag <> ''
          AND length(tag) >= 2
          AND length(tag) <= 80
          AND tag NOT LIKE 'yt:%'
          AND tag NOT LIKE '%http%'
          AND tag NOT LIKE '%https%'
          AND tag NOT LIKE '%www.%'
          AND tag NOT LIKE '%@%';
        """
    )

    # 2) Monthly aggregates (cleaned)
    con.execute(
        r"""
        CREATE TABLE us_tag_monthly_clean AS
        WITH totals_all AS (
          SELECT
            date_trunc('month', video_trending_date) AS month,
            count(DISTINCT video_id) AS total_videos_all
          FROM trending
          WHERE video_trending_country = 'United States'
            AND video_trending_date IS NOT NULL
          GROUP BY 1
        ),
        totals_tagged AS (
          SELECT
            month,
            count(DISTINCT video_id) AS total_videos_tagged
          FROM us_tag_events_clean
          GROUP BY 1
        ),
        tag_counts AS (
          SELECT
            month,
            tag,
            count(DISTINCT video_id) AS distinct_videos,
            count(*) AS tag_rows
          FROM us_tag_events_clean
          GROUP BY 1,2
        )
        SELECT
          tc.month,
          tc.tag,
          tc.distinct_videos,
          tc.tag_rows,
          tt.total_videos_tagged,
          ta.total_videos_all,
          tc.distinct_videos::DOUBLE / nullif(tt.total_videos_tagged, 0) AS video_share,
          tc.distinct_videos::DOUBLE / nullif(ta.total_videos_all, 0) AS video_share_all
        FROM tag_counts tc
        LEFT JOIN totals_tagged tt USING (month)
        LEFT JOIN totals_all ta USING (month);
        """
    )

    # 3) Months view for dropdown (DESC)
    con.execute(
        r"""
        CREATE VIEW v_us_tag_months_clean AS
        SELECT DISTINCT CAST(month AS VARCHAR) AS month
        FROM us_tag_monthly_clean
        ORDER BY month DESC;
        """
    )

    # --- Print sanity checks ---
    n_events = con.execute("SELECT count(*) FROM us_tag_events_clean").fetchone()[0]
    n_tags = con.execute("SELECT count(DISTINCT tag) FROM us_tag_events_clean").fetchone()[0]
    months = con.execute("SELECT count(DISTINCT month) FROM us_tag_monthly_clean").fetchone()[0]
    min_month, max_month = con.execute(
        "SELECT CAST(min(month) AS VARCHAR), CAST(max(month) AS VARCHAR) FROM us_tag_monthly_clean"
    ).fetchone()

    print(f"✅ us_tag_events_clean rows: {n_events:,}")
    print(f"✅ unique cleaned tags: {n_tags:,}")
    print(f"✅ months: {months} ({min_month} → {max_month})")

    latest = con.execute(
        r"""
        SELECT
          tag,
          distinct_videos,
          total_videos_tagged,
          round(video_share, 6) AS share
        FROM us_tag_monthly_clean
        WHERE month = (SELECT max(month) FROM us_tag_monthly_clean)
        ORDER BY video_share DESC
        LIMIT 10;
        """
    ).fetchall()

    print("\nTop 10 cleaned tags in latest month:")
    for row in latest:
        print(" -", row)

    con.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
