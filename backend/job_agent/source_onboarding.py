from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any

from job_agent.config import Settings
from job_agent.sources import global_ats, greenhouse, lever, workday_custom
from job_agent.sources.company_boards import (
    COMPANIES_CONFIG_PATH,
    SOURCE_VALIDATION_CACHE_PATH,
    load_companies_config,
    load_source_validation_cache,
    source_entry_runtime_key,
)
from job_agent.utils.location_normalization import normalize_jobs_locations


@dataclass(frozen=True)
class ValidationOptions:
    candidates_only: bool = True
    min_jobs_for_activation: int = 1
    pause_after_failures: int = 3
    timeout_seconds_override: int | None = None
    config_path: Path | None = None
    cache_path: Path | None = None


FETCHERS: dict[str, Any] = {
    "greenhouse": greenhouse.fetch_jobs,
    "lever": lever.fetch_jobs,
    "workday": workday_custom.fetch_jobs,
    "ashby": global_ats.fetch_ashby_jobs,
    "smartrecruiters": global_ats.fetch_smartrecruiters_jobs,
    "bamboohr": global_ats.fetch_bamboohr_jobs,
    "jobvite": global_ats.fetch_jobvite_jobs,
    "icims": global_ats.fetch_icims_jobs,
    "personio": global_ats.fetch_personio_jobs,
    "recruitee": global_ats.fetch_recruitee_jobs,
    "custom_careers": global_ats.fetch_custom_careers_jobs,
}


def validate_company_sources(settings: Settings, options: ValidationOptions | None = None) -> dict[str, Any]:
    opts = options or ValidationOptions()
    config_path = opts.config_path or COMPANIES_CONFIG_PATH
    cache_path = opts.cache_path or SOURCE_VALIDATION_CACHE_PATH
    timeout_seconds = opts.timeout_seconds_override or settings.request_timeout_seconds

    company_cfg = load_companies_config(config_path, respect_runtime_validation=False)
    previous_entries = load_source_validation_cache(cache_path)

    out_entries: dict[str, dict[str, Any]] = {}
    summary = {
        "checked": 0,
        "active": 0,
        "candidate": 0,
        "paused": 0,
        "rejected": 0,
        "errors": 0,
        "no_jobs": 0,
        "with_india_jobs": 0,
    }

    for source_name, entries in company_cfg.items():
        fetch_fn = FETCHERS.get(source_name)
        if fetch_fn is None:
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            if entry.get("active", True) is False:
                continue
            configured_state = str(entry.get("onboarding_state") or "").strip().lower() or "active"
            if opts.candidates_only and configured_state != "candidate":
                continue

            key = source_entry_runtime_key(source_name, entry)
            prev = previous_entries.get(key) if isinstance(previous_entries.get(key), dict) else {}
            checked = _validate_single_entry(
                source_name=source_name,
                entry=entry,
                fetch_fn=fetch_fn,
                timeout_seconds=timeout_seconds,
                prev=prev,
                min_jobs_for_activation=opts.min_jobs_for_activation,
                pause_after_failures=opts.pause_after_failures,
            )
            out_entries[key] = checked

            summary["checked"] += 1
            runtime_state = str(checked.get("runtime_state") or "candidate")
            if runtime_state in summary:
                summary[runtime_state] += 1
            if checked.get("status") == "error":
                summary["errors"] += 1
            if checked.get("status") == "no_jobs":
                summary["no_jobs"] += 1
            if int(checked.get("india_jobs_count") or 0) > 0:
                summary["with_india_jobs"] += 1

    # Carry forward untouched entries so runtime gating remains stable for non-checked sources.
    for key, value in previous_entries.items():
        if key not in out_entries and isinstance(value, dict):
            out_entries[key] = value

    payload = {
        "version": 1,
        "updated_at": _utc_now_iso(),
        "summary": summary,
        "entries": out_entries,
    }
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return payload


