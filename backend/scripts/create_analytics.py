from pathlib import Path
import duckdb

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "trending.duckdb"

def main():
    con = duckdb.connect(str(DB_PATH))
    try:
        con.execute("PRAGMA threads=4;")
        con.execute("PRAGMA enable_progress_bar;")

        # -------------------------
        # Video analytics (existing)
        # -------------------------
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

        con.execute("DROP TABLE IF EXISTS video_reach;")
        con.execute("""
            CREATE TABLE video_reach AS
            SELECT
              video_id,
              COUNT(DISTINCT video_trending_country) AS countries_count
            FROM trending
            GROUP BY video_id;
        """)

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

        con.execute("""
            CREATE OR REPLACE VIEW v_us_dates AS
            SELECT DISTINCT video_trending_date
            FROM trending
            WHERE video_trending_country = 'United States'
            ORDER BY video_trending_date DESC;
        """)

        # -------------------------
        # NEW: Channel analytics
        # -------------------------
        con.execute("DROP TABLE IF EXISTS channel_dim;")
        con.execute("""
            CREATE TABLE channel_dim AS
            SELECT
              channel_id,
              ANY_VALUE(channel_title) AS channel_title,
              ANY_VALUE(channel_custom_url) AS channel_custom_url,
              ANY_VALUE(channel_country) AS channel_country
            FROM trending
            GROUP BY channel_id;
        """)

        con.execute("DROP TABLE IF EXISTS channel_us_daily;")
        con.execute("""
            CREATE TABLE channel_us_daily AS
            SELECT
              video_trending_date AS date,
              channel_id,
              COUNT(DISTINCT video_id) AS distinct_videos,
              COUNT(*) AS appearances,
              SUM(video_view_count) AS sum_views,
              SUM(video_like_count) AS sum_likes,
              SUM(video_comment_count) AS sum_comments
            FROM trending
            WHERE video_trending_country = 'United States'
            GROUP BY 1, 2;
        """)

        con.execute("DROP TABLE IF EXISTS channel_us_alltime;")
        con.execute("""
            CREATE TABLE channel_us_alltime AS
            SELECT
              channel_id,
              COUNT(DISTINCT video_id) AS distinct_videos_alltime,
              COUNT(DISTINCT video_trending_date) AS days_active,
              COUNT(*) AS appearances_alltime,
              MIN(video_trending_date) AS first_date,
              MAX(video_trending_date) AS last_date,
              SUM(video_view_count) AS sum_views_alltime,
              SUM(video_like_count) AS sum_likes_alltime
            FROM trending
            WHERE video_trending_country = 'United States'
            GROUP BY 1;
        """)

        print("✅ Analytics tables created:")
        print("- video_dim, video_reach, video_us_stickiness")
        print("- channel_dim, channel_us_daily, channel_us_alltime")
        print("- view v_us_dates")

    finally:
        con.close()

if __name__ == "__main__":
    main()
