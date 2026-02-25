from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from job_agent.config import Settings
from job_agent.sources import greenhouse
from job_agent.sources import global_ats
from job_agent.sources import lever
from job_agent.sources import remotive
from job_agent.sources import remoteok
from job_agent.sources import workday_custom
from job_agent.sources.base import JobSource, SourceFetchContext, SourceMetadata
from job_agent.sources.company_boards import load_companies_config
from job_agent.utils.location_normalization import normalize_jobs_locations


@dataclass(frozen=True)
class _RemoteOkSource:
    meta: SourceMetadata = SourceMetadata(name="remoteok", access_mode="official_api", risk_level="low")

    def fetch_jobs(self, ctx: SourceFetchContext) -> list[dict[str, Any]]:
        source_jobs = remoteok.fetch_jobs(ctx.settings.remoteok_api_url, ctx.settings.request_timeout_seconds)
        for job in source_jobs:
            if "_source" not in job:
                job["_source"] = "remoteok"
        return source_jobs


@dataclass(frozen=True)
class _RemotiveSource:
    meta: SourceMetadata = SourceMetadata(name="remotive", access_mode="official_api", risk_level="low")

    def fetch_jobs(self, ctx: SourceFetchContext) -> list[dict[str, Any]]:
        return remotive.fetch_jobs(ctx.settings.request_timeout_seconds)


@dataclass(frozen=True)
class _CompanyBoardsSource:
    source_name: str
    company_config_key: str
    fetch_fn: Any
    meta: SourceMetadata

    def fetch_jobs(self, ctx: SourceFetchContext) -> list[dict[str, Any]]:
        company_cfg = _load_company_cfg_cached(ctx.shared_state)
        entries = company_cfg.get(self.company_config_key, [])
        return self.fetch_fn(entries, ctx.settings.request_timeout_seconds)


def _load_company_cfg_cached(shared_state: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    cache_key = "company_boards_config"
    cached = shared_state.get(cache_key)
    if isinstance(cached, dict):
        return cached
    company_cfg = load_companies_config()
    shared_state[cache_key] = company_cfg
    return company_cfg


SOURCES: dict[str, JobSource] = {
    "remoteok": _RemoteOkSource(),
    "remotive": _RemotiveSource(),
    "greenhouse": _CompanyBoardsSource(
        source_name="greenhouse",
        company_config_key="greenhouse",
        fetch_fn=greenhouse.fetch_jobs,
        meta=SourceMetadata(
            name="greenhouse",
            access_mode="official_api",
            risk_level="low",
            requires_company_config=True,
        ),
    ),
    "lever": _CompanyBoardsSource(
        source_name="lever",
        company_config_key="lever",
        fetch_fn=lever.fetch_jobs,
        meta=SourceMetadata(
            name="lever",
            access_mode="official_api",
            risk_level="low",
            requires_company_config=True,
        ),
    ),
    "workday": _CompanyBoardsSource(
        source_name="workday",
        company_config_key="workday",
        fetch_fn=workday_custom.fetch_jobs,
        meta=SourceMetadata(
            name="workday",
            access_mode="custom",
            risk_level="medium",
            requires_company_config=True,
        ),
    ),
    "custom_careers": _CompanyBoardsSource(
        source_name="custom_careers",
        company_config_key="custom_careers",
        fetch_fn=global_ats.fetch_custom_careers_jobs,
        meta=SourceMetadata(
            name="custom_careers",
            access_mode="custom",
            risk_level="medium",
            requires_company_config=True,
        ),
    ),
    "ashby": _CompanyBoardsSource(
        source_name="ashby",
        company_config_key="ashby",
        fetch_fn=global_ats.fetch_ashby_jobs,
        meta=SourceMetadata(
            name="ashby",
            access_mode="public_html",
            risk_level="medium",
            requires_company_config=True,
        ),
    ),
    "smartrecruiters": _CompanyBoardsSource(
        source_name="smartrecruiters",
        company_config_key="smartrecruiters",
        fetch_fn=global_ats.fetch_smartrecruiters_jobs,
        meta=SourceMetadata(
            name="smartrecruiters",
            access_mode="official_api",
            risk_level="low",
            requires_company_config=True,
        ),
    ),
    "bamboohr": _CompanyBoardsSource(
        source_name="bamboohr",
        company_config_key="bamboohr",
        fetch_fn=global_ats.fetch_bamboohr_jobs,
        meta=SourceMetadata(
            name="bamboohr",
            access_mode="public_html",
            risk_level="medium",
            requires_company_config=True,
        ),
    ),
    "jobvite": _CompanyBoardsSource(
        source_name="jobvite",
        company_config_key="jobvite",
        fetch_fn=global_ats.fetch_jobvite_jobs,
        meta=SourceMetadata(
            name="jobvite",
            access_mode="public_html",
            risk_level="medium",
            requires_company_config=True,
        ),
    ),
    "icims": _CompanyBoardsSource(
        source_name="icims",
        company_config_key="icims",
        fetch_fn=global_ats.fetch_icims_jobs,
        meta=SourceMetadata(
            name="icims",
            access_mode="public_html",
            risk_level="high",
            requires_company_config=True,
        ),
    ),
    "personio": _CompanyBoardsSource(
        source_name="personio",
        company_config_key="personio",
        fetch_fn=global_ats.fetch_personio_jobs,
        meta=SourceMetadata(
            name="personio",
            access_mode="public_html",
            risk_level="medium",
            requires_company_config=True,
        ),
    ),
    "recruitee": _CompanyBoardsSource(
        source_name="recruitee",
        company_config_key="recruitee",
        fetch_fn=global_ats.fetch_recruitee_jobs,
        meta=SourceMetadata(
            name="recruitee",
            access_mode="public_html",
            risk_level="medium",
            requires_company_config=True,
        ),
    ),
}


def fetch_jobs_from_sources(settings: Settings, enabled_sources: list[str]) -> list[dict[str, Any]]:
    source_list = enabled_sources or ["remoteok"]
    jobs: list[dict[str, Any]] = []
    ctx = SourceFetchContext(settings=settings, shared_state={})

    for source_name in source_list:
        name = source_name.strip().lower()
        source = SOURCES.get(name)
        if source is None:
            print(f"Skipping unsupported source from config (not implemented yet): {source_name}")
            continue
        source_jobs = source.fetch_jobs(ctx)
        normalize_jobs_locations(source_jobs)
        jobs.extend(source_jobs)

    return jobs
