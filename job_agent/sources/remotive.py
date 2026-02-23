from __future__ import annotations

from typing import Any

import requests


REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs"


def fetch_jobs(timeout_seconds: int, api_url: str = REMOTIVE_API_URL) -> list[dict[str, Any]]:
    response = requests.get(api_url, timeout=timeout_seconds)
    response.raise_for_status()
    payload = response.json()

    if not isinstance(payload, dict):
        raise ValueError(f"Unexpected Remotive payload type: {type(payload)!r}")

    jobs = payload.get("jobs")
    if not isinstance(jobs, list):
        raise ValueError("Unexpected Remotive payload: missing 'jobs' list")

    normalized_jobs: list[dict[str, Any]] = []
    for item in jobs:
        if not isinstance(item, dict):
            continue
        normalized_jobs.append(_to_internal_job(item))
    return normalized_jobs


def _to_internal_job(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "_source": "remotive",
        "id": item.get("id"),
        # Map to the current pipeline's expected field names to avoid a broader refactor yet.
        "position": str(item.get("title") or ""),
        "company": str(item.get("company_name") or ""),
        "url": str(item.get("url") or ""),
        "description": str(item.get("description") or ""),
        "location": str(item.get("candidate_required_location") or ""),
        "category": str(item.get("category") or ""),
        "job_type": str(item.get("job_type") or ""),
        "salary": str(item.get("salary") or ""),
        "publication_date": str(item.get("publication_date") or ""),
        "raw": item,
    }

