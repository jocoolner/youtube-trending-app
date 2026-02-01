from pathlib import Path
import duckdb

def main():
    project_root = Path(__file__).resolve().parents[2]

    raw_csv = project_root / "data" / "raw" / "youtube_trending_global" / "youtube_trending_videos_global.csv"
    out_db  = project_root / "data" / "processed" / "trending.duckdb"
    out_db.parent.mkdir(parents=True, exist_ok=True)

    csv_path = raw_csv.as_posix()

    con = duckdb.connect(str(out_db))
    try:
        con.execute("PRAGMA threads=4;")
        con.execute("PRAGMA enable_progress_bar;")

        # 1) Load raw safely: force tricky columns to VARCHAR to avoid auto-detect failures
        con.execute("DROP TABLE IF EXISTS trending_raw;")
        con.execute(f"""
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
        """)

        # 2) Create cleaned table with controlled parsing / casting
        con.execute("DROP TABLE IF EXISTS trending;")
        con.execute("""
            CREATE TABLE trending AS
            SELECT
              video_id,
              try_cast(video_published_at AS TIMESTAMPTZ) AS video_published_at,

              -- The trending date should be like 2024.10.12; convert '.' -> '-'
              -- If the value is a timestamp like 2017-01-31T06:22:58Z, this will fail and become NULL
              try_cast(replace(video_trending__date, '.', '-') AS DATE) AS video_trending_date,

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
            FROM trending_raw;
        """)

        # 3) QA checks: how many rows have bad/NULL trending dates?
        total = con.execute("SELECT count(*) FROM trending").fetchone()[0]
        null_dates = con.execute("SELECT count(*) FROM trending WHERE video_trending_date IS NULL").fetchone()[0]

        con.execute("""
            CREATE OR REPLACE VIEW v_available_dates AS
            SELECT
              video_trending_country,
              min(video_trending_date) AS min_date,
              max(video_trending_date) AS max_date,
              count(*) AS rows
            FROM trending
            GROUP BY 1
            ORDER BY 1;
        """)

        n_countries = con.execute("SELECT count(DISTINCT video_trending_country) FROM trending").fetchone()[0]

        print(f"\nBuilt DuckDB: {out_db}")
        print(f"Rows in trending: {total:,}")
        print(f"Distinct countries: {n_countries}")
        print(f"Rows with NULL trending_date (bad parse): {null_dates:,} ({null_dates/total:.4%})")

        print("Sample bad rows (up to 5):")
        bad = con.execute("""
            SELECT video_id, video_trending__date, video_trending_country
            FROM trending_raw
            WHERE try_cast(replace(video_trending__date, '.', '-') AS DATE) IS NULL
            LIMIT 5;
        """).fetchall()
        for r in bad:
            print(" -", r)

    finally:
        con.close()

if __name__ == "__main__":
    main()
