from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from typing import Any

import requests


def fetch_ashby_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    return _fetch_entries(company_entries, timeout_seconds, provider="ashby")


def fetch_smartrecruiters_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    return _fetch_entries(company_entries, timeout_seconds, provider="smartrecruiters")


def fetch_bamboohr_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    return _fetch_entries(company_entries, timeout_seconds, provider="bamboohr")


def fetch_jobvite_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    return _fetch_entries(company_entries, timeout_seconds, provider="jobvite")


def fetch_icims_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    return _fetch_entries(company_entries, timeout_seconds, provider="icims")


def fetch_personio_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    return _fetch_entries(company_entries, timeout_seconds, provider="personio")


def fetch_recruitee_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    return _fetch_entries(company_entries, timeout_seconds, provider="recruitee")


def fetch_custom_careers_jobs(company_entries: list[dict[str, Any]], timeout_seconds: int) -> list[dict[str, Any]]:
    return _fetch_entries(company_entries, timeout_seconds, provider="custom_careers")


def _fetch_entries(company_entries: list[dict[str, Any]], timeout_seconds: int, *, provider: str) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for entry in company_entries:
        if entry.get("active", True) is False:
            continue
        if isinstance(entry, dict):
            entry.pop("_last_fetch_error", None)
            entry.pop("_last_fetch_status", None)
            entry.pop("_last_fetch_url", None)
        company_label = str(entry.get("company") or entry.get("slug") or provider).strip() or provider
        try:
            jobs.extend(_fetch_entry(entry, company_label=company_label, provider=provider, timeout_seconds=timeout_seconds))
        except Exception as exc:
            if isinstance(entry, dict):
                entry["_last_fetch_error"] = str(exc)
                entry["_last_fetch_status"] = "error"
            print(f"{provider} source failed for {company_label}: {exc}")
    return jobs


def _fetch_entry(
    entry: dict[str, Any],
    *,
    company_label: str,
    provider: str,
    timeout_seconds: int,
) -> list[dict[str, Any]]:
    urls = _candidate_urls(entry, provider=provider)
    if not urls:
        print(f"{provider} entry for {company_label} has no usable URL config; skipping")
        return []

    for url in urls:
        response = _request_with_retries(url=url, timeout_seconds=timeout_seconds, provider=provider)
        if isinstance(entry, dict):
            entry["_last_fetch_url"] = url
        if response.status_code >= 400:
            response.raise_for_status()
        content_type = str(response.headers.get("content-type") or "").lower()
        text = response.text or ""

        jobs = _parse_response(
            provider=provider,
            company_label=company_label,
            entry=entry,
            url=url,
            content_type=content_type,
            text=text,
        )
        if jobs:
            if isinstance(entry, dict):
                entry["_last_fetch_status"] = "ok"
            return jobs
    if isinstance(entry, dict):
        entry["_last_fetch_status"] = "no_jobs"
    return []


def _request_with_retries(*, url: str, timeout_seconds: int, provider: str) -> requests.Response:
    attempts = 3 if provider == "custom_careers" else 2
    timeout = max(timeout_seconds, 12) if provider == "custom_careers" else timeout_seconds
    last_exc: Exception | None = None
    headers_variants = _request_headers_variants(provider=provider, url=url)
    for attempt in range(1, attempts + 1):
        headers = headers_variants[min(attempt - 1, len(headers_variants) - 1)]
        try:
            response = requests.get(url, timeout=timeout, headers=headers)
            # Retry transient blocks/failures for custom careers with alternate headers.
            if provider == "custom_careers" and response.status_code in {403, 406, 408, 425, 429, 500, 502, 503, 504}:
                if attempt < attempts:
                    time.sleep(0.2 * attempt)
                    continue
            return response
        except requests.Timeout as exc:
            last_exc = exc
            if attempt < attempts:
                time.sleep(0.2 * attempt)
                continue
            raise
        except requests.RequestException as exc:
            last_exc = exc
            # Retry only for connection/transient-type issues.
            if attempt < attempts:
                time.sleep(0.15 * attempt)
                continue
            raise
    if last_exc:
        raise last_exc
    raise RuntimeError(f"Request failed for {url}")


