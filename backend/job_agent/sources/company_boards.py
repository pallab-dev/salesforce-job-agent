from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml


BACKEND_ROOT = Path(__file__).resolve().parents[2]
COMPANIES_CONFIG_PATH = BACKEND_ROOT / "config/sources/companies.yml"
SOURCE_VALIDATION_CACHE_PATH = BACKEND_ROOT / ".job_agent/source_validation_cache.json"


def load_companies_config(
    path: Path | None = None,
    *,
    respect_runtime_validation: bool = True,
) -> dict[str, list[dict[str, Any]]]:
    config_path = path or COMPANIES_CONFIG_PATH
    validation_cache = load_source_validation_cache() if respect_runtime_validation else None
    if not config_path.exists():
        return {
            "greenhouse": [],
            "lever": [],
            "workday": [],
            "ashby": [],
            "smartrecruiters": [],
            "bamboohr": [],
            "jobvite": [],
            "icims": [],
            "personio": [],
            "recruitee": [],
            "custom_careers": [],
        }

    try:
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise RuntimeError(f"Unable to read company source config: {config_path}") from exc

    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise RuntimeError(f"Company source config must be a mapping: {config_path}")

    return {
        "greenhouse": _normalize_entries("greenhouse", raw.get("greenhouse"), validation_cache),
        "lever": _normalize_entries("lever", raw.get("lever"), validation_cache),
        "workday": _normalize_entries("workday", raw.get("workday"), validation_cache),
        "ashby": _normalize_entries("ashby", raw.get("ashby"), validation_cache),
        "smartrecruiters": _normalize_entries("smartrecruiters", raw.get("smartrecruiters"), validation_cache),
        "bamboohr": _normalize_entries("bamboohr", raw.get("bamboohr"), validation_cache),
        "jobvite": _normalize_entries("jobvite", raw.get("jobvite"), validation_cache),
        "icims": _normalize_entries("icims", raw.get("icims"), validation_cache),
        "personio": _normalize_entries("personio", raw.get("personio"), validation_cache),
        "recruitee": _normalize_entries("recruitee", raw.get("recruitee"), validation_cache),
        "custom_careers": _normalize_entries("custom_careers", raw.get("custom_careers"), validation_cache),
    }


def _normalize_entries(
    source_name: str,
    value: Any,
    validation_cache: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        return []

    result: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, str):
            entry = {"slug": item, "active": True}
            if _entry_enabled_by_runtime(source_name, entry, validation_cache):
                result.append(entry)
            continue
        if isinstance(item, dict):
            if item.get("active", True) is False:
                continue
            entry = dict(item)
            if not _entry_enabled_by_runtime(source_name, entry, validation_cache):
                continue
            result.append(entry)
    return result


def load_source_validation_cache(path: Path | None = None) -> dict[str, Any]:
    cache_path = path or SOURCE_VALIDATION_CACHE_PATH
    if not cache_path.exists():
        return {}
    try:
        raw = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    entries = raw.get("entries")
    return entries if isinstance(entries, dict) else {}


def source_entry_runtime_key(source_name: str, entry: dict[str, Any]) -> str:
    identifier_fields = (
        "board_token",
        "company_slug",
        "slug",
        "subdomain",
        "source_key",
        "api_url",
        "json_url",
        "xml_url",
        "rss_url",
        "host",
        "listing_url",
        "careers_url",
        "company",
    )
    for field in identifier_fields:
        value = str(entry.get(field) or "").strip()
        if value:
            return f"{source_name}:{field}:{value.lower()}"
    return f"{source_name}:company:unknown"


def _entry_enabled_by_runtime(
    source_name: str,
    entry: dict[str, Any],
    validation_cache: dict[str, Any] | None,
) -> bool:
    state = str(entry.get("onboarding_state") or "").strip().lower()
    if not state:
        return True
    if state == "active":
        return True
    if state in {"paused", "rejected"}:
        return False
    if state != "candidate":
        return True
    if validation_cache is None:
        return True

    key = source_entry_runtime_key(source_name, entry)
    cached = validation_cache.get(key) if isinstance(validation_cache, dict) else None
    if not isinstance(cached, dict):
        return False
    return str(cached.get("runtime_state") or "").strip().lower() == "active"
