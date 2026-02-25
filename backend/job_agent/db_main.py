from __future__ import annotations

import argparse
import sys

from job_agent.config import load_settings
from job_agent.db_runner import run_all_users_from_db, run_single_user_from_db
from job_agent.source_onboarding import (
    ValidationOptions,
    format_validation_cache_report,
    load_validation_cache_report,
    validate_company_sources,
)
from job_agent.storage import postgres_db


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="DB-backed user management and runner (PostgreSQL)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    db_parser = subparsers.add_parser("db", help="Database operations")
    db_subparsers = db_parser.add_subparsers(dest="db_command", required=True)
    db_subparsers.add_parser("init", help="Initialize PostgreSQL schema")

    users_parser = subparsers.add_parser("users", help="Manage DB users")
    users_subparsers = users_parser.add_subparsers(dest="users_command", required=True)

    add_user = users_subparsers.add_parser("add", help="Create or update a user")
    add_user.add_argument("--username", required=True)
    add_user.add_argument("--email-to", required=True)
    add_user.add_argument("--timezone", default=None)
    add_user.add_argument("--inactive", action="store_true")
    add_user.add_argument("--keyword", default=None)
    add_user.add_argument("--llm-input-limit", type=int, default=None)
    add_user.add_argument("--max-bullets", type=int, default=None)
    add_user.add_argument("--remote-only", dest="remote_only", action="store_true")
    add_user.add_argument("--no-remote-only", dest="remote_only", action="store_false")
    add_user.set_defaults(remote_only=None)
    add_user.add_argument("--strict-senior-only", dest="strict_senior_only", action="store_true")
    add_user.add_argument("--no-strict-senior-only", dest="strict_senior_only", action="store_false")
    add_user.set_defaults(strict_senior_only=None)

    list_users = users_subparsers.add_parser("list", help="List users")
    list_users.add_argument("--active-only", action="store_true")

    deactivate = users_subparsers.add_parser("deactivate", help="Deactivate a user")
    deactivate.add_argument("--username", required=True)

    activate = users_subparsers.add_parser("activate", help="Activate a user")
    activate.add_argument("--username", required=True)

    run_parser = subparsers.add_parser("run", help="Run agent using DB users")
    run_group = run_parser.add_mutually_exclusive_group(required=True)
    run_group.add_argument("--all-users", action="store_true")
    run_group.add_argument("--user", default=None, help="Single DB username to run")
    run_parser.add_argument("--dry-run", action="store_true")
    run_parser.add_argument("--init-db", action="store_true", help="Initialize schema before running")
    run_parser.add_argument(
        "--validate-sources",
        dest="validate_sources",
        action="store_true",
        help="Validate company source candidates before running (default for --all-users).",
    )
    run_parser.add_argument(
        "--no-validate-sources",
        dest="validate_sources",
        action="store_false",
        help="Skip source validation before running.",
    )
    run_parser.set_defaults(validate_sources=None)
    run_parser.add_argument("--source-validate-all", action="store_true", help="Validate all company source entries, not just onboarding candidates.")
    run_parser.add_argument("--source-validate-min-jobs", type=int, default=1, help="Minimum jobs required to auto-activate a candidate during pre-run validation.")
    run_parser.add_argument(
        "--source-validate-pause-after-failures",
        type=int,
        default=3,
        help="Pause source after this many consecutive validation failures/no-job results.",
    )
    run_parser.add_argument(
        "--source-validate-timeout-seconds",
        type=int,
        default=None,
        help="Override timeout for pre-run source validation requests.",
    )

    sources_parser = subparsers.add_parser("sources", help="Company-source onboarding and validation")
    sources_subparsers = sources_parser.add_subparsers(dest="sources_command", required=True)
    validate_sources = sources_subparsers.add_parser("validate", help="Validate configured company sources and auto-update runtime state cache")
    validate_sources.add_argument("--all", action="store_true", help="Validate all configured entries, not just onboarding_state=candidate")
    validate_sources.add_argument("--min-jobs", type=int, default=1, help="Minimum jobs required to auto-activate a candidate")
    validate_sources.add_argument("--pause-after-failures", type=int, default=3, help="Pause source after this many consecutive failures/no-job validations")
    validate_sources.add_argument("--timeout-seconds", type=int, default=None, help="Override HTTP timeout for validation requests")
    report_sources = sources_subparsers.add_parser("report", help="Print a readable source validation cache report")
    report_sources.add_argument("--max-rows", type=int, default=10, help="Max companies to print per group")
    return parser


def main() -> int:
    args = build_parser().parse_args()

    try:
        if args.command == "db":
            return _handle_db(args)
        if args.command == "users":
            return _handle_users(args)
        if args.command == "run":
            return _handle_run(args)
        if args.command == "sources":
            return _handle_sources(args)
        raise RuntimeError(f"Unknown command: {args.command}")
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


def _handle_db(args: argparse.Namespace) -> int:
    with postgres_db.connect() as conn:
        if args.db_command == "init":
            postgres_db.init_schema(conn)
            print("PostgreSQL schema initialized.")
            return 0
    return 1