def _request_headers_variants(*, provider: str, url: str) -> list[dict[str, str]]:
    default = {"Accept": "application/json, text/plain, */*"}
    if provider != "custom_careers":
        return [default]

    browser_like = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        "Referer": url,
    }
    api_friendly = {
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": browser_like["User-Agent"],
    }
    return [browser_like, api_friendly, default]


def _candidate_urls(entry: dict[str, Any], *, provider: str) -> list[str]:
    explicit = str(entry.get("api_url") or "").strip()
    if explicit:
        return [explicit]

    slug = str(entry.get("slug") or "").strip()
    subdomain = str(entry.get("subdomain") or "").strip()
    host = str(entry.get("host") or "").strip()

    if provider == "smartrecruiters" and slug:
        return [
            f"https://api.smartrecruiters.com/v1/companies/{slug}/postings",
        ]
    if provider == "recruitee":
        base = str(entry.get("base_url") or "").strip()
        if base:
            return [f"{base.rstrip('/')}/api/offers/"]
        if slug:
            return [f"https://{slug}.recruitee.com/api/offers/"]
    if provider == "personio":
        if slug:
            return [
                f"https://{slug}.jobs.personio.com/xml",
                f"https://{slug}.jobs.personio.com/json",
            ]
    if provider == "ashby":
        if slug:
            return [
                f"https://jobs.ashbyhq.com/{slug}",
                f"https://jobs.ashbyhq.com/{slug}/jobs",
            ]
    if provider == "bamboohr":
        if subdomain:
            return [
                f"https://{subdomain}.bamboohr.com/careers/list",
                f"https://{subdomain}.bamboohr.com/careers/jobs",
            ]
        if host:
            return [host]
    if provider == "jobvite":
        if host:
            return [
                host,
                f"{host.rstrip('/')}/api/jobs",
                f"{host.rstrip('/')}/jobs",
            ]
        if slug:
            return [
                f"https://jobs.jobvite.com/{slug}/jobs",
                f"https://jobs.jobvite.com/api/v1/job?company={slug}",
            ]
    if provider == "icims":
        if host:
            return [
                host,
                f"{host.rstrip('/')}/search",
            ]
    if provider == "custom_careers":
        base = str(entry.get("api_url") or entry.get("json_url") or entry.get("xml_url") or entry.get("rss_url") or "").strip()
        careers_url = str(entry.get("careers_url") or entry.get("listing_url") or entry.get("host") or "").strip()
        urls = [u for u in [base, careers_url] if u]
        if urls:
            return urls
    return []


def _parse_response(
    *,
    provider: str,
    company_label: str,
    entry: dict[str, Any],
    url: str,
    content_type: str,
    text: str,
) -> list[dict[str, Any]]:
    text_stripped = text.strip()
    if "xml" in content_type or text_stripped.startswith("<?xml"):
        return _parse_xml(provider=provider, company_label=company_label, entry=entry, source_url=url, text=text)

    if "json" in content_type or text_stripped.startswith("{") or text_stripped.startswith("["):
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = None
        if payload is not None:
            return _parse_json(provider=provider, company_label=company_label, entry=entry, source_url=url, payload=payload)

    return _parse_html(provider=provider, company_label=company_label, entry=entry, source_url=url, text=text)


