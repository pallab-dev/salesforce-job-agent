from __future__ import annotations

import re
from typing import Any


COUNTRY_ALIASES: dict[str, str] = {
    "usa": "United States",
    "us": "United States",
    "united states": "United States",
    "u.s.": "United States",
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "united kingdom": "United Kingdom",
    "england": "United Kingdom",
    "india": "India",
    "canada": "Canada",
    "germany": "Germany",
    "france": "France",
    "spain": "Spain",
    "italy": "Italy",
    "netherlands": "Netherlands",
    "poland": "Poland",
    "ireland": "Ireland",
    "singapore": "Singapore",
    "australia": "Australia",
    "new zealand": "New Zealand",
    "japan": "Japan",
    "korea": "South Korea",
    "south korea": "South Korea",
    "uae": "United Arab Emirates",
    "united arab emirates": "United Arab Emirates",
}

CITY_TO_COUNTRY: dict[str, tuple[str, str | None]] = {
    "bangalore": ("India", "Karnataka"),
    "bengaluru": ("India", "Karnataka"),
    "hyderabad": ("India", "Telangana"),
    "pune": ("India", "Maharashtra"),
    "mumbai": ("India", "Maharashtra"),
    "gurgaon": ("India", "Haryana"),
    "gurugram": ("India", "Haryana"),
    "noida": ("India", "Uttar Pradesh"),
    "delhi": ("India", "Delhi"),
    "chennai": ("India", "Tamil Nadu"),
    "kolkata": ("India", "West Bengal"),
    "san francisco": ("United States", "California"),
    "new york": ("United States", "New York"),
    "seattle": ("United States", "Washington"),
    "austin": ("United States", "Texas"),
    "london": ("United Kingdom", None),
    "berlin": ("Germany", None),
    "amsterdam": ("Netherlands", None),
    "dublin": ("Ireland", None),
    "singapore": ("Singapore", None),
    "tokyo": ("Japan", None),
    "sydney": ("Australia", "New South Wales"),
}


def normalize_job_location(job: dict[str, Any]) -> dict[str, Any]:
    raw_location = str(job.get("location") or "").strip()
    title = str(job.get("position") or "")
    description = str(job.get("description") or "")[:1200]
    source = str(job.get("_source") or job.get("source") or "")
    combined = " ".join([raw_location, title, description]).lower()

    remote_mode = _infer_remote_mode(combined)
    country, region, city = _infer_geo(raw_location, combined)

    canonical_parts = [part for part in [city, region, country] if part]
    canonical = ", ".join(canonical_parts)
    if remote_mode == "remote" and country:
        canonical = f"Remote ({country})"
    elif remote_mode == "remote" and not canonical:
        canonical = "Remote"

    normalized = {
        "raw": raw_location,
        "mode": remote_mode,
        "country": country,
        "region": region,
        "city": city,
        "canonical": canonical or (raw_location if raw_location else ""),
        "source": source or None,
    }

    job["normalized_location"] = normalized
    job["location_mode"] = remote_mode
    job["location_country"] = country
    job["location_region"] = region
    job["location_city"] = city
    if raw_location:
        job["location_text"] = raw_location
    return job


def normalize_jobs_locations(jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for job in jobs:
        if isinstance(job, dict):
            normalize_job_location(job)
    return jobs


def _infer_remote_mode(text: str) -> str:
    if any(token in text for token in ("hybrid", "remote +", "remote/hybrid")):
        return "hybrid"
    if any(token in text for token in ("onsite", "on-site", "on site")):
        return "onsite"
    if any(
        token in text
        for token in (
            "remote",
            "work from home",
            "wfh",
            "distributed",
            "anywhere",
        )
    ):
        return "remote"
    return "unknown"


def _infer_geo(raw_location: str, combined: str) -> tuple[str | None, str | None, str | None]:
    location_lower = raw_location.lower()
    country: str | None = None
    region: str | None = None
    city: str | None = None

    for name, canonical in COUNTRY_ALIASES.items():
        if re.search(rf"\b{re.escape(name)}\b", combined):
            country = canonical
            break

    for city_name, (city_country, city_region) in CITY_TO_COUNTRY.items():
        if re.search(rf"\b{re.escape(city_name)}\b", location_lower):
            city = city_name.title()
            country = country or city_country
            region = region or city_region
            break

    # Parse simple comma-separated formats: "City, Country" / "City, ST, Country"
    parts = [part.strip() for part in raw_location.split(",") if part.strip()]
    if parts and city is None and len(parts[0]) > 1 and not _looks_remote_only(parts[0]):
        city = parts[0]
    if len(parts) >= 2 and region is None and len(parts[1]) <= 24:
        second = parts[1]
        if second.lower() not in COUNTRY_ALIASES:
            region = second
    if len(parts) >= 2 and country is None:
        candidate = parts[-1].lower()
        country = COUNTRY_ALIASES.get(candidate) or _title_if_countrylike(parts[-1])

    return country, region, city


def _looks_remote_only(value: str) -> bool:
    s = value.strip().lower()
    return any(token in s for token in ("remote", "anywhere", "hybrid", "onsite", "on-site"))


def _title_if_countrylike(value: str) -> str | None:
    s = value.strip()
    if not s:
        return None
    if len(s) > 32:
        return None
    if not re.fullmatch(r"[A-Za-z .()-]+", s):
        return None
    return s.title()
