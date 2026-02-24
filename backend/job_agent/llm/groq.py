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
    experience_level: str | None = None,
    target_roles: list[str] | None = None,
    tech_stack_tags: list[str] | None = None,
    alert_frequency: str | None = None,
    primary_goal: str | None = None,
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

    profile_lines: list[str] = []
    if experience_level:
        profile_lines.append(f"- Experience level: {experience_level}")
    if target_roles:
        profile_lines.append(f"- Target roles: {', '.join(target_roles[:8])}")
    if tech_stack_tags:
        profile_lines.append(f"- Tech stack signals: {', '.join(tech_stack_tags[:10])}")
    if alert_frequency:
        profile_lines.append(f"- Alert frequency preference: {alert_frequency}")
    if primary_goal:
        profile_lines.append(f"- Primary goal: {primary_goal}")

    frequency_hint = ""
    if (alert_frequency or "").strip().lower() == "high_priority_only":
        frequency_hint = "- User wants fewer, higher-confidence matches."
    elif (alert_frequency or "").strip().lower() == "weekly":
        frequency_hint = "- User accepts broader coverage for weekly review."

    goal_hint = ""
    if (primary_goal or "").strip().lower() == "job_switch":
        goal_hint = "- Prioritize directly applicable open roles."
    elif (primary_goal or "").strip().lower() == "market_tracking":
        goal_hint = "- Include strong market-signal roles even if slightly broader."
    elif (primary_goal or "").strip().lower() == "interview_pipeline":
        goal_hint = "- Prioritize roles with clear fit and likely interview relevance."

    profile_block = "\n".join(profile_lines) if profile_lines else "- No extra profile signals provided."

    return f"""
You are a job alert bot. Follow instructions EXACTLY.

User preference:
- Keyword focus: {keyword}
- {remote_line}
{seniority_block}
{profile_block}

Output rules (MANDATORY):
- Output ONLY bullet points.
- Each bullet must be exactly: "- <Title> — <Company> — <URL>"
- Max {max_bullets} bullets.
- Prefer Engineer/Developer/SDE title variants when they match the keyword focus.
{coverage_hint}
{frequency_hint}
{goal_hint}
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
    experience_level: str | None = None,
    target_roles: list[str] | None = None,
    tech_stack_tags: list[str] | None = None,
    alert_frequency: str | None = None,
    primary_goal: str | None = None,
) -> str:
    attempt_jobs = list(jobs_for_llm)
    last_http_error: requests.HTTPError | None = None

    while attempt_jobs:
        try:
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
                                attempt_jobs,
                                max_bullets,
                                keyword=keyword,
                                remote_only=remote_only,
                                strict_senior_only=strict_senior_only,
                                experience_level=experience_level,
                                target_roles=target_roles,
                                tech_stack_tags=tech_stack_tags,
                                alert_frequency=alert_frequency,
                                primary_goal=primary_goal,
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
        except requests.HTTPError as exc:
            last_http_error = exc
            status_code = exc.response.status_code if exc.response is not None else None
            if status_code == 413 and len(attempt_jobs) > 1:
                next_len = max(1, len(attempt_jobs) // 2)
                if next_len == len(attempt_jobs):
                    next_len -= 1
                print(
                    f"Groq payload too large (413) with {len(attempt_jobs)} jobs. "
                    f"Retrying with {next_len}."
                )
                attempt_jobs = attempt_jobs[:next_len]
                continue
            raise

    if last_http_error is not None:
        raise last_http_error
    raise RuntimeError("No jobs available to send to Groq")
