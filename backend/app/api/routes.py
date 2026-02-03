from __future__ import annotations

from flask import Blueprint, request, jsonify
from app.db.duckdb_client import get_conn

api_bp = Blueprint("api", __name__)


def _rows_to_dicts(cur):
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


# -------------------------
# Generic endpoints (optional / earlier Phase)
# -------------------------
@api_bp.get("/countries")
def countries():
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
        data = _rows_to_dicts(cur)
    return jsonify(data)


@api_bp.get("/trending")
def trending():
    country = request.args.get("country")
    if not country:
        return jsonify({"error": "Missing required query param: country"}), 400

    # limit
    limit_raw = request.args.get("limit", "50")
    try:
        limit = max(1, min(int(limit_raw), 200))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    date = request.args.get("date")  # optional YYYY-MM-DD

    with get_conn() as con:
        # default date = latest for that country
        if not date:
            date = con.execute(
                """
                SELECT CAST(max(video_trending_date) AS VARCHAR)
                FROM trending
                WHERE video_trending_country = ?
                """,
                [country],
            ).fetchone()[0]

            if not date:
                return jsonify({"error": f"No data found for country={country}"}), 404

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
            ORDER BY video_view_count DESC NULLS LAST
            LIMIT ?
            """,
            [country, date, limit],
        )

        rows = _rows_to_dicts(cur)

    return jsonify(
        {"country": country, "date": date, "limit": limit, "count": len(rows), "results": rows}
    )


# -------------------------
# US dashboard endpoints (current MVP)
# -------------------------
@api_bp.get("/us/dates")
def us_dates():
    with get_conn() as con:
        rows = con.execute(
            """
            SELECT CAST(video_trending_date AS VARCHAR) AS date
            FROM v_us_dates
            LIMIT 4000
            """
        ).fetchall()
    # v_us_dates is DESC, so first should be latest
    return jsonify([r[0] for r in rows])


def _resolve_us_date(con, date: str | None) -> str:
    if date:
        return date
    latest = con.execute(
        """
        SELECT CAST(max(video_trending_date) AS VARCHAR)
        FROM trending
        WHERE video_trending_country='United States'
        """
    ).fetchone()[0]
    return latest


@api_bp.get("/us/trending")
def us_trending():
    # limit
    limit_raw = request.args.get("limit", "200")
    try:
        limit = max(1, min(int(limit_raw), 200))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    date = request.args.get("date")

    with get_conn() as con:
        date = _resolve_us_date(con, date)
        if not date:
            return jsonify({"error": "No US data found"}), 404

        cur = con.execute(
            """
            SELECT
              t.video_id,
              d.video_title,
              d.channel_title,
              d.video_default_thumbnail,
              t.video_view_count,
              t.video_like_count,
              t.video_comment_count,
              CAST(t.video_trending_date AS VARCHAR) AS video_trending_date
            FROM trending t
            JOIN video_dim d USING (video_id)
            WHERE t.video_trending_country='United States'
              AND t.video_trending_date = CAST(? AS DATE)
            ORDER BY t.video_view_count DESC NULLS LAST
            LIMIT ?
            """,
            [date, limit],
        )

        data = _rows_to_dicts(cur)

    return jsonify({"country": "United States", "date": date, "count": len(data), "results": data})


@api_bp.get("/us/top")
def us_top():
    metric = request.args.get("metric", "views")  # views | likes
    date = request.args.get("date")

    limit_raw = request.args.get("limit", "20")
    try:
        limit = max(1, min(int(limit_raw), 50))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    if metric not in ("views", "likes"):
        return jsonify({"error": "metric must be views or likes"}), 400

    order_col = "video_view_count" if metric == "views" else "video_like_count"

    with get_conn() as con:
        date = _resolve_us_date(con, date)
        if not date:
            return jsonify({"error": "No US data found"}), 404

        cur = con.execute(
            f"""
            SELECT
              t.video_id,
              d.video_title,
              d.channel_title,
              d.video_default_thumbnail,
              t.video_view_count,
              t.video_like_count,
              t.video_comment_count,
              CAST(t.video_trending_date AS VARCHAR) AS video_trending_date
            FROM trending t
            JOIN video_dim d USING (video_id)
            WHERE t.video_trending_country='United States'
              AND t.video_trending_date = CAST(? AS DATE)
            ORDER BY t.{order_col} DESC NULLS LAST
            LIMIT ?
            """,
            [date, limit],
        )

        data = _rows_to_dicts(cur)

    return jsonify({"country": "United States", "date": date, "metric": metric, "count": len(data), "results": data})


@api_bp.get("/us/top_advanced")
def us_top_advanced():
    metric = request.args.get("metric", "stickiness")  # stickiness | reach
    date = request.args.get("date")

    limit_raw = request.args.get("limit", "20")
    try:
        limit = max(1, min(int(limit_raw), 50))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    if metric not in ("stickiness", "reach"):
        return jsonify({"error": "metric must be stickiness or reach"}), 400

    with get_conn() as con:
        date = _resolve_us_date(con, date)
        if not date:
            return jsonify({"error": "No US data found"}), 404

        if metric == "stickiness":
            sql = """
              SELECT
                t.video_id,
                d.video_title,
                d.channel_title,
                d.video_default_thumbnail,
                s.days_trended_us,
                t.video_view_count,
                t.video_like_count,
                t.video_comment_count,
                CAST(t.video_trending_date AS VARCHAR) AS video_trending_date
              FROM trending t
              JOIN video_dim d USING (video_id)
              LEFT JOIN video_us_stickiness s USING (video_id)
              WHERE t.video_trending_country='United States'
                AND t.video_trending_date = CAST(? AS DATE)
              ORDER BY s.days_trended_us DESC NULLS LAST,
                       t.video_view_count DESC NULLS LAST
              LIMIT ?
            """
        else:
            sql = """
              SELECT
                t.video_id,
                d.video_title,
                d.channel_title,
                d.video_default_thumbnail,
                r.countries_count,
                t.video_view_count,
                t.video_like_count,
                t.video_comment_count,
                CAST(t.video_trending_date AS VARCHAR) AS video_trending_date
              FROM trending t
              JOIN video_dim d USING (video_id)
              LEFT JOIN video_reach r USING (video_id)
              WHERE t.video_trending_country='United States'
                AND t.video_trending_date = CAST(? AS DATE)
              ORDER BY r.countries_count DESC NULLS LAST,
                       t.video_view_count DESC NULLS LAST
              LIMIT ?
            """

        cur = con.execute(sql, [date, limit])
        data = _rows_to_dicts(cur)

    return jsonify({"country": "United States", "date": date, "metric": metric, "count": len(data), "results": data})


# -------------------------
# Video detail API (Phase 2.4)
# -------------------------
@api_bp.get("/video/<video_id>")
def video_detail(video_id: str):
    country = request.args.get("country", "United States")

    with get_conn() as con:
        meta_cur = con.execute(
            """
            SELECT
              d.video_id,
              d.video_title,
              d.channel_id,
              d.channel_title,
              d.video_default_thumbnail,
              d.video_category_id,
              d.video_duration,
              d.video_definition,
              r.countries_count,
              s.days_trended_us,
              CAST(s.first_trending_us AS VARCHAR) AS first_trending_us,
              CAST(s.last_trending_us AS VARCHAR) AS last_trending_us
            FROM video_dim d
            LEFT JOIN video_reach r USING (video_id)
            LEFT JOIN video_us_stickiness s USING (video_id)
            WHERE d.video_id = ?
            """,
            [video_id],
        )
        meta = meta_cur.fetchone()
        if not meta:
            return jsonify({"error": "video_id not found"}), 404

        meta_cols = [c[0] for c in meta_cur.description]
        meta_dict = dict(zip(meta_cols, meta))

        hist_cur = con.execute(
            """
            SELECT
              CAST(video_trending_date AS VARCHAR) AS date,
              video_view_count,
              video_like_count,
              video_comment_count
            FROM trending
            WHERE video_id = ?
              AND video_trending_country = ?
            ORDER BY video_trending_date ASC
            """,
            [video_id, country],
        )
        history = _rows_to_dicts(hist_cur)

        spread_cur = con.execute(
            """
            SELECT
              video_trending_country AS country,
              COUNT(DISTINCT video_trending_date) AS days
            FROM trending
            WHERE video_id = ?
            GROUP BY 1
            ORDER BY days DESC
            LIMIT 20
            """,
            [video_id],
        )
        spread = _rows_to_dicts(spread_cur)

    return jsonify({"video": meta_dict, "country": country, "history": history, "country_spread_top20": spread})

@api_bp.get("/us/channels/daily")
def us_channels_daily():
    date = request.args.get("date")
    limit_raw = request.args.get("limit", "20")
    try:
        limit = max(1, min(int(limit_raw), 100))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    with get_conn() as con:
        # default date = latest
        if not date:
            date = con.execute("""
                SELECT CAST(max(video_trending_date) AS VARCHAR)
                FROM trending
                WHERE video_trending_country='United States'
            """).fetchone()[0]

        cur = con.execute("""
            SELECT
              d.channel_id,
              c.channel_title,
              d.distinct_videos,
              d.appearances,
              d.sum_views,
              d.sum_likes,
              d.sum_comments,
              CAST(d.date AS VARCHAR) AS date
            FROM channel_us_daily d
            LEFT JOIN channel_dim c USING (channel_id)
            WHERE d.date = CAST(? AS DATE)
            ORDER BY d.distinct_videos DESC NULLS LAST,
                     d.sum_views DESC NULLS LAST
            LIMIT ?
        """, [date, limit])

        cols = [c[0] for c in cur.description]
        data = [dict(zip(cols, r)) for r in cur.fetchall()]

    return jsonify({"country": "United States", "date": date, "count": len(data), "results": data})


@api_bp.get("/us/channels/alltime")
def us_channels_alltime():
    limit_raw = request.args.get("limit", "20")
    try:
        limit = max(1, min(int(limit_raw), 100))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    with get_conn() as con:
        cur = con.execute("""
            SELECT
              a.channel_id,
              c.channel_title,
              a.distinct_videos_alltime,
              a.days_active,
              a.appearances_alltime,
              a.sum_views_alltime,
              a.sum_likes_alltime,
              CAST(a.first_date AS VARCHAR) AS first_date,
              CAST(a.last_date AS VARCHAR) AS last_date
            FROM channel_us_alltime a
            LEFT JOIN channel_dim c USING (channel_id)
            ORDER BY a.distinct_videos_alltime DESC NULLS LAST,
                     a.days_active DESC NULLS LAST
            LIMIT ?
        """, [limit])

        cols = [c[0] for c in cur.description]
        data = [dict(zip(cols, r)) for r in cur.fetchall()]

    return jsonify({"country": "United States", "count": len(data), "results": data})

