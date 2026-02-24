from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row


SCHEMA_FILE = Path(__file__).with_name("postgres_schema.sql")
LLM_INPUT_LIMIT_MIN = 1
LLM_INPUT_LIMIT_MAX = 80
MAX_BULLETS_MIN = 1
MAX_BULLETS_MAX = 20


@dataclass(frozen=True)
class DbUser:
    id: int
    username: str
    email_to: str
    is_active: bool
    timezone: str | None


@dataclass(frozen=True)
class DbUserPreferences:
    user_id: int
    keyword: str | None
    llm_input_limit: int | None
    max_bullets: int | None
    remote_only: bool | None
    strict_senior_only: bool | None
    profile_overrides: dict[str, Any] | None


@dataclass(frozen=True)
class DbUserState:
    user_id: int
    last_run_at: datetime | None
    last_email_sent_at: datetime | None
    last_status: str | None
    last_error: str | None


def get_database_url() -> str:
    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        raise RuntimeError("Missing DATABASE_URL environment variable")
    return url


def connect(database_url: str | None = None) -> psycopg.Connection:
    return psycopg.connect(database_url or get_database_url(), row_factory=dict_row)


def init_schema(conn: psycopg.Connection) -> None:
    sql = SCHEMA_FILE.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()


def upsert_user(
    conn: psycopg.Connection,
    *,
    username: str,
    email_to: str,
    is_active: bool = True,
    timezone: str | None = None,
) -> DbUser:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (username, email_to, is_active, timezone)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (username)
            DO UPDATE SET
              email_to = EXCLUDED.email_to,
              is_active = EXCLUDED.is_active,
              timezone = EXCLUDED.timezone,
              updated_at = NOW()
            RETURNING id, username, email_to, is_active, timezone
            """,
            (username.strip(), email_to.strip(), is_active, timezone),
        )
        row = cur.fetchone()
    conn.commit()
    if row is None:
        raise RuntimeError("Failed to upsert user")
    return _row_to_user(row)


def list_users(conn: psycopg.Connection, *, active_only: bool = False) -> list[DbUser]:
    sql = """
        SELECT id, username, email_to, is_active, timezone
        FROM users
    """
    params: tuple[Any, ...] = ()
    if active_only:
        sql += " WHERE is_active = %s"
        params = (True,)
    sql += " ORDER BY username ASC"

    with conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()
    return [_row_to_user(row) for row in rows]


def get_user_by_username(conn: psycopg.Connection, username: str) -> DbUser | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, username, email_to, is_active, timezone
            FROM users
            WHERE username = %s
            """,
            (username.strip(),),
        )
        row = cur.fetchone()
    return _row_to_user(row) if row else None


def set_user_preferences(
    conn: psycopg.Connection,
    *,
    user_id: int,
    keyword: str | None = None,
    llm_input_limit: int | None = None,
    max_bullets: int | None = None,
    remote_only: bool | None = None,
    strict_senior_only: bool | None = None,
    profile_overrides: dict[str, Any] | None = None,
) -> None:
    llm_input_limit = _bounded_optional_int(
        llm_input_limit,
        field="llm_input_limit",
        min_value=LLM_INPUT_LIMIT_MIN,
        max_value=LLM_INPUT_LIMIT_MAX,
    )
    max_bullets = _bounded_optional_int(
        max_bullets,
        field="max_bullets",
        min_value=MAX_BULLETS_MIN,
        max_value=MAX_BULLETS_MAX,
    )
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO user_preferences (
              user_id, keyword, llm_input_limit, max_bullets,
              remote_only, strict_senior_only, profile_overrides_jsonb, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET
              keyword = EXCLUDED.keyword,
              llm_input_limit = EXCLUDED.llm_input_limit,
              max_bullets = EXCLUDED.max_bullets,
              remote_only = EXCLUDED.remote_only,
              strict_senior_only = EXCLUDED.strict_senior_only,
              profile_overrides_jsonb = EXCLUDED.profile_overrides_jsonb,
              updated_at = NOW()
            """,
            (
                user_id,
                _none_or_str(keyword),
                llm_input_limit,
                max_bullets,
                remote_only,
                strict_senior_only,
                _json_dumps_or_none(profile_overrides),
            ),
        )
    conn.commit()


def get_user_preferences(conn: psycopg.Connection, user_id: int) -> DbUserPreferences | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT user_id, keyword, llm_input_limit, max_bullets,
                   remote_only, strict_senior_only, profile_overrides_jsonb
            FROM user_preferences
            WHERE user_id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()

    if not row:
        return None

    return DbUserPreferences(
        user_id=int(row["user_id"]),
        keyword=row.get("keyword"),
        llm_input_limit=row.get("llm_input_limit"),
        max_bullets=row.get("max_bullets"),
        remote_only=row.get("remote_only"),
        strict_senior_only=row.get("strict_senior_only"),
        profile_overrides=_parse_json_object(row.get("profile_overrides_jsonb")),
    )


def set_user_active(conn: psycopg.Connection, *, username: str, is_active: bool) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE users
            SET is_active = %s, updated_at = NOW()
            WHERE username = %s
            """,
            (is_active, username.strip()),
        )
    conn.commit()


def load_user_snapshot_keys(conn: psycopg.Connection, *, user_id: int) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT current_job_keys_jsonb
            FROM user_state
            WHERE user_id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()
    if not row:
        return []
    return _parse_json_list(row.get("current_job_keys_jsonb")) or []


