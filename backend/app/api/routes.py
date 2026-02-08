from __future__ import annotations

import re
from flask import Blueprint, request, jsonify
from app.db.duckdb_client import get_conn

api_bp = Blueprint("api", __name__)


# -------------------------
# Helpers
# -------------------------
def _rows_to_dicts(cur):
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _normalize_month_str(m: str | None) -> str | None:
    """Accept 'YYYY-MM-01' or ISO datetime; return 'YYYY-MM-01'."""
    if not m:
        return None
    m = m.strip()
    if len(m) >= 10:
        m = m[:10]
    return m


def _normalize_tag_str(tag: str) -> str:
    """Match cleaning rules: lowercase, trim, collapse spaces, strip leading # and quotes."""
    t = tag.strip().lower()
    t = re.sub(r"^#+", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = t.strip('"').strip("'")
    return t


def _table_exists(con, table_name: str) -> bool:
    row = con.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE lower(table_name) = lower(?)
        LIMIT 1
        """,
        [table_name],
    ).fetchone()
    return row is not None


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


def _resolve_month_clean(con, month: str | None) -> str | None:
    month = _normalize_month_str(month)
    if month:
        return month
    latest = con.execute(
        """
        SELECT CAST(month AS VARCHAR) AS month
        FROM v_us_tag_months_clean
        LIMIT 1
        """
    ).fetchone()
    return latest[0] if latest else None


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

    limit_raw = request.args.get("limit", "50")
    try:
        limit = max(1, min(int(limit_raw), 200))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    date = request.args.get("date")  # optional YYYY-MM-DD

    with get_conn() as con:
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

    return jsonify({"country": country, "date": date, "limit": limit, "count": len(rows), "results": rows})


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
    return jsonify([r[0] for r in rows])


@api_bp.get("/us/trending")
def us_trending():
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
# Video detail API
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


# -------------------------
# Channels
# -------------------------
@api_bp.get("/us/channels/daily")
def us_channels_daily():
    date = request.args.get("date")
    limit_raw = request.args.get("limit", "20")
    try:
        limit = max(1, min(int(limit_raw), 100))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    with get_conn() as con:
        if not date:
            date = con.execute(
                """
                SELECT CAST(max(video_trending_date) AS VARCHAR)
                FROM trending
                WHERE video_trending_country='United States'
                """
            ).fetchone()[0]

        cur = con.execute(
            """
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
            """,
            [date, limit],
        )

        data = _rows_to_dicts(cur)

    return jsonify({"country": "United States", "date": date, "count": len(data), "results": data})


@api_bp.get("/us/channels/alltime")
def us_channels_alltime():
    limit_raw = request.args.get("limit", "20")
    try:
        limit = max(1, min(int(limit_raw), 100))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    with get_conn() as con:
        cur = con.execute(
            """
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
            """,
            [limit],
        )

        data = _rows_to_dicts(cur)

    return jsonify({"country": "United States", "count": len(data), "results": data})


@api_bp.get("/us/channel/<channel_id>")
def us_channel_detail(channel_id: str):
    limit_raw = request.args.get("limit", "200")
    try:
        limit = max(1, min(int(limit_raw), 500))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    with get_conn() as con:
        meta_cur = con.execute(
            """
            SELECT
              c.channel_id,
              c.channel_title,
              c.channel_custom_url,
              c.channel_country,
              a.distinct_videos_alltime,
              a.days_active,
              a.appearances_alltime,
              CAST(a.first_date AS VARCHAR) AS first_date,
              CAST(a.last_date AS VARCHAR) AS last_date,
              a.sum_views_alltime,
              a.sum_likes_alltime
            FROM channel_dim c
            LEFT JOIN channel_us_alltime a USING (channel_id)
            WHERE c.channel_id = ?
            """,
            [channel_id],
        )
        meta = meta_cur.fetchone()
        if not meta:
            return jsonify({"error": "channel_id not found"}), 404

        meta_cols = [c[0] for c in meta_cur.description]
        channel = dict(zip(meta_cols, meta))

        cur = con.execute(
            """
            WITH vids AS (
              SELECT
                t.video_id,
                COUNT(DISTINCT t.video_trending_date) AS days_trended_us,
                MIN(t.video_trending_date) AS first_trending_us,
                MAX(t.video_trending_date) AS last_trending_us,
                MAX(t.video_view_count) AS max_views,
                MAX(t.video_like_count) AS max_likes,
                MAX(t.video_comment_count) AS max_comments
              FROM trending t
              WHERE t.video_trending_country='United States'
                AND t.channel_id = ?
              GROUP BY t.video_id
            )
            SELECT
              v.video_id,
              d.video_title,
              d.video_default_thumbnail,
              v.days_trended_us,
              CAST(v.first_trending_us AS VARCHAR) AS first_trending_us,
              CAST(v.last_trending_us AS VARCHAR) AS last_trending_us,
              v.max_views AS video_view_count,
              v.max_likes AS video_like_count,
              v.max_comments AS video_comment_count,
              r.countries_count
            FROM vids v
            JOIN video_dim d USING (video_id)
            LEFT JOIN video_reach r USING (video_id)
            ORDER BY v.days_trended_us DESC NULLS LAST,
                     v.max_views DESC NULLS LAST
            LIMIT ?
            """,
            [channel_id, limit],
        )

        videos = _rows_to_dicts(cur)

    return jsonify({"channel": channel, "count": len(videos), "videos": videos})


# -------------------------
# US Search: videos + channels
# -------------------------
@api_bp.get("/us/search/videos")
def us_search_videos():
    qtext = (request.args.get("q") or "").strip()
    if len(qtext) < 2:
        return jsonify({"error": "q must be at least 2 characters"}), 400

    scope = (request.args.get("scope") or "day").lower()  # day | all
    date = request.args.get("date")
    limit_raw = request.args.get("limit", "20")

    try:
        limit = max(1, min(int(limit_raw), 50))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    with get_conn() as con:
        if scope == "day":
            date = _resolve_us_date(con, date)
            cur = con.execute(
                """
                SELECT
                  t.video_id,
                  d.video_title,
                  d.channel_id,
                  d.channel_title,
                  d.video_default_thumbnail,
                  t.video_view_count,
                  t.video_like_count,
                  t.video_comment_count,
                  CAST(t.video_trending_date AS VARCHAR) AS video_trending_date
                FROM trending t
                JOIN video_dim d USING (video_id)
                WHERE t.video_trending_country = 'United States'
                  AND t.video_trending_date = CAST(? AS DATE)
                  AND d.video_title ILIKE '%' || ? || '%'
                ORDER BY t.video_view_count DESC NULLS LAST
                LIMIT ?
                """,
                [date, qtext, limit],
            )
        elif scope == "all":
            cur = con.execute(
                """
                SELECT
                  d.video_id,
                  d.video_title,
                  d.channel_id,
                  d.channel_title,
                  d.video_default_thumbnail,
                  s.days_trended_us,
                  CAST(s.first_trending_us AS VARCHAR) AS first_trending_us,
                  CAST(s.last_trending_us AS VARCHAR) AS last_trending_us,
                  r.countries_count
                FROM video_dim d
                JOIN video_us_stickiness s USING (video_id)
                LEFT JOIN video_reach r USING (video_id)
                WHERE d.video_title ILIKE '%' || ? || '%'
                ORDER BY s.days_trended_us DESC NULLS LAST,
                         s.last_trending_us DESC NULLS LAST
                LIMIT ?
                """,
                [qtext, limit],
            )
            date = None
        else:
            return jsonify({"error": "scope must be day or all"}), 400

        data = _rows_to_dicts(cur)

    return jsonify({"q": qtext, "scope": scope, "date": date, "limit": limit, "count": len(data), "results": data})


@api_bp.get("/us/search/channels")
def us_search_channels():
    qtext = (request.args.get("q") or "").strip()
    if len(qtext) < 2:
        return jsonify({"error": "q must be at least 2 characters"}), 400

    scope = (request.args.get("scope") or "day").lower()  # day | all
    date = request.args.get("date")
    limit_raw = request.args.get("limit", "20")

    try:
        limit = max(1, min(int(limit_raw), 50))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    with get_conn() as con:
        if scope == "day":
            date = _resolve_us_date(con, date)
            cur = con.execute(
                """
                SELECT
                  d.channel_id,
                  max(d.channel_title) AS channel_title,
                  count(DISTINCT t.video_id) AS distinct_videos,
                  sum(t.video_view_count) AS sum_views,
                  sum(t.video_like_count) AS sum_likes,
                  sum(t.video_comment_count) AS sum_comments
                FROM trending t
                JOIN video_dim d USING (video_id)
                WHERE t.video_trending_country = 'United States'
                  AND t.video_trending_date = CAST(? AS DATE)
                  AND (
                    d.channel_title ILIKE '%' || ? || '%'
                    OR d.channel_id ILIKE '%' || ? || '%'
                  )
                GROUP BY 1
                ORDER BY distinct_videos DESC, sum_views DESC
                LIMIT ?
                """,
                [date, qtext, qtext, limit],
            )
        elif scope == "all":
            cur = con.execute(
                """
                SELECT
                  d.channel_id,
                  max(d.channel_title) AS channel_title,
                  count(*) AS distinct_videos_alltime,
                  sum(s.days_trended_us) AS total_days_trended_us,
                  CAST(min(s.first_trending_us) AS VARCHAR) AS first_trending_us,
                  CAST(max(s.last_trending_us) AS VARCHAR) AS last_trending_us
                FROM video_dim d
                JOIN video_us_stickiness s USING (video_id)
                WHERE (
                  d.channel_title ILIKE '%' || ? || '%'
                  OR d.channel_id ILIKE '%' || ? || '%'
                )
                GROUP BY 1
                ORDER BY distinct_videos_alltime DESC, total_days_trended_us DESC
                LIMIT ?
                """,
                [qtext, qtext, limit],
            )
            date = None
        else:
            return jsonify({"error": "scope must be day or all"}), 400

        data = _rows_to_dicts(cur)

    return jsonify({"q": qtext, "scope": scope, "date": date, "limit": limit, "count": len(data), "results": data})


# ----------------------------
# US Monthly Tag Analytics (CLEANED)
# Tables / views created by: backend/scripts/create_tag_clean_analytics.py
# - us_tag_events_clean
# - us_tag_monthly_clean
# - v_us_tag_months_clean
# ----------------------------
@api_bp.get("/us/tags/months")
def us_tag_months():
    with get_conn() as con:
        rows = con.execute(
            """
            SELECT CAST(month AS VARCHAR) AS month
            FROM v_us_tag_months_clean
            ORDER BY month DESC
            """
        ).fetchall()
    return jsonify([r[0] for r in rows])


@api_bp.get("/us/tags/top")
def us_tags_top():
    month = request.args.get("month")  # YYYY-MM-01
    limit_raw = request.args.get("limit", "50")
    try:
        limit = max(1, min(int(limit_raw), 200))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    with get_conn() as con:
        month = _resolve_month_clean(con, month)
        if not month:
            return jsonify({"error": "No months available"}), 404

        cur = con.execute(
            """
            SELECT
              tag,
              distinct_videos,
              total_videos_tagged AS total_videos,
              video_share
            FROM us_tag_monthly_clean
            WHERE month = CAST(? AS DATE)
            ORDER BY video_share DESC
            LIMIT ?
            """,
            [month, limit],
        )

        data = _rows_to_dicts(cur)

    return jsonify({"month": month, "count": len(data), "results": data})


@api_bp.get("/us/tags/rising")
def us_tags_rising():
    month = request.args.get("month")
    limit_raw = request.args.get("limit", "50")
    try:
        limit = max(1, min(int(limit_raw), 200))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    with get_conn() as con:
        month = _resolve_month_clean(con, month)
        if not month:
            return jsonify({"error": "No months available"}), 404

        cur = con.execute(
            """
            WITH now AS (
              SELECT tag, video_share AS share_now
              FROM us_tag_monthly_clean
              WHERE month = CAST(? AS DATE)
            ),
            prev AS (
              SELECT tag, video_share AS share_prev
              FROM us_tag_monthly_clean
              WHERE month = date_add(CAST(? AS DATE), INTERVAL '-1 month')
            )
            SELECT
              n.tag,
              p.share_prev,
              n.share_now,
              (n.share_now - coalesce(p.share_prev, 0)) AS delta,
              CASE
                WHEN p.share_prev IS NULL OR p.share_prev = 0 THEN NULL
                ELSE n.share_now / p.share_prev
              END AS lift
            FROM now n
            LEFT JOIN prev p USING (tag)
            ORDER BY delta DESC
            LIMIT ?
            """,
            [month, month, limit],
        )

        data = _rows_to_dicts(cur)

    return jsonify({"month": month, "count": len(data), "results": data})


@api_bp.get("/us/tags/falling")
def us_tags_falling():
    month = request.args.get("month")
    limit_raw = request.args.get("limit", "50")
    try:
        limit = max(1, min(int(limit_raw), 200))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    with get_conn() as con:
        month = _resolve_month_clean(con, month)
        if not month:
            return jsonify({"error": "No months available"}), 404

        cur = con.execute(
            """
            WITH now AS (
              SELECT tag, video_share AS share_now
              FROM us_tag_monthly_clean
              WHERE month = CAST(? AS DATE)
            ),
            prev AS (
              SELECT tag, video_share AS share_prev
              FROM us_tag_monthly_clean
              WHERE month = date_add(CAST(? AS DATE), INTERVAL '-1 month')
            )
            SELECT
              n.tag,
              p.share_prev,
              n.share_now,
              (n.share_now - coalesce(p.share_prev, 0)) AS delta,
              CASE
                WHEN p.share_prev IS NULL OR p.share_prev = 0 THEN NULL
                ELSE n.share_now / p.share_prev
              END AS lift
            FROM now n
            LEFT JOIN prev p USING (tag)
            WHERE p.share_prev IS NOT NULL
            ORDER BY delta ASC
            LIMIT ?
            """,
            [month, month, limit],
        )

        data = _rows_to_dicts(cur)

    return jsonify({"month": month, "count": len(data), "results": data})


@api_bp.get("/us/tags/videos")
def us_tag_videos():
    tag_raw = request.args.get("tag")
    if not tag_raw:
        return jsonify({"error": "Missing required query param: tag"}), 400

    tag = _normalize_tag_str(tag_raw)

    month = request.args.get("month")
    metric = request.args.get("metric", "views")  # views | likes
    limit_raw = request.args.get("limit", "20")

    try:
        limit = max(1, min(int(limit_raw), 200))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    if metric not in ("views", "likes"):
        return jsonify({"error": "metric must be views or likes"}), 400

    order_col = "max_views" if metric == "views" else "max_likes"

    with get_conn() as con:
        month = _resolve_month_clean(con, month)
        if not month:
            return jsonify({"error": "No months available"}), 404

        sql = f"""
        WITH vids AS (
          SELECT DISTINCT video_id
          FROM us_tag_events_clean
          WHERE month = CAST(? AS DATE)
            AND tag = ?
        )
        SELECT
          t.video_id,
          d.video_title,
          d.channel_id,
          d.channel_title,
          d.video_default_thumbnail,
          max(t.video_view_count) AS max_views,
          max(t.video_like_count) AS max_likes,
          max(t.video_comment_count) AS max_comments,
          count(DISTINCT t.video_trending_date) AS days_trended_in_month,
          CAST(min(t.video_trending_date) AS VARCHAR) AS first_date,
          CAST(max(t.video_trending_date) AS VARCHAR) AS last_date
        FROM trending t
        JOIN video_dim d USING (video_id)
        JOIN vids v USING (video_id)
        WHERE t.video_trending_country = 'United States'
          AND date_trunc('month', t.video_trending_date) = CAST(? AS DATE)
        GROUP BY 1,2,3,4,5
        ORDER BY {order_col} DESC NULLS LAST
        LIMIT ?
        """

        cur = con.execute(sql, [month, tag, month, limit])
        data = _rows_to_dicts(cur)

    return jsonify(
        {
            "country": "United States",
            "month": month,
            "tag": tag,
            "metric": metric,
            "count": len(data),
            "results": data,
        }
    )


@api_bp.get("/us/tags/series")
def us_tags_series():
    """
    Return a time series (monthly) of a tag's share + counts in the US (cleaned tables).
    NOTE: us_tag_monthly_clean has total_videos_tagged, not total_videos.
    """
    tag_raw = request.args.get("tag")
    if not tag_raw:
        return jsonify({"error": "Missing required query param: tag"}), 400

    tag = _normalize_tag_str(tag_raw)

    with get_conn() as con:
        # Prefer cleaned table if it exists; fall back to original
        table = "us_tag_monthly_clean" if _table_exists(con, "us_tag_monthly_clean") else "us_tag_monthly"

        if table == "us_tag_monthly_clean":
            sql = """
                SELECT
                  CAST(month AS VARCHAR) AS month,
                  video_share,
                  distinct_videos,
                  total_videos_tagged AS total_videos
                FROM us_tag_monthly_clean
                WHERE tag = ?
                ORDER BY month ASC
            """
        else:
            # original table naming
            sql = """
                SELECT
                  CAST(month AS VARCHAR) AS month,
                  video_share,
                  distinct_videos,
                  total_videos
                FROM us_tag_monthly
                WHERE tag = ?
                ORDER BY month ASC
            """

        cur = con.execute(sql, [tag])
        series = _rows_to_dicts(cur)

    return jsonify({"tag": tag, "count": len(series), "series": series})
