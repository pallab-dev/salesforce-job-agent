from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from job_agent.config import Settings
from job_agent.llm.groq import filter_jobs_with_groq
from job_agent.notify.emailer import send_email
from job_agent.sources.remoteok import (
    fetch_jobs,
    filter_jobs_by_keyword,
    llm_payload,
    stable_job_key,
)
from job_agent.storage.seen_jobs import SeenJobsStore
from job_agent.utils.cleaning import clean_llm_output


@dataclass(frozen=True)
class AgentOptions:
    keyword: str = "developer"
    llm_input_limit: int = 15
    max_bullets: int = 8
    dry_run: bool = False
    dedupe_enabled: bool = True
    seen_jobs_file: Path | None = None


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


def _apply_dedupe(
    jobs: list[dict[str, Any]],
    *,
    dedupe_enabled: bool,
    seen_jobs_file: Path | None,
) -> tuple[list[dict[str, Any]], SeenJobsStore | None, set[str], list[str]]:
    if not dedupe_enabled or seen_jobs_file is None:
        return jobs, None, set(), []

    store = SeenJobsStore(seen_jobs_file)
    seen_before = store.load()
    keys_by_job = [(stable_job_key(job), job) for job in jobs]
    new_jobs = [job for key, job in keys_by_job if key and key not in seen_before]
    processed_keys = [key for key, _ in keys_by_job if key]
    return new_jobs, store, seen_before, processed_keys


def run_agent(settings: Settings, options: AgentOptions) -> int:
    _require_env(settings, require_email=not options.dry_run)

    jobs = fetch_jobs(settings.remoteok_api_url, settings.request_timeout_seconds)
    keyword_jobs = filter_jobs_by_keyword(jobs, options.keyword)

    if not keyword_jobs:
        print(f"No jobs found for keyword: {options.keyword}")
        return 0

    candidate_jobs, store, seen_before, processed_keys = _apply_dedupe(
        keyword_jobs,
        dedupe_enabled=options.dedupe_enabled,
        seen_jobs_file=options.seen_jobs_file,
    )

    if options.dedupe_enabled and store is not None:
        print(
            f"Keyword-matched jobs: {len(keyword_jobs)} | "
            f"new after dedupe: {len(candidate_jobs)} | seen stored: {len(seen_before)}"
        )

    if not candidate_jobs:
        print("No new jobs after dedupe. Skipping AI + email.")
        return 0

    jobs_for_llm = llm_payload(candidate_jobs, limit=options.llm_input_limit)
    raw_output = filter_jobs_with_groq(
        api_key=settings.groq_api_key,
        api_url=settings.groq_api_url,
        model=settings.groq_model,
        jobs_for_llm=jobs_for_llm,
        timeout_seconds=settings.groq_timeout_seconds,
        max_bullets=options.max_bullets,
    )
    cleaned_output = clean_llm_output(raw_output, max_bullets=options.max_bullets)

    if cleaned_output == "NONE":
        print("Model found no relevant jobs. Skipping email.")
        if options.dedupe_enabled and store is not None:
            store.save(seen_before.union(processed_keys))
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
            subject=f"New {options.keyword.title()} Remote Jobs Found",
            body=cleaned_output,
        )
        print("Email sent successfully!")

    if options.dedupe_enabled and store is not None:
        store.save(seen_before.union(processed_keys))

    return 0
