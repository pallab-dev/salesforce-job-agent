from __future__ import annotations

import argparse
import sys
from pathlib import Path

from job_agent.agent import AgentOptions, run_agent
from job_agent.config import default_seen_jobs_path, load_settings
from job_agent.profile_config import load_profile_config, parse_sources_cli


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="AI job alert agent (Groq + Gmail)")
    parser.add_argument(
        "--profile",
        default=None,
        help="Profile name used for per-profile snapshot storage (e.g. GitHub Actions environment name)",
    )
    parser.add_argument("--keyword", default=None, help="Keyword to match in job titles (overrides profile config)")
    parser.add_argument(
        "--sources",
        default=None,
        help="Comma-separated source list (e.g. remoteok,remotive). Overrides profile config.",
    )
    parser.add_argument(
        "--llm-input-limit",
        type=int,
        default=None,
        help="Max jobs sent to the LLM prompt (overrides profile config)",
    )
    parser.add_argument(
        "--max-bullets",
        type=int,
        default=None,
        help="Max bullets expected from the LLM and included in email (overrides profile config)",
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
    parser.add_argument(
        "--profile-config",
        type=Path,
        default=None,
        help="Path to a profile YAML config file (defaults to config/profiles/<profile>.yml)",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    profile_name = (args.profile or "").strip() or None
    profile_cfg = load_profile_config(profile_name, args.profile_config)
    cli_sources = parse_sources_cli(args.sources)

    options = AgentOptions(
        profile=profile_name,
        keyword=(args.keyword or profile_cfg.keyword).strip() or profile_cfg.keyword,
        sources=cli_sources or profile_cfg.sources,
        remote_only=profile_cfg.remote_only,
        strict_senior_only=profile_cfg.strict_senior_only,
        llm_input_limit=max(1, args.llm_input_limit or profile_cfg.llm_input_limit),
        max_bullets=max(1, args.max_bullets or profile_cfg.max_bullets),
        dry_run=args.dry_run,
        dedupe_enabled=not args.disable_dedupe,
        seen_jobs_file=args.seen_file or default_seen_jobs_path(args.profile),
    )

    try:
        print(
            f"Profile config resolved: name={profile_cfg.name} "
            f"keyword={options.keyword} sources={','.join(options.sources or [])} "
            f"llm_input_limit={options.llm_input_limit} max_bullets={options.max_bullets} "
            f"remote_only={options.remote_only} strict_senior_only={options.strict_senior_only}"
        )
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
