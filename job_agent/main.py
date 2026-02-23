from __future__ import annotations

import argparse
import sys
from pathlib import Path

from job_agent.agent import AgentOptions, run_agent
from job_agent.config import default_seen_jobs_path, load_settings


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI job alert agent (Groq + Gmail)")
    parser.add_argument(
        "--profile",
        default=None,
        help="Profile name used for per-profile snapshot storage (e.g. GitHub Actions environment name)",
    )
    parser.add_argument("--keyword", default="developer", help="Keyword to match in job titles")
    parser.add_argument(
        "--llm-input-limit",
        type=int,
        default=15,
        help="Max jobs sent to the LLM prompt",
    )
    parser.add_argument(
        "--max-bullets",
        type=int,
        default=8,
        help="Max bullets expected from the LLM and included in email",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the result instead of sending email",
    )
    parser.add_argument(
        "--disable-dedupe",
        action="store_true",
        help="Disable seen-jobs filtering",
    )
    parser.add_argument(
        "--seen-file",
        type=Path,
        default=None,
        help="Path to seen jobs JSON file",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    options = AgentOptions(
        profile=(args.profile or "").strip() or None,
        keyword=args.keyword,
        llm_input_limit=max(1, args.llm_input_limit),
        max_bullets=max(1, args.max_bullets),
        dry_run=args.dry_run,
        dedupe_enabled=not args.disable_dedupe,
        seen_jobs_file=args.seen_file or default_seen_jobs_path(args.profile),
    )

    try:
        settings = load_settings()
        return run_agent(settings, options)
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130
    except Exception as exc:  # keep CLI simple for GitHub Actions logs
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