def _parse_json(
    *,
    provider: str,
    company_label: str,
    entry: dict[str, Any],
    source_url: str,
    payload: Any,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    if provider == "smartrecruiters" and isinstance(payload, dict):
        postings = payload.get("content") or payload.get("data") or []
        if isinstance(postings, list):
            for item in postings:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("name") or "")
                apply_url = str(item.get("ref") or item.get("applyUrl") or item.get("url") or "")
                location_obj = item.get("location") if isinstance(item.get("location"), dict) else {}
                location = ", ".join(
                    [str(location_obj.get(k) or "").strip() for k in ("city", "region", "country") if location_obj.get(k)]
                )
                items.append(
                    _job_record(
                        provider=provider,
                        company=company_label,
                        title=title,
                        url=apply_url,
                        location=location,
                        description=str(item.get("jobAd") or item.get("industry") or ""),
                        raw=item,
                    )
                )
            return [job for job in items if job.get("position")]

    if provider == "recruitee" and isinstance(payload, dict):
        offers = payload.get("offers") or payload.get("data") or []
        if isinstance(offers, list):
            for item in offers:
                if not isinstance(item, dict):
                    continue
                location = str(item.get("location") or "")
                department = item.get("department")
                tags = [str(department)] if department else []
                careers_url = str(item.get("careers_url") or item.get("url") or "")
                items.append(
                    _job_record(
                        provider=provider,
                        company=company_label,
                        title=str(item.get("title") or ""),
                        url=careers_url,
                        location=location,
                        description=str(item.get("description") or ""),
                        tags=tags,
                        raw=item,
                    )
                )
            return [job for job in items if job.get("position")]

    # Generic JSON fallback for custom job lists and less predictable ATS endpoints.
    records = _find_job_like_records(payload)
    if records:
        for item in records:
            items.append(_job_from_generic_json(item, provider=provider, company_label=company_label, entry=entry))
        return [job for job in items if job.get("position")]

    return []


def _parse_xml(
    *,
    provider: str,
    company_label: str,
    entry: dict[str, Any],
    source_url: str,
    text: str,
) -> list[dict[str, Any]]:
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return []

    jobs: list[dict[str, Any]] = []
    # Personio XML commonly uses <position> nodes.
    for node in root.findall(".//position"):
        title = _xml_text(node, "name") or _xml_text(node, "title")
        office = _xml_text(node, "office")
        department = _xml_text(node, "department")
        recruiting = _xml_text(node, "recruitingCategory")
        url = _xml_text(node, "url")
        description = " | ".join([v for v in [department, recruiting] if v])
        tags = [v for v in [department, recruiting] if v]
        jobs.append(
            _job_record(
                provider=provider,
                company=company_label,
                title=title or "",
                url=url or "",
                location=office or "",
                description=description,
                tags=tags,
                raw={"xml_node": "position", "source_url": source_url},
            )
        )

    # Generic RSS/Atom fallback.
    if jobs:
        return [job for job in jobs if job.get("position")]

    for item in root.findall(".//item") + root.findall(".//entry"):
        title = (_xml_text(item, "title") or "").strip()
        link = (_xml_text(item, "link") or "").strip()
        description = (_xml_text(item, "description") or _xml_text(item, "summary") or "").strip()
        if not title:
            continue
        jobs.append(
            _job_record(
                provider=provider,
                company=company_label,
                title=title,
                url=link,
                location="",
                description=description,
                raw={"xml_node": item.tag, "source_url": source_url},
            )
        )
    return jobs


def _parse_html(
    *,
    provider: str,
    company_label: str,
    entry: dict[str, Any],
    source_url: str,
    text: str,
) -> list[dict[str, Any]]:
    # Best-effort HTML link extraction for public careers pages.
    jobs: list[dict[str, Any]] = []
    href_re = re.compile(r'<a[^>]+href=["\'](?P<href>[^"\']+)["\'][^>]*>(?P<label>.*?)</a>', re.I | re.S)
    seen_urls: set[str] = set()
    for match in href_re.finditer(text):
        href = _clean_html(match.group("href"))
        label = _clean_html(match.group("label"))
        if not href or not label:
            continue
        if len(label) < 4:
            continue
        lowered = label.lower()
        if not any(word in lowered for word in ("engineer", "developer", "analyst", "manager", "designer", "scientist")):
            continue
        if href.startswith("/"):
            base = str(entry.get("base_url") or source_url).rstrip("/")
            href = f"{base}{href}"
        if href in seen_urls:
            continue
        seen_urls.add(href)
        jobs.append(
            _job_record(
                provider=provider,
                company=company_label,
                title=label,
                url=href,
                location="",
                description="",
                raw={"html_source": source_url},
            )
        )
        if len(jobs) >= 300:
            break
    return jobs


