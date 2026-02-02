from pathlib import Path
import duckdb

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "trending.duckdb"

def main():
    con = duckdb.connect(str(DB_PATH))
    try:
        con.execute("PRAGMA threads=4;")
        con.execute("PRAGMA enable_progress_bar;")

        # 1) Video dimension (stable metadata per video_id)
        con.execute("DROP TABLE IF EXISTS video_dim;")
        con.execute("""
            CREATE TABLE video_dim AS
            SELECT
              video_id,
              ANY_VALUE(video_title) AS video_title,
              ANY_VALUE(channel_id) AS channel_id,
              ANY_VALUE(channel_title) AS channel_title,
              ANY_VALUE(video_default_thumbnail) AS video_default_thumbnail,
              ANY_VALUE(video_category_id) AS video_category_id,
              ANY_VALUE(video_duration) AS video_duration,
              ANY_VALUE(video_definition) AS video_definition
            FROM trending
            GROUP BY video_id;
        """)

        # 2) Global reach per video
        con.execute("DROP TABLE IF EXISTS video_reach;")
        con.execute("""
            CREATE TABLE video_reach AS
            SELECT
              video_id,
              COUNT(DISTINCT video_trending_country) AS countries_count
            FROM trending
            GROUP BY video_id;
        """)

        # 3) US stickiness per video
        con.execute("DROP TABLE IF EXISTS video_us_stickiness;")
        con.execute("""
            CREATE TABLE video_us_stickiness AS
            SELECT
              video_id,
              COUNT(DISTINCT video_trending_date) AS days_trended_us,
              MIN(video_trending_date) AS first_trending_us,
              MAX(video_trending_date) AS last_trending_us
            FROM trending
            WHERE video_trending_country = 'United States'
            GROUP BY video_id;
        """)

        # 4) Helpful view: available US dates
        con.execute("""
            CREATE OR REPLACE VIEW v_us_dates AS
            SELECT DISTINCT video_trending_date
            FROM trending
            WHERE video_trending_country = 'United States'
            ORDER BY video_trending_date DESC;
        """)

        print("✅ Analytics tables created: video_dim, video_reach, video_us_stickiness + view v_us_dates")

    finally:
        con.close()

if __name__ == "__main__":
    main()
