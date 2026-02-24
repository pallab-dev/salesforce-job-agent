from __future__ import annotations

from typing import Any

import requests


GREENHOUSE_BOARDS_API = "https://boards-api.greenhouse.io/v1/boards/{board}/jobs"


def fetch_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for entry in company_entries:
        board_token = str(entry.get("board_token") or entry.get("slug") or "").strip()
        if not board_token:
            continue
        company_label = str(entry.get("company") or board_token).strip()
        try:
            jobs.extend(_fetch_board_jobs(board_token, company_label, timeout_seconds))
        except Exception as exc:
            print(f"Greenhouse source failed for board '{board_token}': {exc}")
    return jobs


def _fetch_board_jobs(board_token: str, company_label: str, timeout_seconds: int) -> list[dict[str, Any]]:
    response = requests.get(
        GREENHOUSE_BOARDS_API.format(board=board_token),
        params={"content": "true"},
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError(f"Unexpected Greenhouse payload type: {type(payload)!r}")

    jobs = payload.get("jobs")
    if not isinstance(jobs, list):
        raise ValueError("Unexpected Greenhouse payload: missing 'jobs' list")

    normalized: list[dict[str, Any]] = []
    for item in jobs:
        if not isinstance(item, dict):
            continue
        normalized.append(_to_internal_job(item, board_token=board_token, company_label=company_label))
    return normalized


def _to_internal_job(item: dict[str, Any], *, board_token: str, company_label: str) -> dict[str, Any]:
    location = item.get("location")
    location_name = ""
    if isinstance(location, dict):
        location_name = str(location.get("name") or "")

    metadata = item.get("metadata")
    tags: list[str] = []
    if isinstance(metadata, list):
        for m in metadata:
            if isinstance(m, dict) and m.get("value"):
                tags.append(str(m["value"]))

    return {
        "_source": f"greenhouse:{board_token}",
        "id": item.get("id"),
        "position": str(item.get("title") or ""),
        "company": company_label,
        "url": str(item.get("absolute_url") or ""),
        "description": str(item.get("content") or ""),
        "location": location_name,
        "tags": tags,
        "updated_at": str(item.get("updated_at") or item.get("first_published") or ""),
        "raw": item,
    }

