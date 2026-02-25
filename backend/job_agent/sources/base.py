from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Protocol

from job_agent.config import Settings

SourceAccessMode = Literal["official_api", "public_html", "email", "custom"]
SourceRiskLevel = Literal["low", "medium", "high"]


@dataclass(frozen=True)
class SourceMetadata:
    name: str
    access_mode: SourceAccessMode = "official_api"
    risk_level: SourceRiskLevel = "low"
    requires_company_config: bool = False
    enabled_by_default: bool = True


@dataclass
class SourceFetchContext:
    settings: Settings
    shared_state: dict[str, Any]


class JobSource(Protocol):
    meta: SourceMetadata

    def fetch_jobs(self, ctx: SourceFetchContext) -> list[dict[str, Any]]:
        ...
