from pathlib import Path
import duckdb

DATASET_CSV_REL = Path("data/raw/youtube_trending_global/youtube_trending_videos_global.csv")
OUT_DB_REL = Path("data/processed/trending.duckdb")

# YouTube video IDs are typically 11 chars: letters, numbers, _ or -
VIDEO_ID_REGEX = r"^[A-Za-z0-9_-]{11}$"


def main():
    project_root = Path(__file__).resolve().parents[2]  # youtube-trending-app/

    raw_csv = project_root / DATASET_CSV_REL
    out_db = project_root / OUT_DB_REL
    out_db.parent.mkdir(parents=True, exist_ok=True)

    if not raw_csv.exists():
        raise FileNotFoundError(f"Raw CSV not found at: {raw_csv}")

    # DuckDB prefers forward slashes in file paths on Windows
    csv_path = raw_csv.as_posix()

    con = duckdb.connect(str(out_db))
    try:
        # Performance + progress bar
        con.execute("PRAGMA threads=4;")
        con.execute("PRAGMA enable_progress_bar;")

        # ---------------------------------------------------------------------
        # 1) Load raw safely: force tricky columns to VARCHAR to avoid auto-detect
        # ---------------------------------------------------------------------
        con.execute("DROP TABLE IF EXISTS trending_raw;")
        con.execute(
            f"""
            CREATE TABLE trending_raw AS
            SELECT *
            FROM read_csv(
                '{csv_path}',
                header=true,
                auto_detect=true,
                sample_size=-1,
                types={{
                    'video_trending__date': 'VARCHAR',
                    'video_published_at': 'VARCHAR',
                    'channel_published_at': 'VARCHAR'
                }}
            );
            """
        )

        # QA stats on raw
        raw_stats = con.execute(
            f"""
            SELECT
              count(*) AS total_raw,
              sum(CAST(try_cast(replace(video_trending__date, '.', '-') AS DATE) IS NULL AS INT)) AS bad_date_rows,
              sum(CAST(NOT regexp_matches(video_id, '{VIDEO_ID_REGEX}') AS INT)) AS invalid_video_id_rows
            FROM trending_raw;
            """
        ).fetchone()

        total_raw, bad_date_rows, invalid_video_id_rows = raw_stats

        print(f"\nRaw table built: trending_raw")
        print(f"Total raw rows: {total_raw:,}")
        print(f"Rows with bad/unparseable trending date: {bad_date_rows:,}")
        print(f"Rows with invalid video_id format: {invalid_video_id_rows:,}")

        # ---------------------------------------------------------------------
        # 2) Build cleaned table with controlled parsing + strict validity filters
        #    - parsed_trending_date must be non-null
        #    - video_id must match YouTube ID regex
        # ---------------------------------------------------------------------
        con.execute("DROP TABLE IF EXISTS trending;")
        con.execute(
            f"""
            CREATE TABLE trending AS
            WITH parsed AS (
              SELECT
                *,
                try_cast(replace(video_trending__date, '.', '-') AS DATE) AS parsed_trending_date,
                regexp_matches(video_id, '{VIDEO_ID_REGEX}') AS is_valid_video_id
              FROM trending_raw
            )
            SELECT
              video_id,
              try_cast(video_published_at AS TIMESTAMPTZ) AS video_published_at,
              parsed_trending_date AS video_trending_date,
              video_trending_country,
              channel_id,
              video_title,
              video_description,
              video_default_thumbnail,
              try_cast(video_category_id AS INTEGER) AS video_category_id,
              video_tags,
              video_duration,
              video_dimension,
              video_definition,
              video_licensed_content,
              try_cast(video_view_count AS BIGINT) AS video_view_count,
              try_cast(video_like_count AS BIGINT) AS video_like_count,
              try_cast(video_comment_count AS BIGINT) AS video_comment_count,
              channel_title,
              channel_description,
              channel_custom_url,
              try_cast(channel_published_at AS TIMESTAMPTZ) AS channel_published_at,
              channel_country,
              try_cast(channel_view_count AS BIGINT) AS channel_view_count,
              try_cast(channel_subscriber_count AS BIGINT) AS channel_subscriber_count,
              channel_have_hidden_subscribers,
              try_cast(channel_video_count AS BIGINT) AS channel_video_count,
              channel_localized_title,
              channel_localized_description
            FROM parsed
            WHERE parsed_trending_date IS NOT NULL
              AND is_valid_video_id;
            """
        )

        # ---------------------------------------------------------------------
        # 3) Create a view for quick country coverage checks
        # ---------------------------------------------------------------------
        con.execute(
            """
            CREATE OR REPLACE VIEW v_available_dates AS
            SELECT
              video_trending_country,
              min(video_trending_date) AS min_date,
              max(video_trending_date) AS max_date,
              count(*) AS rows
            FROM trending
            GROUP BY 1
            ORDER BY 1;
            """
        )

        # QA stats on cleaned table
        total_clean = con.execute("SELECT count(*) FROM trending;").fetchone()[0]
        distinct_countries = con.execute(
            "SELECT count(DISTINCT video_trending_country) FROM trending;"
        ).fetchone()[0]
        null_date_clean = con.execute(
            "SELECT count(*) FROM trending WHERE video_trending_date IS NULL;"
        ).fetchone()[0]

        dropped = total_raw - total_clean

        print(f"\nBuilt DuckDB: {out_db}")
        print(f"Rows in cleaned trending: {total_clean:,}")
        print(f"Dropped rows (corrupt/invalid): {dropped:,}")
        print(f"Distinct countries (cleaned): {distinct_countries}")
        print(f"NULL trending_date rows in cleaned table (should be 0): {null_date_clean}")

        # Show a few examples of "bad rows" for debugging / confidence
        print("\nSample rows that were considered BAD (up to 8):")
        bad_samples = con.execute(
            f"""
            SELECT
              video_id,
              video_trending__date,
              video_trending_country,
              video_category_id,
              video_default_thumbnail
            FROM trending_raw
            WHERE try_cast(replace(video_trending__date, '.', '-') AS DATE) IS NULL
               OR NOT regexp_matches(video_id, '{VIDEO_ID_REGEX}')
            LIMIT 8;
            """
        ).fetchall()

        for r in bad_samples:
            print(" -", r)

    finally:
        con.close()


if __name__ == "__main__":
    main()
