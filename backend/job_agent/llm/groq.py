from __future__ import annotations

from typing import Any

import requests


def build_prompt(
    jobs_for_llm: list[dict[str, str]],
    max_bullets: int,
    *,
    keyword: str,
    remote_only: bool,
    strict_senior_only: bool,
) -> str:
    remote_line = "Only REMOTE roles." if remote_only else "Prefer remote roles, but include strong hybrid roles if clearly relevant."
    if strict_senior_only:
        seniority_block = (
            "- Senior roles (6+ years): Senior / Lead / Staff / Principal / Architect.\n"
            "- Reject internships, junior, entry-level."
        )
        coverage_hint = "- Prioritize precision over recall."
    else:
        seniority_block = (
            "- Include mid-to-senior roles.\n"
            "- Accept titles like Engineer / Developer / Software Engineer / SDE / Backend / Full Stack.\n"
            "- Reject internships, trainee roles, and clearly entry-level roles."
        )
        coverage_hint = "- Prefer returning as many relevant roles as possible up to the max bullets."

    return f"""
You are a job alert bot. Follow instructions EXACTLY.

User preference:
- Keyword focus: {keyword}
- {remote_line}
{seniority_block}

Output rules (MANDATORY):
- Output ONLY bullet points.
- Each bullet must be exactly: "- <Title> — <Company> — <URL>"
- Max {max_bullets} bullets.
- Prefer Engineer/Developer/SDE title variants when they match the keyword focus.
{coverage_hint}
- NO code. NO explanations. NO markdown fences.
- If none match, output exactly: NONE

Jobs:
{jobs_for_llm}
""".strip()


def filter_jobs_with_groq(
    *,
    api_key: str,
    api_url: str,
    model: str,
    jobs_for_llm: list[dict[str, str]],
    timeout_seconds: int,
    max_bullets: int,
    keyword: str,
    remote_only: bool,
    strict_senior_only: bool,
) -> str:
    response = requests.post(
        api_url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": build_prompt(
                        jobs_for_llm,
                        max_bullets,
                        keyword=keyword,
                        remote_only=remote_only,
                        strict_senior_only=strict_senior_only,
                    ),
                }
            ],
            "temperature": 0.1,
        },
        timeout=timeout_seconds,
    )
    response.raise_for_status()

    data: dict[str, Any] = response.json()
    if "error" in data:
        raise RuntimeError(f"Groq API error: {data['error']}")
    if "choices" not in data:
        raise RuntimeError(f"Unexpected Groq response: {data}")

    try:
        return str(data["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unable to parse Groq response: {data}") from exc
