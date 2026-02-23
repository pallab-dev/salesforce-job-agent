from __future__ import annotations

from typing import Any

import requests


def build_prompt(jobs_for_llm: list[dict[str, str]], max_bullets: int) -> str:
    return f"""
You are a job alert bot. Follow instructions EXACTLY.

User preference:
- Only REMOTE roles.
- Senior roles (6+ years): Senior / Lead / Staff / Principal / Architect.
- Reject internships, junior, entry-level.

Output rules (MANDATORY):
- Output ONLY bullet points.
- Each bullet must be exactly: "- <Title> — <Company> — <URL>"
- Max {max_bullets} bullets.
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
) -> str:
    response = requests.post(
        api_url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [{"role": "user", "content": build_prompt(jobs_for_llm, max_bullets)}],
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

