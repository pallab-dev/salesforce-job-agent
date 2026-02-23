from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class ProfileConfig:
    name: str
    keyword: str = "developer"
    sources: list[str] = field(default_factory=lambda: ["remoteok"])
    llm_input_limit: int = 15
    max_bullets: int = 8
    remote_only: bool = True
    strict_senior_only: bool = True


def default_profile_config_path(profile_name: str | None) -> Path:
    slug = (profile_name or "default").strip() or "default"
    return Path("config/profiles") / f"{slug}.yml"


def load_profile_config(profile_name: str | None, config_path: Path | None = None) -> ProfileConfig:
    name = (profile_name or "default").strip() or "default"
    path = config_path or default_profile_config_path(profile_name)

    if not path.exists():
        return ProfileConfig(name=name)

    data = _read_yaml_mapping(path)
    return _parse_profile_config(name=name, data=data)


def _read_yaml_mapping(path: Path) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise RuntimeError(f"Unable to read config file: {path}") from exc
    except yaml.YAMLError as exc:
        raise RuntimeError(f"Invalid YAML in config file: {path}") from exc

    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise RuntimeError(f"Profile config must be a YAML mapping/object: {path}")
    return raw


def _parse_profile_config(*, name: str, data: dict[str, Any]) -> ProfileConfig:
    sources = data.get("sources", ["remoteok"])
    if not isinstance(sources, list):
        raise RuntimeError("Profile config 'sources' must be a list")

    limits = data.get("limits") or {}
    if limits is None:
        limits = {}
    if not isinstance(limits, dict):
        raise RuntimeError("Profile config 'limits' must be a mapping")

    filters = data.get("filters") or {}
    if filters is None:
        filters = {}
    if not isinstance(filters, dict):
        raise RuntimeError("Profile config 'filters' must be a mapping")

    keyword = str(data.get("keyword") or "developer").strip() or "developer"
    llm_input_limit = int(limits.get("llm_input_limit") or 15)
    max_bullets = int(limits.get("max_bullets") or limits.get("max_email_jobs") or 8)
    remote_only = bool(filters.get("remote_only", True))
    strict_senior_only = bool(filters.get("strict_senior_only", True))

    normalized_sources = [str(item).strip().lower() for item in sources if str(item).strip()]
    if not normalized_sources:
        normalized_sources = ["remoteok"]

    return ProfileConfig(
        name=name,
        keyword=keyword,
        sources=normalized_sources,
        llm_input_limit=max(1, llm_input_limit),
        max_bullets=max(1, max_bullets),
        remote_only=remote_only,
        strict_senior_only=strict_senior_only,
    )


def parse_sources_cli(value: str | None) -> list[str] | None:
    if value is None:
        return None
    items = [item.strip().lower() for item in value.split(",")]
    result = [item for item in items if item]
    return result or None

