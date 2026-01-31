from flask import Blueprint, request, jsonify
from app.db.duckdb_client import get_conn

api_bp = Blueprint("api", __name__)

@api_bp.get("/countries")
def countries():
    # Cast dates to VARCHAR so jsonify doesn't choke on Python date objects
    sql = """
      SELECT
        video_trending_country AS country,
        CAST(min_date AS VARCHAR) AS min_date,
        CAST(max_date AS VARCHAR) AS max_date,
        rows
      FROM v_available_dates
      ORDER BY country
    """
    with get_conn() as con:
        cur = con.execute(sql)
        cols = [c[0] for c in cur.description]
        data = [dict(zip(cols, row)) for row in cur.fetchall()]
    return jsonify(data)

@api_bp.get("/trending")
def trending():
    country = request.args.get("country")
    if not country:
        return jsonify({"error": "Missing required query param: country"}), 400

    limit = request.args.get("limit", "50")
    try:
        limit = max(1, min(int(limit), 200))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    date = request.args.get("date")  # optional YYYY-MM-DD

    with get_conn() as con:
        # If date not provided, pick the latest available date for that country
        if not date:
            date = con.execute(
                """
                SELECT CAST(max(video_trending_date) AS VARCHAR)
                FROM trending
                WHERE video_trending_country = ?
                  AND video_trending_date IS NOT NULL
                """,
                [country],
            ).fetchone()[0]

            if not date:
                return jsonify({"error": f"No data found for country={country}"}), 404

        # Query trending videos for that country/date
        cur = con.execute(
            """
            SELECT
              video_id,
              video_title,
              channel_title,
              video_default_thumbnail,
              video_category_id,
              CAST(video_published_at AS VARCHAR) AS video_published_at,
              CAST(video_trending_date AS VARCHAR) AS video_trending_date,
              video_view_count,
              video_like_count,
              video_comment_count
            FROM trending
            WHERE video_trending_country = ?
              AND video_trending_date = CAST(? AS DATE)
              AND video_trending_date IS NOT NULL
            ORDER BY video_view_count DESC NULLS LAST
            LIMIT ?
            """,
            [country, date, limit],
        )
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    return jsonify({
        "country": country,
        "date": date,
        "limit": limit,
        "count": len(rows),
        "results": rows
    })
