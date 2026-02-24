from __future__ import annotations

from typing import Any

import requests


LEVER_POSTINGS_API = "https://api.lever.co/v0/postings/{company}"


def fetch_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for entry in company_entries:
        company_slug = str(entry.get("company_slug") or entry.get("slug") or "").strip()
        if not company_slug:
            continue
        company_label = str(entry.get("company") or company_slug).strip()
        try:
            jobs.extend(_fetch_company_jobs(company_slug, company_label, timeout_seconds))
        except Exception as exc:
            print(f"Lever source failed for company '{company_slug}': {exc}")
    return jobs


def _fetch_company_jobs(company_slug: str, company_label: str, timeout_seconds: int) -> list[dict[str, Any]]:
    response = requests.get(
        LEVER_POSTINGS_API.format(company=company_slug),
        params={"mode": "json"},
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError(f"Unexpected Lever payload type: {type(payload)!r}")

    normalized: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        normalized.append(_to_internal_job(item, company_slug=company_slug, company_label=company_label))
    return normalized


def _to_internal_job(item: dict[str, Any], *, company_slug: str, company_label: str) -> dict[str, Any]:
    categories = item.get("categories") or {}
    if not isinstance(categories, dict):
        categories = {}

    tags = [
        str(value)
        for value in (
            categories.get("team"),
            categories.get("department"),
            categories.get("commitment"),
            categories.get("location"),
        )
        if value
    ]

    description = str(item.get("descriptionPlain") or item.get("description") or "")
    location = str(categories.get("location") or "")

    return {
        "_source": f"lever:{company_slug}",
        "id": item.get("id"),
        "position": str(item.get("text") or ""),
        "company": company_label,
        "url": str(item.get("hostedUrl") or item.get("applyUrl") or ""),
        "description": description,
        "location": location,
        "tags": tags,
        "updated_at": str(item.get("createdAt") or ""),
        "raw": item,
    }

