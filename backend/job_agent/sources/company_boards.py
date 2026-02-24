from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


COMPANIES_CONFIG_PATH = Path("config/sources/companies.yml")


def load_companies_config(path: Path | None = None) -> dict[str, list[dict[str, Any]]]:
    config_path = path or COMPANIES_CONFIG_PATH
    if not config_path.exists():
        return {"greenhouse": [], "lever": [], "workday": []}

    try:
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise RuntimeError(f"Unable to read company source config: {config_path}") from exc

    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise RuntimeError(f"Company source config must be a mapping: {config_path}")

    return {
        "greenhouse": _normalize_entries(raw.get("greenhouse")),
        "lever": _normalize_entries(raw.get("lever")),
        "workday": _normalize_entries(raw.get("workday")),
    }


def _normalize_entries(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        return []

    result: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, str):
            result.append({"slug": item, "active": True})
            continue
        if isinstance(item, dict):
            if item.get("active", True) is False:
                continue
            result.append(dict(item))
    return result

