from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from job_agent.config import Settings
from job_agent.llm.groq import filter_jobs_with_groq
from job_agent.notify.emailer import send_email
from job_agent.sources.registry import fetch_jobs_from_sources
from job_agent.sources.remoteok import (
    filter_jobs_by_keyword,
    llm_payload,
    stable_job_key,
)
from job_agent.storage.seen_jobs import SeenJobsStore
from job_agent.utils.cleaning import clean_llm_output


@dataclass(frozen=True)
class AgentOptions:
    profile: str | None = None
    keyword: str = "developer"
    sources: list[str] | None = None
    remote_only: bool = True
    strict_senior_only: bool = True
    llm_input_limit: int = 15
    max_bullets: int = 8
    dry_run: bool = False
    dedupe_enabled: bool = True
    seen_jobs_file: Path | None = None
    snapshot_store: Any | None = None
    experience_level: str | None = None
    target_roles: list[str] | None = None
    tech_stack_tags: list[str] | None = None
    alert_frequency: str | None = None
    primary_goal: str | None = None


def _require_env(settings: Settings, *, require_email: bool) -> None:
    missing: list[str] = []
    if not settings.groq_api_key:
        missing.append("GROQ_API_KEY")
    if require_email:
        if not settings.email_user:
            missing.append("EMAIL_USER")
        if not settings.email_pass:
            missing.append("EMAIL_PASS")
    if missing:
        raise RuntimeError(f"Missing required environment variables: {', '.join(missing)}")


def _validate_recipient_config(settings: Settings, options: AgentOptions) -> None:
    # In multi-profile mode, require an explicit recipient to avoid accidental
    # fallback to the central sender inbox for every profile.
    if options.profile and not options.dry_run and not (settings.email_to or "").strip():
        raise RuntimeError(
            f"EMAIL_TO is required for profile runs (profile={options.profile}). "
            "Set EMAIL_TO in the GitHub Environment for that profile."
        )


def _load_previous_snapshot(
    jobs: list[dict[str, Any]],
    *,
    dedupe_enabled: bool,
    seen_jobs_file: Path | None,
    snapshot_store: Any | None,
) -> tuple[list[dict[str, Any]], SeenJobsStore | None, set[str], list[str]]:
    if not dedupe_enabled or seen_jobs_file is None:
        if not dedupe_enabled:
            return jobs, None, set(), []
        if snapshot_store is None:
            return jobs, None, set(), []

    store = snapshot_store if snapshot_store is not None else SeenJobsStore(seen_jobs_file)  # type: ignore[arg-type]
    seen_before = store.load()
    keys_by_job = [(stable_job_key(job), job) for job in jobs]
    current_keys = [key for key, _ in keys_by_job if key]
    return jobs, store, seen_before, current_keys


def _normalize_terms(items: list[str] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items or []:
        s = str(item).strip().lower()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def _score_job_for_profile(job: dict[str, Any], options: AgentOptions) -> int:
    title = str(job.get("position") or "").lower()
    desc = str(job.get("description") or "").lower()
    tags = " ".join(str(t).lower() for t in (job.get("tags") or []) if t)
    company = str(job.get("company") or "").lower()
    hay = f"{title}\n{desc}\n{tags}\n{company}"

    score = 0
    for role in _normalize_terms(options.target_roles):
        if role in title:
            score += 4
        elif role in hay:
            score += 2

    for tag in _normalize_terms(options.tech_stack_tags):
        if tag in title:
            score += 3
        elif tag in hay:
            score += 2

    exp = (options.experience_level or "").strip().lower()
    if exp in {"senior", "staff"}:
        if any(term in title for term in ["senior", "staff", "principal", "lead", "architect"]):
            score += 3
    elif exp == "mid":
        if any(term in title for term in ["engineer", "developer", "sde"]):
            score += 2
    elif exp == "entry":
        if any(term in title for term in ["junior", "associate", "entry"]):
            score += 2
        if any(term in title for term in ["senior", "staff", "principal"]):
            score -= 1

    return score


def _rank_jobs_for_profile(jobs: list[dict[str, Any]], options: AgentOptions) -> list[dict[str, Any]]:
    if not jobs:
        return jobs
    if not any([options.target_roles, options.tech_stack_tags, options.experience_level]):
        return jobs
    ranked = sorted(
        jobs,
        key=lambda job: _score_job_for_profile(job, options),
        reverse=True,
    )
    return ranked


def run_agent(settings: Settings, options: AgentOptions) -> int:
    _require_env(settings, require_email=not options.dry_run)
    _validate_recipient_config(settings, options)

    jobs = fetch_jobs_from_sources(settings, options.sources or ["remoteok"])
    print(f"Fetched jobs from sources: {', '.join(options.sources or ['remoteok'])} | total: {len(jobs)}")
    keyword_jobs = filter_jobs_by_keyword(jobs, options.keyword)
    keyword_jobs = _rank_jobs_for_profile(keyword_jobs, options)

    if not keyword_jobs:
        print(f"No jobs found for keyword: {options.keyword}")
        return 0

    candidate_jobs, store, seen_before, current_keys = _load_previous_snapshot(
        keyword_jobs,
        dedupe_enabled=options.dedupe_enabled,
        seen_jobs_file=options.seen_jobs_file,
        snapshot_store=options.snapshot_store,
    )

    if options.dedupe_enabled and store is not None:
        current_set = set(current_keys)
        added = len(current_set - seen_before)
        removed = len(seen_before - current_set)
        print(
            f"Keyword-matched jobs: {len(keyword_jobs)} | "
            f"added since last run: {added} | removed since last run: {removed}"
        )

    jobs_for_llm = llm_payload(candidate_jobs, limit=options.llm_input_limit)
    raw_output = filter_jobs_with_groq(
        api_key=settings.groq_api_key,
        api_url=settings.groq_api_url,
        model=settings.groq_model,
        jobs_for_llm=jobs_for_llm,
        timeout_seconds=settings.groq_timeout_seconds,
        max_bullets=options.max_bullets,
        keyword=options.keyword,
        remote_only=options.remote_only,
        strict_senior_only=options.strict_senior_only,
        experience_level=options.experience_level,
        target_roles=options.target_roles,
        tech_stack_tags=options.tech_stack_tags,
        alert_frequency=options.alert_frequency,
        primary_goal=options.primary_goal,
    )
    cleaned_output = clean_llm_output(raw_output, max_bullets=options.max_bullets)

    if cleaned_output == "NONE":
        print("Model found no relevant jobs. Skipping email.")
        if options.dedupe_enabled and store is not None:
            store.save(set(current_keys))
        return 0

    if options.dry_run:
        print("Dry run enabled. Email body:")
        print(cleaned_output)
    else:
        send_email(
            smtp_host=settings.smtp_host,
            smtp_port=settings.smtp_port,
            email_user=settings.email_user,
            email_pass=settings.email_pass,
            email_to=settings.email_to,
            subject=f"New {options.keyword.title()} Remote Jobs Found",
            body=cleaned_output,
        )
        print("Email sent successfully!")

    if options.dedupe_enabled and store is not None:
        store.save(set(current_keys))

    return 0