def _validate_single_entry(
    *,
    source_name: str,
    entry: dict[str, Any],
    fetch_fn: Any,
    timeout_seconds: int,
    prev: dict[str, Any],
    min_jobs_for_activation: int,
    pause_after_failures: int,
) -> dict[str, Any]:
    start = perf_counter()
    base = {
        "source_name": source_name,
        "company": str(entry.get("company") or entry.get("slug") or "").strip() or "Unknown",
        "identifier": source_entry_runtime_key(source_name, entry),
        "checked_at": _utc_now_iso(),
    }

    try:
        jobs = fetch_fn([entry], timeout_seconds)
        normalize_jobs_locations(jobs)
        duration_ms = int((perf_counter() - start) * 1000)
        jobs_count = len(jobs)
        fetch_status = str(entry.get("_last_fetch_status") or "").strip().lower() if isinstance(entry, dict) else ""
        fetch_error = str(entry.get("_last_fetch_error") or "").strip() if isinstance(entry, dict) else ""
        fetch_url = str(entry.get("_last_fetch_url") or "").strip() if isinstance(entry, dict) else ""
        india_jobs_count = sum(1 for job in jobs if str(job.get("location_country") or "").strip().lower() == "india")
        sample_locations = []
        for job in jobs[:8]:
            loc = str(job.get("location") or job.get("location_text") or "").strip()
            if loc and loc not in sample_locations:
                sample_locations.append(loc)

        if jobs_count == 0 and fetch_status == "error":
            consecutive_failures = int(prev.get("consecutive_failures") or 0) + 1
            runtime_state = "paused" if consecutive_failures >= pause_after_failures else "candidate"
            return {
                **base,
                "status": "error",
                "runtime_state": runtime_state,
                "jobs_count": 0,
                "india_jobs_count": 0,
                "latency_ms": duration_ms,
                "consecutive_failures": consecutive_failures,
                "no_jobs_streak": int(prev.get("no_jobs_streak") or 0),
                "sample_locations": [],
                "last_error": fetch_error or "fetch failed",
                "last_url": fetch_url or None,
            }

        consecutive_failures = 0
        no_jobs_streak = int(prev.get("no_jobs_streak") or 0)
        runtime_state = "candidate"
        status = "ok"
        error = None
        if jobs_count >= min_jobs_for_activation:
            runtime_state = "active"
            no_jobs_streak = 0
        else:
            status = "no_jobs"
            no_jobs_streak += 1
            runtime_state = "candidate" if no_jobs_streak < pause_after_failures else "paused"

        return {
            **base,
            "status": status,
            "runtime_state": runtime_state,
            "jobs_count": jobs_count,
            "india_jobs_count": india_jobs_count,
            "latency_ms": duration_ms,
            "consecutive_failures": consecutive_failures,
            "no_jobs_streak": no_jobs_streak,
            "sample_locations": sample_locations,
            "last_error": error,
            "last_url": fetch_url or None,
        }
    except Exception as exc:
        duration_ms = int((perf_counter() - start) * 1000)
        consecutive_failures = int(prev.get("consecutive_failures") or 0) + 1
        runtime_state = "paused" if consecutive_failures >= pause_after_failures else "candidate"
        return {
            **base,
            "status": "error",
            "runtime_state": runtime_state,
            "jobs_count": 0,
            "india_jobs_count": 0,
            "latency_ms": duration_ms,
            "consecutive_failures": consecutive_failures,
            "no_jobs_streak": int(prev.get("no_jobs_streak") or 0),
            "sample_locations": [],
            "last_error": str(exc),
            "last_url": str(entry.get("_last_fetch_url") or "") if isinstance(entry, dict) else None,
        }


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_validation_cache_report(cache_path: Path | None = None) -> dict[str, Any]:
    path = cache_path or SOURCE_VALIDATION_CACHE_PATH
    if not path.exists():
        return {
            "exists": False,
            "path": str(path),
            "updated_at": None,
            "summary": {},
            "groups": {"active": [], "paused": [], "candidate": [], "error": [], "no_jobs": []},
        }
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "exists": False,
            "path": str(path),
            "updated_at": None,
            "summary": {},
            "groups": {"active": [], "paused": [], "candidate": [], "error": [], "no_jobs": []},
        }

    entries = payload.get("entries")
    if not isinstance(entries, dict):
        entries = {}
    values = [v for v in entries.values() if isinstance(v, dict)]

    def _row(v: dict[str, Any]) -> dict[str, Any]:
        return {
            "company": str(v.get("company") or "Unknown"),
            "source_name": str(v.get("source_name") or ""),
            "runtime_state": str(v.get("runtime_state") or ""),
            "status": str(v.get("status") or ""),
            "jobs_count": int(v.get("jobs_count") or 0),
            "india_jobs_count": int(v.get("india_jobs_count") or 0),
            "last_error": str(v.get("last_error") or "") or None,
            "last_url": str(v.get("last_url") or "") or None,
        }

    groups = {
        "active": sorted(
            [_row(v) for v in values if str(v.get("runtime_state") or "") == "active"],
            key=lambda r: (-r["jobs_count"], r["company"].lower()),
        ),
        "paused": sorted(
            [_row(v) for v in values if str(v.get("runtime_state") or "") == "paused"],
            key=lambda r: (r["company"].lower()),
        ),
        "candidate": sorted(
            [_row(v) for v in values if str(v.get("runtime_state") or "") == "candidate"],
            key=lambda r: (r["company"].lower()),
        ),
        "error": sorted(
            [_row(v) for v in values if str(v.get("status") or "") == "error"],
            key=lambda r: (r["company"].lower()),
        ),
        "no_jobs": sorted(
            [_row(v) for v in values if str(v.get("status") or "") == "no_jobs"],
            key=lambda r: (r["company"].lower()),
        ),
    }
    return {
        "exists": True,
        "path": str(path),
        "updated_at": payload.get("updated_at"),
        "summary": payload.get("summary") if isinstance(payload.get("summary"), dict) else {},
        "groups": groups,
    }


