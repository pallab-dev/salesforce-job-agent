from __future__ import annotations

from typing import Any

import requests


def fetch_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for entry in company_entries:
        if entry.get("active", False) is False:
            continue

        platform = str(entry.get("platform") or "custom").strip().lower()
        company_label = str(entry.get("company") or "unknown").strip() or "unknown"

        try:
            if platform == "workday":
                jobs.extend(_fetch_workday_jobs(entry, company_label, timeout_seconds))
                continue
            if platform == "custom":
                jobs.extend(_fetch_custom_jobs(entry, company_label, timeout_seconds))
                continue

            print(f"Skipping unsupported workday/custom platform '{platform}' for {company_label}")
        except Exception as exc:
            print(f"Workday/custom source failed for {company_label}: {exc}")
    return jobs


def _fetch_workday_jobs(entry: dict[str, Any], company_label: str, timeout_seconds: int) -> list[dict[str, Any]]:
    # Generic support path: if a Workday JSON endpoint is known, provide api_url in config.
    api_url = str(entry.get("api_url") or "").strip()
    if not api_url:
        print(f"Workday entry for {company_label} has no api_url yet; skipping (placeholder)")
        return []

    response = requests.get(api_url, timeout=timeout_seconds)
    response.raise_for_status()
    payload = response.json()

    # Workday payloads vary by tenant/site. Support a common "jobPostings" shape if present.
    if not isinstance(payload, dict):
        raise ValueError(f"Unexpected Workday payload type: {type(payload)!r}")

    postings = payload.get("jobPostings") or payload.get("job_postings") or []
    if not isinstance(postings, list):
        print(f"Workday entry for {company_label} returned unsupported JSON shape; skipping")
        return []

    out: list[dict[str, Any]] = []
    for item in postings:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("jobTitle") or "")
        url = str(item.get("externalPath") or item.get("url") or "")
        if url and url.startswith("/"):
            base = str(entry.get("careers_url") or "").rstrip("/")
            url = f"{base}{url}"
        location = str(item.get("locationsText") or item.get("location") or "")
        description = str(item.get("bulletFields") or item.get("description") or "")
        out.append(
            {
                "_source": f"workday:{company_label.lower()}",
                "id": item.get("bulletFields", [{}])[0] if isinstance(item.get("bulletFields"), list) else None,
                "position": title,
                "company": company_label,
                "url": url,
                "description": description,
                "location": location,
                "raw": item,
            }
        )
    return out


def _fetch_custom_jobs(entry: dict[str, Any], company_label: str, timeout_seconds: int) -> list[dict[str, Any]]:
    # Generic custom support path:
    # 1) json_url (preferred)
    # 2) rss_url (future)
    # 3) otherwise keep as placeholder and skip
    json_url = str(entry.get("json_url") or "").strip()
    if json_url:
        response = requests.get(json_url, timeout=timeout_seconds)
        response.raise_for_status()
        payload = response.json()
        return _parse_custom_json_payload(payload, company_label, entry)

    rss_url = str(entry.get("rss_url") or "").strip()
    if rss_url:
        print(f"Custom RSS source for {company_label} is configured but RSS parsing is not implemented yet; skipping")
        return []

    print(f"Custom source placeholder for {company_label}; add json_url/rss_url or a dedicated adapter")
    return []


def _parse_custom_json_payload(
    payload: Any,
    company_label: str,
    entry: dict[str, Any],
) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        items = payload.get("jobs") or payload.get("results") or []
    else:
        items = []

    if not isinstance(items, list):
        return []

    out: list[dict[str, Any]] = []
    source_key = str(entry.get("source_key") or company_label).strip().lower().replace(" ", "-")
    for item in items:
        if not isinstance(item, dict):
            continue
        out.append(
            {
                "_source": f"custom:{source_key}",
                "id": item.get("id"),
                "position": str(item.get("title") or item.get("name") or ""),
                "company": company_label,
                "url": str(item.get("url") or item.get("apply_url") or ""),
                "description": str(item.get("description") or ""),
                "location": str(item.get("location") or ""),
                "raw": item,
            }
        )
    return out