def _handle_users(args: argparse.Namespace) -> int:
    with postgres_db.connect() as conn:
        if args.users_command == "add":
            user = postgres_db.upsert_user(
                conn,
                username=args.username,
                email_to=args.email_to,
                timezone=args.timezone,
                is_active=not args.inactive,
            )
            if any(
                value is not None
                for value in (
                    args.keyword,
                    args.llm_input_limit,
                    args.max_bullets,
                    args.remote_only,
                    args.strict_senior_only,
                )
            ):
                postgres_db.set_user_preferences(
                    conn,
                    user_id=user.id,
                    keyword=args.keyword,
                    llm_input_limit=args.llm_input_limit,
                    max_bullets=args.max_bullets,
                    remote_only=args.remote_only,
                    strict_senior_only=args.strict_senior_only,
                )
            print(f"User saved: {user.username} -> {user.email_to} (active={user.is_active})")
            return 0

        if args.users_command == "list":
            users = postgres_db.list_users(conn, active_only=args.active_only)
            if not users:
                print("No users found.")
                return 0
            for user in users:
                prefs = postgres_db.get_user_preferences(conn, user.id)
                keyword = prefs.keyword if prefs and prefs.keyword else "-"
                print(
                    f"{user.username}\tactive={user.is_active}\temail_to={user.email_to}\t"
                    f"keyword={keyword}"
                )
            return 0

        if args.users_command == "deactivate":
            postgres_db.set_user_active(conn, username=args.username, is_active=False)
            print(f"User deactivated: {args.username}")
            return 0

        if args.users_command == "activate":
            postgres_db.set_user_active(conn, username=args.username, is_active=True)
            print(f"User activated: {args.username}")
            return 0
    return 1


def _handle_run(args: argparse.Namespace) -> int:
    with postgres_db.connect() as conn:
        if args.init_db:
            postgres_db.init_schema(conn)
            print("PostgreSQL schema initialized.")

    settings = load_settings()
    if args.all_users:
        should_validate_sources = bool(args.validate_sources) if args.validate_sources is not None else True
        if should_validate_sources:
            print("Running company source validation before scheduled run...")
            result = validate_company_sources(
                settings,
                ValidationOptions(
                    candidates_only=not bool(args.source_validate_all),
                    min_jobs_for_activation=max(1, int(args.source_validate_min_jobs)),
                    pause_after_failures=max(1, int(args.source_validate_pause_after_failures)),
                    timeout_seconds_override=args.source_validate_timeout_seconds,
                ),
            )
            summary = result.get("summary", {})
            print(
                "Source validation summary: "
                "checked={checked} active={active} candidate={candidate} paused={paused} "
                "errors={errors} no_jobs={no_jobs} with_india_jobs={with_india_jobs}".format(
                    checked=summary.get("checked", 0),
                    active=summary.get("active", 0),
                    candidate=summary.get("candidate", 0),
                    paused=summary.get("paused", 0),
                    errors=summary.get("errors", 0),
                    no_jobs=summary.get("no_jobs", 0),
                    with_india_jobs=summary.get("with_india_jobs", 0),
                )
            )
        exit_code = run_all_users_from_db(settings=settings, dry_run=args.dry_run, run_type="scheduled")
        print()
        print(format_validation_cache_report(load_validation_cache_report(), max_rows_per_group=8))
        return exit_code
    if args.user:
        return run_single_user_from_db(
            settings=settings,
            username=args.user,
            dry_run=args.dry_run,
            run_type="manual",
        )
    raise RuntimeError("Either --all-users or --user is required")


def _handle_sources(args: argparse.Namespace) -> int:
    if args.sources_command == "report":
        print(format_validation_cache_report(load_validation_cache_report(), max_rows_per_group=max(1, int(args.max_rows))))
        return 0
    if args.sources_command != "validate":
        raise RuntimeError(f"Unknown sources command: {args.sources_command}")
    settings = load_settings()
    result = validate_company_sources(
        settings,
        ValidationOptions(
            candidates_only=not bool(args.all),
            min_jobs_for_activation=max(1, int(args.min_jobs)),
            pause_after_failures=max(1, int(args.pause_after_failures)),
            timeout_seconds_override=args.timeout_seconds,
        ),
    )
    summary = result.get("summary", {})
    print("Source validation cache updated.")
    print(
        "checked={checked} active={active} candidate={candidate} paused={paused} "
        "errors={errors} no_jobs={no_jobs} with_india_jobs={with_india_jobs}".format(
            checked=summary.get("checked", 0),
            active=summary.get("active", 0),
            candidate=summary.get("candidate", 0),
            paused=summary.get("paused", 0),
            errors=summary.get("errors", 0),
            no_jobs=summary.get("no_jobs", 0),
            with_india_jobs=summary.get("with_india_jobs", 0),
        )
    )
    print(format_validation_cache_report(load_validation_cache_report(), max_rows_per_group=8))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