def format_validation_cache_report(report: dict[str, Any], *, max_rows_per_group: int = 10) -> str:
    if not report.get("exists"):
        return f"Source validation cache not found: {report.get('path')}"

    summary = report.get("summary") if isinstance(report.get("summary"), dict) else {}
    groups = report.get("groups") if isinstance(report.get("groups"), dict) else {}
    lines = [
        f"Source Cache Report ({report.get('updated_at') or 'unknown time'})",
        (
            "summary: checked={checked} active={active} candidate={candidate} paused={paused} "
            "errors={errors} no_jobs={no_jobs} with_india_jobs={with_india_jobs}"
        ).format(
            checked=summary.get("checked", 0),
            active=summary.get("active", 0),
            candidate=summary.get("candidate", 0),
            paused=summary.get("paused", 0),
            errors=summary.get("errors", 0),
            no_jobs=summary.get("no_jobs", 0),
            with_india_jobs=summary.get("with_india_jobs", 0),
        ),
    ]

    for group_name in ("active", "paused", "error", "no_jobs", "candidate"):
        rows = groups.get(group_name)
        if not isinstance(rows, list) or not rows:
            continue
        lines.append(f"{group_name} ({len(rows)}):")
        for row in rows[: max(1, max_rows_per_group)]:
            suffix = ""
            if group_name == "active":
                suffix = f" jobs={row.get('jobs_count', 0)} india={row.get('india_jobs_count', 0)}"
            elif group_name in {"paused", "error"} and row.get("last_error"):
                suffix = f" error={row.get('last_error')}"
            elif group_name == "no_jobs":
                suffix = " no_jobs"
            lines.append(f"- {row.get('company')} [{row.get('source_name')}] {suffix}".rstrip())
        remaining = len(rows) - max(1, max_rows_per_group)
        if remaining > 0:
            lines.append(f"- ... +{remaining} more")
    return "\n".join(lines)
