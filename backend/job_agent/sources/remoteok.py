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
    aliases = _keyword_aliases(needle)
    token_fallback = _keyword_token_fallback_terms(needle)

    matched: list[dict[str, Any]] = []
    for job in jobs:
        haystack = " ".join(
            [
                str(job.get("position") or ""),
                str(job.get("description") or "")[:800],
                str(job.get("company") or ""),
                str(job.get("location") or ""),
                " ".join(str(t) for t in (job.get("tags") or []) if t),
                str(job.get("category") or ""),
            ]
        ).lower()

        if any(term in haystack for term in aliases):
            matched.append(job)
            continue
        # Fallback for malformed concatenated queries (e.g. "salesforce developer salesforce apex"):
        # if all unique tokens are present somewhere in the job text, treat it as a match.
        if token_fallback and all(term in haystack for term in token_fallback):
            matched.append(job)
    return matched


def _keyword_aliases(needle: str) -> list[str]:
    aliases: list[str] = []
    for chunk in _keyword_chunks(needle):
        aliases.append(chunk)
        compact = " ".join(chunk.split())
        if compact == "developer":
            aliases.extend(
                [
                    "engineer",
                    "software engineer",
                    "software developer",
                    "sde",
                    "backend engineer",
                    "back-end engineer",
                    "full stack engineer",
                    "full-stack engineer",
                ]
            )
        elif compact.endswith(" developer"):
            prefix = compact[: -len(" developer")].strip()
            if prefix:
                aliases.extend(
                    [
                        f"{prefix} engineer",
                        f"software {prefix} engineer",
                        f"{prefix} software engineer",
                    ]
                )
    # Deduplicate while preserving order.
    seen: set[str] = set()
    out: list[str] = []
    for item in aliases:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _keyword_chunks(needle: str) -> list[str]:
    parts = [part.strip().lower() for part in needle.split(",")]
    chunks = [part for part in parts if part]
    return chunks or [needle.strip().lower()]


def _keyword_token_fallback_terms(needle: str) -> list[str]:
    raw_tokens: list[str] = []
    for chunk in _keyword_chunks(needle):
        raw_tokens.extend(chunk.split())

    seen: set[str] = set()
    tokens: list[str] = []
    for token in raw_tokens:
        token = token.strip()
        if len(token) < 3:
            continue
        if token in seen:
            continue
        seen.add(token)
        tokens.append(token)
    # Require at least two unique tokens to avoid broadening simple keywords.
    return tokens if len(tokens) >= 2 else []


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