def load_sent_job_keys(
    conn: psycopg.Connection,
    *,
    user_id: int,
    max_age_days: int | None = None,
) -> list[str]:
    cutoff: datetime | None = None
    if max_age_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, int(max_age_days)))

    with conn.cursor() as cur:
        if cutoff is None:
            cur.execute(
                """
                SELECT job_key
                FROM sent_job_records
                WHERE user_id = %s
                """,
                (user_id,),
            )
        else:
            cur.execute(
                """
                SELECT job_key
                FROM sent_job_records
                WHERE user_id = %s
                  AND COALESCE(last_seen_at, first_sent_at) >= %s
                """,
                (user_id, cutoff),
            )
        rows = cur.fetchall()
    return [str(row["job_key"]) for row in rows if row.get("job_key")]


def get_user_state(conn: psycopg.Connection, user_id: int) -> DbUserState | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT user_id, last_run_at, last_email_sent_at, last_status, last_error
            FROM user_state
            WHERE user_id = %s
            """,
            (user_id,),
        )
        row = cur.fetchone()

    if not row:
        return None

    return DbUserState(
        user_id=int(row["user_id"]),
        last_run_at=row.get("last_run_at"),
        last_email_sent_at=row.get("last_email_sent_at"),
        last_status=_none_or_str(row.get("last_status")),
        last_error=_none_or_str(row.get("last_error")),
    )


def save_user_snapshot_keys(conn: psycopg.Connection, *, user_id: int, keys: list[str]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO user_state (user_id, current_job_keys_jsonb, updated_at)
            VALUES (%s, %s::jsonb, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET
              current_job_keys_jsonb = EXCLUDED.current_job_keys_jsonb,
              updated_at = NOW()
            """,
            (user_id, json.dumps(keys)),
        )
    conn.commit()


def upsert_user_state(
    conn: psycopg.Connection,
    *,
    user_id: int,
    current_job_keys: list[str],
    last_status: str,
    last_error: str | None = None,
    mark_email_sent: bool = False,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO user_state (
              user_id, current_job_keys_jsonb, last_run_at, last_email_sent_at,
              last_status, last_error, updated_at
            )
            VALUES (
              %s, %s::jsonb, NOW(), CASE WHEN %s THEN NOW() ELSE NULL END,
              %s, %s, NOW()
            )
            ON CONFLICT (user_id)
            DO UPDATE SET
              current_job_keys_jsonb = EXCLUDED.current_job_keys_jsonb,
              last_run_at = NOW(),
              last_email_sent_at = CASE
                WHEN %s THEN NOW()
                ELSE user_state.last_email_sent_at
              END,
              last_status = EXCLUDED.last_status,
              last_error = EXCLUDED.last_error,
              updated_at = NOW()
            """,
            (
                user_id,
                json.dumps(current_job_keys),
                mark_email_sent,
                last_status,
                last_error,
                mark_email_sent,
            ),
        )
    conn.commit()


def upsert_sent_job_records(
    conn: psycopg.Connection,
    *,
    user_id: int,
    jobs: list[dict[str, Any]],
) -> int:
    rows: list[tuple[Any, ...]] = []
    seen_keys: set[str] = set()
    for job in jobs:
        job_key = str(job.get("url") or "").strip()
        if not job_key:
            title = str(job.get("position") or "").strip()
            company = str(job.get("company") or "").strip()
            if title or company:
                job_key = f"{company}::{title}"
        if not job_key or job_key in seen_keys:
            continue
        seen_keys.add(job_key)
        rows.append(
            (
                user_id,
                job_key,
                _none_or_str(job.get("source")),
                _none_or_str(job.get("url")),
                _none_or_str(job.get("position")),
                _none_or_str(job.get("company")),
            )
        )

    if not rows:
        return 0

    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO sent_job_records (
              user_id, job_key, source, job_url, title, company, first_sent_at, last_seen_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
            ON CONFLICT (user_id, job_key)
            DO UPDATE SET
              source = COALESCE(EXCLUDED.source, sent_job_records.source),
              job_url = COALESCE(EXCLUDED.job_url, sent_job_records.job_url),
              title = COALESCE(EXCLUDED.title, sent_job_records.title),
              company = COALESCE(EXCLUDED.company, sent_job_records.company),
              last_seen_at = NOW()
            """,
            rows,
        )
    conn.commit()
    return len(rows)


def insert_run_log(
    conn: psycopg.Connection,
    *,
    user_id: int | None,
    run_type: str,
    status: str,
    fetched_jobs_count: int | None = None,
    keyword_jobs_count: int | None = None,
    emailed_jobs_count: int | None = None,
    sources_used: list[str] | None = None,
    error_message: str | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO run_logs (
              user_id, run_type, status, fetched_jobs_count, keyword_jobs_count,
              emailed_jobs_count, sources_used_jsonb, error_message, started_at, finished_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, NOW(), NOW())
            """,
            (
                user_id,
                run_type,
                status,
                fetched_jobs_count,
                keyword_jobs_count,
                emailed_jobs_count,
                _json_dumps_or_none(sources_used),
                error_message,
            ),
        )
    conn.commit()


def _row_to_user(row: dict[str, Any]) -> DbUser:
    return DbUser(
        id=int(row["id"]),
        username=str(row["username"]),
        email_to=str(row["email_to"]),
        is_active=bool(row["is_active"]),
        timezone=row.get("timezone"),
    )


def _none_or_str(value: str | None) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _bounded_optional_int(
    value: int | None,
    *,
    field: str,
    min_value: int,
    max_value: int,
) -> int | None:
    if value is None:
        return None
    n = int(value)
    if n < min_value or n > max_value:
        raise ValueError(f"{field} must be between {min_value} and {max_value}")
    return n


def _json_dumps_or_none(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value)


def _parse_json_list(value: Any) -> list[str] | None:
    if value is None:
        return None
    if isinstance(value, list):
        return [str(item) for item in value]
    return None


def _parse_json_object(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    return None