def _find_job_like_records(payload: Any) -> list[dict[str, Any]]:
    queue: list[Any] = [payload]
    while queue:
        current = queue.pop(0)
        if isinstance(current, list):
            if current and all(isinstance(item, dict) for item in current):
                if sum(1 for item in current[:10] if _looks_like_job_record(item)) >= max(1, min(len(current), 3)):
                    return [item for item in current if isinstance(item, dict)]
            queue.extend(current[:50])
            continue
        if isinstance(current, dict):
            for key in ("jobs", "job", "positions", "postings", "openings", "offers", "data", "results", "items"):
                value = current.get(key)
                if isinstance(value, list):
                    queue.append(value)
            queue.extend(list(current.values())[:50])
    return []


def _looks_like_job_record(item: dict[str, Any]) -> bool:
    keys = {str(k).lower() for k in item.keys()}
    titleish = {"title", "name", "text", "position", "jobtitle", "job_title"}
    urlish = {"url", "applyurl", "apply_url", "hostedurl", "careers_url", "absolute_url", "ref"}
    return bool(keys & titleish) and bool(keys & urlish)


def _job_from_generic_json(
    item: dict[str, Any],
    *,
    provider: str,
    company_label: str,
    entry: dict[str, Any],
) -> dict[str, Any]:
    title = (
        item.get("title")
        or item.get("name")
        or item.get("text")
        or item.get("position")
        or item.get("jobTitle")
        or item.get("job_title")
        or ""
    )
    company = str(item.get("company") or item.get("company_name") or company_label)
    url = (
        item.get("url")
        or item.get("applyUrl")
        or item.get("apply_url")
        or item.get("hostedUrl")
        or item.get("careers_url")
        or item.get("absolute_url")
        or item.get("ref")
        or ""
    )
    if isinstance(url, str) and url.startswith("/"):
        base = str(entry.get("base_url") or "").rstrip("/")
        if base:
            url = f"{base}{url}"
    location = item.get("location")
    if isinstance(location, dict):
        location = ", ".join(str(v) for v in location.values() if v)
    description = item.get("description") or item.get("content") or item.get("jobAd") or ""
    tags = item.get("tags") if isinstance(item.get("tags"), list) else []
    return _job_record(
        provider=provider,
        company=company,
        title=str(title or ""),
        url=str(url or ""),
        location=str(location or ""),
        description=str(description or ""),
        tags=[str(tag) for tag in tags if tag],
        raw=item,
    )


def _job_record(
    *,
    provider: str,
    company: str,
    title: str,
    url: str,
    location: str,
    description: str,
    tags: list[str] | None = None,
    raw: Any = None,
) -> dict[str, Any]:
    provider_key = provider.replace("_", "-")
    return {
        "_source": f"{provider_key}:{company.strip().lower().replace(' ', '-')}",
        "position": (title or "").strip(),
        "company": (company or "").strip(),
        "url": (url or "").strip(),
        "description": description or "",
        "location": (location or "").strip(),
        "tags": tags or [],
        "raw": raw,
    }


def _xml_text(node: ET.Element, tag_name: str) -> str | None:
    child = node.find(tag_name)
    if child is not None and child.text:
        return child.text.strip()
    for child in node:
        local = child.tag.split("}", 1)[-1]
        if local == tag_name and child.text:
            return child.text.strip()
    return None


def _clean_html(value: str) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", value)
    text = re.sub(r"\s+", " ", text).strip()
    return text
