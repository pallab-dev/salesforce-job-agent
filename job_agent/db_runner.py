from __future__ import annotations

from dataclasses import replace
from typing import Any

from job_agent.agent import AgentOptions, run_agent
from job_agent.config import Settings
from job_agent.profile_config import load_profile_config
from job_agent.storage import postgres_db


class DbSnapshotStore:
    def __init__(self, conn: Any, user_id: int):
        self.conn = conn
        self.user_id = user_id
        self.last_saved_keys: list[str] = []

    def load(self) -> set[str]:
        keys = postgres_db.load_user_snapshot_keys(self.conn, user_id=self.user_id)
        self.last_saved_keys = list(keys)
        return set(keys)

    def save(self, keys: set[str]) -> None:
        normalized = sorted({str(k) for k in keys if str(k).strip()})
        postgres_db.save_user_snapshot_keys(self.conn, user_id=self.user_id, keys=normalized)
        self.last_saved_keys = normalized


def run_all_users_from_db(
    *,
    settings: Settings,
    dry_run: bool = False,
    run_type: str = "scheduled",
) -> int:
    with postgres_db.connect() as conn:
        users = postgres_db.list_users(conn, active_only=True)
        if not users:
            print("No active users found in DB. Nothing to run.")
            return 0

        print(f"Running agent for {len(users)} active DB user(s)")
        failures = 0

        for user in users:
            user_settings = replace(settings, email_to=user.email_to)
            profile_cfg = load_profile_config(user.username)
            prefs = postgres_db.get_user_preferences(conn, user.id)
            snapshot_store = DbSnapshotStore(conn, user.id)

            options = AgentOptions(
                profile=user.username,
                keyword=(prefs.keyword if prefs and prefs.keyword else profile_cfg.keyword),
                sources=profile_cfg.sources,
                remote_only=(
                    prefs.remote_only if prefs and prefs.remote_only is not None else profile_cfg.remote_only
                ),
                strict_senior_only=(
                    prefs.strict_senior_only
                    if prefs and prefs.strict_senior_only is not None
                    else profile_cfg.strict_senior_only
                ),
                llm_input_limit=(
                    prefs.llm_input_limit
                    if prefs and prefs.llm_input_limit is not None
                    else profile_cfg.llm_input_limit
                ),
                max_bullets=(
                    prefs.max_bullets if prefs and prefs.max_bullets is not None else profile_cfg.max_bullets
                ),
                dry_run=dry_run,
                dedupe_enabled=True,
                seen_jobs_file=None,
                snapshot_store=snapshot_store,
            )

            print(f"\n=== DB user: {user.username} ({user.email_to}) ===")
            try:
                exit_code = run_agent(user_settings, options)
                status = "success" if exit_code == 0 else "error"
                if exit_code != 0:
                    failures += 1
                postgres_db.insert_run_log(
                    conn,
                    user_id=user.id,
                    run_type=run_type,
                    status=status,
                    sources_used=options.sources,
                )
                postgres_db.upsert_user_state(
                    conn,
                    user_id=user.id,
                    current_job_keys=snapshot_store.last_saved_keys,
                    last_status=status,
                    last_error=None if status == "success" else "Agent returned non-zero exit code",
                    mark_email_sent=False,
                )
            except Exception as exc:
                failures += 1
                print(f"DB user run failed ({user.username}): {exc}")
                postgres_db.insert_run_log(
                    conn,
                    user_id=user.id,
                    run_type=run_type,
                    status="error",
                    sources_used=options.sources,
                    error_message=str(exc),
                )
                postgres_db.upsert_user_state(
                    conn,
                    user_id=user.id,
                    current_job_keys=snapshot_store.last_saved_keys,
                    last_status="error",
                    last_error=str(exc),
                    mark_email_sent=False,
                )

        return 1 if failures else 0


def run_single_user_from_db(
    *,
    settings: Settings,
    username: str,
    dry_run: bool = False,
    run_type: str = "manual",
) -> int:
    with postgres_db.connect() as conn:
        user = postgres_db.get_user_by_username(conn, username)
        if not user:
            raise RuntimeError(f"DB user not found: {username}")
        if not user.is_active:
            print(f"DB user '{username}' is inactive. Skipping.")
            return 0

        user_settings = replace(settings, email_to=user.email_to)
        profile_cfg = load_profile_config(user.username)
        prefs = postgres_db.get_user_preferences(conn, user.id)
        snapshot_store = DbSnapshotStore(conn, user.id)

        options = AgentOptions(
            profile=user.username,
            keyword=(prefs.keyword if prefs and prefs.keyword else profile_cfg.keyword),
            sources=profile_cfg.sources,
            remote_only=(prefs.remote_only if prefs and prefs.remote_only is not None else profile_cfg.remote_only),
            strict_senior_only=(
                prefs.strict_senior_only
                if prefs and prefs.strict_senior_only is not None
                else profile_cfg.strict_senior_only
            ),
            llm_input_limit=(
                prefs.llm_input_limit if prefs and prefs.llm_input_limit is not None else profile_cfg.llm_input_limit
            ),
            max_bullets=(prefs.max_bullets if prefs and prefs.max_bullets is not None else profile_cfg.max_bullets),
            dry_run=dry_run,
            dedupe_enabled=True,
            seen_jobs_file=None,
            snapshot_store=snapshot_store,
        )

        return run_agent(user_settings, options)
