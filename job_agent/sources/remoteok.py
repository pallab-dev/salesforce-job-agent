from __future__ import annotations

from typing import Any

import requests


def fetch_jobs(api_url: str, timeout_seconds: int) -> list[dict[str, Any]]:
    response = requests.get(api_url, timeout=timeout_seconds)
    response.raise_for_status()
    payload = response.json()

    if not isinstance(payload, list):
        raise ValueError(f"Unexpected RemoteOK payload type: {type(payload)!r}")

    # RemoteOK returns metadata as the first list item.
    return [item for item in payload[1:] if isinstance(item, dict)]


def filter_jobs_by_keyword(jobs: list[dict[str, Any]], keyword: str) -> list[dict[str, Any]]:
    needle = keyword.strip().lower()
    if not needle:
        return jobs

    matched: list[dict[str, Any]] = []
    for job in jobs:
        title = str(job.get("position") or "").lower()
        if needle in title:
            matched.append(job)
    return matched


def llm_payload(jobs: list[dict[str, Any]], limit: int = 15) -> list[dict[str, str]]:
    payload: list[dict[str, str]] = []
    for job in jobs[:limit]:
        payload.append(
            {
                "title": str(job.get("position") or ""),
                "company": str(job.get("company") or ""),
                "url": str(job.get("url") or ""),
                "snippet": str(job.get("description") or "")[:250],
            }
        )
    return payload


def stable_job_key(job: dict[str, Any]) -> str:
    url = str(job.get("url") or "").strip()
    if url:
        return url
    title = str(job.get("position") or "").strip()
    company = str(job.get("company") or "").strip()
    return f"{company}::{title}"

