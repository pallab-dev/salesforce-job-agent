from __future__ import annotations

from typing import Any

from job_agent.config import Settings
from job_agent.sources import greenhouse
from job_agent.sources import lever
from job_agent.sources import remotive
from job_agent.sources import remoteok
from job_agent.sources import workday_custom
from job_agent.sources.company_boards import load_companies_config


def fetch_jobs_from_sources(settings: Settings, enabled_sources: list[str]) -> list[dict[str, Any]]:
    source_list = enabled_sources or ["remoteok"]
    jobs: list[dict[str, Any]] = []
    company_cfg: dict[str, list[dict[str, Any]]] | None = None

    for source_name in source_list:
        name = source_name.strip().lower()
        if name == "remoteok":
            source_jobs = remoteok.fetch_jobs(settings.remoteok_api_url, settings.request_timeout_seconds)
            for job in source_jobs:
                if "_source" not in job:
                    job["_source"] = "remoteok"
            jobs.extend(source_jobs)
            continue

        if name == "remotive":
            source_jobs = remotive.fetch_jobs(settings.request_timeout_seconds)
            jobs.extend(source_jobs)
            continue

        if name in {"greenhouse", "lever", "workday"}:
            if company_cfg is None:
                company_cfg = load_companies_config()

            if name == "greenhouse":
                source_jobs = greenhouse.fetch_jobs(
                    company_cfg.get("greenhouse", []),
                    settings.request_timeout_seconds,
                )
                jobs.extend(source_jobs)
                continue

            if name == "lever":
                source_jobs = lever.fetch_jobs(
                    company_cfg.get("lever", []),
                    settings.request_timeout_seconds,
                )
                jobs.extend(source_jobs)
                continue

            if name == "workday":
                source_jobs = workday_custom.fetch_jobs(
                    company_cfg.get("workday", []),
                    settings.request_timeout_seconds,
                )
                jobs.extend(source_jobs)
                continue

        print(f"Skipping unsupported source from config (not implemented yet): {source_name}")

    return jobs
