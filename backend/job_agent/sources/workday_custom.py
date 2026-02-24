from __future__ import annotations

import html
import re
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
            if platform == "salesforce_careers":
                jobs.extend(_fetch_salesforce_careers_jobs(entry, company_label, timeout_seconds))
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


def _fetch_salesforce_careers_jobs(
    entry: dict[str, Any],
    company_label: str,
    timeout_seconds: int,
) -> list[dict[str, Any]]:
    base_url = str(entry.get("listing_url") or entry.get("careers_url") or "https://careers.salesforce.com/jobs").strip()
    max_pages = int(entry.get("max_pages") or 3)
    max_pages = max(1, min(max_pages, 20))

    jobs: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for page in range(1, max_pages + 1):
        page_url = _salesforce_jobs_page_url(base_url, page)
        response = requests.get(page_url, timeout=timeout_seconds)
        response.raise_for_status()
        html_text = response.text

        page_jobs = _parse_salesforce_jobs_listing_html(
            html_text,
            company_label=company_label,
            source_key=str(entry.get("source_key") or "salesforce"),
            page_url=page_url,
        )
        if not page_jobs:
            # Stop early if a page produces no listings (end of pagination or parser mismatch).
            if page > 1:
                break
        for job in page_jobs:
            url = str(job.get("url") or "")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            jobs.append(job)
    return jobs


def _salesforce_jobs_page_url(base_url: str, page: int) -> str:
    sep = "&" if "?" in base_url else "?"
    if "page=" in base_url:
        return re.sub(r"([?&])page=\d+", rf"\1page={page}", base_url)
    return f"{base_url}{sep}page={page}"


def _parse_salesforce_jobs_listing_html(
    html_text: str,
    *,
    company_label: str,
    source_key: str,
    page_url: str,
) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []

    # Match links to Salesforce job detail pages and capture anchor text as title.
    # Example path: /en/jobs/jr321973/sr-salesforce-developer/
    pattern = re.compile(
        r'<a[^>]+href="(?P<href>/(?:(?:en|ja|de|fr|es|it|ko|nl|sv)/)?jobs/[^"]+)"[^>]*>(?P<title>.*?)</a>',
        flags=re.IGNORECASE | re.DOTALL,
    )

    seen: set[str] = set()
    for match in pattern.finditer(html_text):
        href = html.unescape(match.group("href")).strip()
        title = _clean_html_text(match.group("title"))
        if not title:
            continue
        if href in seen:
            continue
        seen.add(href)

        full_url = f"https://careers.salesforce.com{href}" if href.startswith("/") else href
        jobs.append(
            {
                "_source": "salesforce_careers",
                "id": _salesforce_job_id_from_url(full_url),
                "position": title,
                "company": company_label,
                "url": full_url,
                "description": "",
                "location": "",
                "listing_page": page_url,
                "raw": {"href": href},
            }
        )
    return jobs


def _salesforce_job_id_from_url(url: str) -> str:
    match = re.search(r"/jobs/([^/]+)/", url)
    return match.group(1) if match else url


def _clean_html_text(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return " ".join(text.split())


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
