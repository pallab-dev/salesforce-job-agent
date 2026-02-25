from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any
from urllib.parse import urlparse

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

MAX_LLM_INPUT_JOBS = 80
MAX_LLM_JOBS_PER_COMPANY = 3
COMPANY_OPPORTUNITY_NOTE_THRESHOLD = 4
MAX_CARRYOVER_EMAIL_JOBS = 10
MAX_CARRYOVER_AGE_DAYS = 14
SOFTWARE_FOCUS_HINTS = (
    "developer",
    "engineer",
    "software",
    "backend",
    "frontend",
    "full stack",
    "full-stack",
    "java",
    "python",
    "golang",
    "node",
    "sde",
)
SOFTWARE_TITLE_POSITIVE_TERMS = (
    "engineer",
    "developer",
    "software",
    "backend",
    "frontend",
    "full stack",
    "full-stack",
    "platform",
    "sde",
)
SOFTWARE_TITLE_HARD_NEGATIVE_TERMS = (
    "recruiter",
    "talent acquisition",
    "account executive",
    "sales representative",
    "sales manager",
    "business development",
    "customer support",
    "customer success",
    "support specialist",
    "support representative",
    "marketing manager",
    "brand manager",
)
SOFTWARE_TITLE_SOFT_NEGATIVE_TERMS = (
    "qa ",
    "quality assurance",
    "manual tester",
    "technical writer",
    "project manager",
    "program manager",
    "scrum master",
    "product manager",
    "analyst",
)


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
    prefetched_jobs: list[dict[str, Any]] | None = None
    metrics_store: Any | None = None
    dedupe_enabled: bool = True
    seen_jobs_file: Path | None = None
    snapshot_store: Any | None = None
    sent_jobs_store: Any | None = None
    experience_level: str | None = None
    target_roles: list[str] | None = None
    tech_stack_tags: list[str] | None = None
    negative_keywords: list[str] | None = None
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


def _keyword_chunks(keyword: str) -> list[str]:
    raw = str(keyword or "").strip().lower()
    if not raw:
        return []
    parts = [part.strip() for part in raw.split(",")]
    chunks = [part for part in parts if part]
    if not chunks:
        return [raw]
    seen: set[str] = set()
    out: list[str] = []
    for chunk in chunks:
        if chunk in seen:
            continue
        seen.add(chunk)
        out.append(chunk)
    return out


def _keyword_token_fallback_terms(keyword: str) -> list[str]:
    raw_tokens: list[str] = []
    for chunk in _keyword_chunks(keyword):
        raw_tokens.extend(chunk.split())
    seen: set[str] = set()
    out: list[str] = []
    for token in raw_tokens:
        token = token.strip().lower()
        if len(token) < 3 or token in seen:
            continue
        seen.add(token)
        out.append(token)
    return out if len(out) >= 2 else []


def _display_keyword(keyword: str) -> str:
    raw = str(keyword or "").strip()
    if not raw:
        return ""
    has_comma = "," in raw
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    if has_comma and parts:
        seen: set[str] = set()
        deduped: list[str] = []
        for part in parts:
            key = part.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(part)
        return ", ".join(deduped)

    # Fallback for malformed space-joined values like "salesforce developer salesforce apex".
    tokens = [tok for tok in raw.split() if tok]
    if not tokens:
        return raw
    seen_tokens: set[str] = set()
    deduped_tokens: list[str] = []
    for tok in tokens:
        key = tok.lower()
        if key in seen_tokens:
            continue
        seen_tokens.add(key)
        deduped_tokens.append(tok)
    return ", ".join(deduped_tokens)


def _looks_like_software_focus(options: AgentOptions) -> bool:
    keyword = (options.keyword or "").strip().lower()
    if any(term in keyword for term in SOFTWARE_FOCUS_HINTS):
        return True
    targets = " ".join(_normalize_terms(options.target_roles))
    return any(term in targets for term in SOFTWARE_FOCUS_HINTS)


def _title_matches_any(title: str, terms: tuple[str, ...]) -> bool:
    return any(term in title for term in terms)


def _is_obviously_irrelevant_for_software(job: dict[str, Any], options: AgentOptions) -> bool:
    if not _looks_like_software_focus(options):
        return False
    title = str(job.get("position") or "").strip().lower()
    if not title:
        return False
    # Only hard-exclude if title looks non-software and lacks obvious software signals.
    if _title_matches_any(title, SOFTWARE_TITLE_HARD_NEGATIVE_TERMS) and not _title_matches_any(
        title, SOFTWARE_TITLE_POSITIVE_TERMS
    ):
        return True
    return False


def _keyword_score(job: dict[str, Any], keyword: str) -> int:
    chunks = _keyword_chunks(keyword)
    if not chunks:
        return 0
    title = str(job.get("position") or "").lower()
    desc = str(job.get("description") or "").lower()
    tags = " ".join(str(t).lower() for t in (job.get("tags") or []) if t)
    company = str(job.get("company") or "").lower()
    hay = f"{title}\n{tags}\n{desc}\n{company}"

    score = 0
    for needle in chunks:
        chunk_score = 0
        if needle in title:
            chunk_score += 8
        elif needle in tags:
            chunk_score += 5
        elif needle in desc:
            chunk_score += 3
        elif needle in company:
            chunk_score += 1
        score = max(score, chunk_score)

    # Boost common engineering aliases for generic keywords like "developer".
    if "developer" in chunks:
        if any(term in title for term in ["engineer", "software engineer", "sde"]):
            score += 5
        elif any(term in tags for term in ["engineering", "developer"]):
            score += 2
    if any("java" in chunk for chunk in chunks):
        if "java" in title:
            score += 4
        elif "java" in tags:
            score += 2

    # Keep ranking aligned with filter fallback for malformed concatenated multi-keyword input.
    token_fallback = _keyword_token_fallback_terms(keyword)
    if score == 0 and token_fallback and all(term in hay for term in token_fallback):
        title_hits = sum(1 for term in token_fallback if term in title)
        score += 4 if title_hits >= 1 else 2
    return score


def _negative_penalty(job: dict[str, Any], options: AgentOptions) -> int:
    title = str(job.get("position") or "").lower()
    desc = str(job.get("description") or "").lower()
    penalty = 0

    if _looks_like_software_focus(options):
        if _title_matches_any(title, SOFTWARE_TITLE_SOFT_NEGATIVE_TERMS):
            penalty += 6

    if any(term in title for term in ["intern", "internship", "trainee", "apprentice"]):
        penalty += 12
    if options.strict_senior_only and any(term in title for term in ["junior", "jr", "entry", "associate"]):
        penalty += 10
    if "contract" in title and "full-time" not in desc:
        penalty += 2

    # User-configured negative keywords reduce score when they appear in non-title fields.
    user_negatives = _normalize_terms(options.negative_keywords)
    if user_negatives:
        tags = " ".join(str(t).lower() for t in (job.get("tags") or []) if t)
        company = str(job.get("company") or "").lower()
        for term in user_negatives:
            if term and (term in desc or term in tags or term in company):
                penalty += 8
                break

    return penalty


def _matches_user_negative_title_signal(job: dict[str, Any], options: AgentOptions) -> bool:
    negatives = _normalize_terms(options.negative_keywords)
    if not negatives:
        return False
    title = str(job.get("position") or "").lower()
    tags = " ".join(str(t).lower() for t in (job.get("tags") or []) if t)
    for term in negatives:
        if not term:
            continue
        if term in title or term in tags:
            return True
    return False


def _score_job_for_profile(job: dict[str, Any], options: AgentOptions) -> int:
    title = str(job.get("position") or "").lower()
    desc = str(job.get("description") or "").lower()
    tags = " ".join(str(t).lower() for t in (job.get("tags") or []) if t)
    company = str(job.get("company") or "").lower()
    hay = f"{title}\n{desc}\n{tags}\n{company}"

    score = _keyword_score(job, options.keyword)
    if any(term in title for term in SOFTWARE_TITLE_POSITIVE_TERMS):
        score += 3

    for role in _normalize_terms(options.target_roles):
        if role in title:
            score += 7
        elif role in hay:
            score += 2

    for tag in _normalize_terms(options.tech_stack_tags):
        if tag in title:
            score += 5
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

    score -= _negative_penalty(job, options)
    return score


def _rank_jobs_for_profile(jobs: list[dict[str, Any]], options: AgentOptions) -> list[dict[str, Any]]:
    if not jobs:
        return jobs
    filtered: list[dict[str, Any]] = []
    excluded = 0
    excluded_by_user_negatives = 0
    for job in jobs:
        if _is_obviously_irrelevant_for_software(job, options):
            excluded += 1
            continue
        if _matches_user_negative_title_signal(job, options):
            excluded_by_user_negatives += 1
            continue
        filtered.append(job)
    if excluded:
        print(f"Deterministic filter excluded {excluded} obviously irrelevant title(s) before LLM")
    if excluded_by_user_negatives:
        print(
            "Deterministic filter excluded "
            f"{excluded_by_user_negatives} job(s) via user negative keywords before LLM"
        )

    ranked = sorted(
        filtered,
        key=lambda job: _score_job_for_profile(job, options),
        reverse=True,
    )
    return ranked


def _new_jobs_only(jobs: list[dict[str, Any]], seen_before: set[str]) -> list[dict[str, Any]]:
    if not seen_before:
        return jobs
    out: list[dict[str, Any]] = []
    for job in jobs:
        key = stable_job_key(job)
        if key and key not in seen_before:
            out.append(job)
    return out


def _cap_jobs_per_company_for_llm(
    jobs: list[dict[str, Any]],
    *,
    max_per_company: int,
) -> list[dict[str, Any]]:
    if max_per_company <= 0:
        return jobs
    company_counts: dict[str, int] = {}
    capped: list[dict[str, Any]] = []
    for job in jobs:
        company = str(job.get("company") or "").strip().lower() or "__unknown__"
        count = company_counts.get(company, 0)
        if count >= max_per_company:
            continue
        company_counts[company] = count + 1
        capped.append(job)
    return capped


def _company_careers_hint_url(jobs: list[dict[str, Any]]) -> str | None:
    for job in jobs:
        raw_url = str(job.get("url") or "").strip()
        if not raw_url:
            continue
        try:
            parsed = urlparse(raw_url)
        except ValueError:
            continue
        if not parsed.scheme or not parsed.netloc:
            continue
        return f"{parsed.scheme}://{parsed.netloc}"
    return None


def _build_company_opportunity_note(
    jobs: list[dict[str, Any]],
    *,
    threshold: int = COMPANY_OPPORTUNITY_NOTE_THRESHOLD,
) -> str | None:
    if threshold <= 1 or not jobs:
        return None

    grouped: dict[str, list[dict[str, Any]]] = {}
    display_names: dict[str, str] = {}
    for job in jobs:
        display = str(job.get("company") or "").strip()
        if not display:
            continue
        key = display.lower()
        grouped.setdefault(key, []).append(job)
        display_names.setdefault(key, display)

    heavy_hitters = [(key, items) for key, items in grouped.items() if len(items) > threshold]
    if not heavy_hitters:
        return None

    heavy_hitters.sort(key=lambda item: len(item[1]), reverse=True)
    lines: list[str] = [
        "Note: Multiple openings were found at the same company. Consider checking the careers page / recruiter contact for faster follow-up."
    ]
    for key, company_jobs in heavy_hitters:
        company_name = display_names.get(key, "Unknown company")
        total = len(company_jobs)
        link = _company_careers_hint_url(company_jobs)
        if link:
            lines.append(f"- {company_name}: {total} matching openings ({link})")
        else:
            lines.append(f"- {company_name}: {total} matching openings")
    return "\n".join(lines)


def _extract_urls_from_bullets(text: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for line in (text or "").splitlines():
        line = line.strip()
        if not line.startswith("- "):
            continue
        match = re.search(r"https?://\S+", line)
        if not match:
            continue
        url = match.group(0).rstrip(").,]")
        if url in seen:
            continue
        seen.add(url)
        urls.append(url)
    return urls


def _match_emailed_jobs_from_output(
    cleaned_output: str,
    *,
    candidate_jobs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    urls = _extract_urls_from_bullets(cleaned_output)
    if not urls:
        return []
    by_url: dict[str, dict[str, Any]] = {}
    for job in candidate_jobs:
        url = str(job.get("url") or "").strip()
        if url and url not in by_url:
            by_url[url] = job
    matched: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for url in urls:
        job = by_url.get(url)
        if job is not None:
            key = stable_job_key(job)
            if key and key in seen_keys:
                continue
            if key:
                seen_keys.add(key)
            matched.append(job)
    return matched


def _parse_bullet_jobs_from_output(text: str) -> list[dict[str, Any]]:
    parsed: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line in (text or "").splitlines():
        line = line.strip()
        if not line.startswith("- "):
            continue
        match = re.match(r"^-\s*(.*?)\s+—\s+(.*?)\s+—\s+(https?://\S+)\s*$", line)
        if not match:
            continue
        title = match.group(1).strip()
        company = match.group(2).strip()
        url = match.group(3).rstrip(").,]")
        key = url or f"{company}::{title}"
        if not title or not company or not url or key in seen:
            continue
        seen.add(key)
        parsed.append({"position": title, "company": company, "url": url})
    return parsed


def _carryover_jobs_from_sent_history(
    jobs: list[dict[str, Any]],
    *,
    sent_job_keys: set[str],
    exclude_job_keys: set[str] | None = None,
    limit: int = MAX_CARRYOVER_EMAIL_JOBS,
) -> list[dict[str, Any]]:
    if not jobs or not sent_job_keys:
        return []
    excluded = exclude_job_keys or set()
    out: list[dict[str, Any]] = []
    for job in jobs:
        key = stable_job_key(job)
        if not key or key in excluded:
            continue
        if key in sent_job_keys:
            out.append(job)
        if len(out) >= limit:
            break
    return out


def _format_job_bullet(job: dict[str, Any]) -> str | None:
    title = str(job.get("position") or "").strip()
    company = str(job.get("company") or "").strip()
    url = str(job.get("url") or "").strip()
    if not (title and company and url):
        return None
    return f"- {title} — {company} — {url}"


def _build_carryover_section(carryover_jobs: list[dict[str, Any]]) -> str:
    return _build_grouped_job_section("Still open / previously shared:", carryover_jobs)


def _build_grouped_job_section(
    heading: str,
    jobs: list[dict[str, Any]],
    *,
    group_threshold: int = COMPANY_OPPORTUNITY_NOTE_THRESHOLD,
) -> str:
    jobs = _dedupe_jobs_by_key(jobs)
    if not jobs:
        return heading

    grouped: dict[str, list[dict[str, Any]]] = {}
    company_names: dict[str, str] = {}
    company_order: list[str] = []
    for job in jobs:
        company_display = str(job.get("company") or "").strip() or "Unknown company"
        key = company_display.lower()
        if key not in grouped:
            grouped[key] = []
            company_names[key] = company_display
            company_order.append(key)
        grouped[key].append(job)

    lines = [heading]
    for company_key in company_order:
        company_jobs = grouped[company_key]
        if len(company_jobs) > group_threshold:
            company_name = company_names.get(company_key, "Unknown company")
            roles: list[str] = []
            seen_titles: set[str] = set()
            for job in company_jobs:
                title = str(job.get("position") or "").strip()
                if not title or title in seen_titles:
                    continue
                seen_titles.add(title)
                roles.append(title)
                if len(roles) >= 3:
                    break
            role_summary = ", ".join(roles) if roles else "Multiple roles"
            remaining = max(0, len(company_jobs) - len(roles))
            if remaining:
                role_summary = f"{role_summary} + {remaining} more"
            follow_up_link = _company_careers_hint_url(company_jobs) or str(company_jobs[0].get("url") or "").strip()
            if follow_up_link:
                lines.append(f"- {company_name} ({len(company_jobs)} openings) — {role_summary} — {follow_up_link}")
            else:
                lines.append(f"- {company_name} ({len(company_jobs)} openings) — {role_summary}")
            continue

        for job in company_jobs:
            bullet = _format_job_bullet(job)
            if bullet:
                lines.append(bullet)
    return "\n".join(lines)


def _dedupe_jobs_by_key(jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for job in jobs:
        key = stable_job_key(job)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(job)
    return out


def _set_run_metrics(
    options: AgentOptions,
    *,
    fetched_jobs_count: int | None = None,
    keyword_jobs_count: int | None = None,
    emailed_jobs_count: int | None = None,
) -> None:
    store = options.metrics_store
    if store is None or not hasattr(store, "set_metrics"):
        return
    store.set_metrics(
        fetched_jobs_count=fetched_jobs_count,
        keyword_jobs_count=keyword_jobs_count,
        emailed_jobs_count=emailed_jobs_count,
    )


def _bullet_line_count(text: str) -> int:
    count = 0
    for line in (text or "").splitlines():
        if line.strip().startswith("- "):
            count += 1
    return count


def _build_email_subject(
    *,
    keyword: str,
    new_count: int,
    carryover_count: int,
) -> str:
    keyword_label = (keyword or "Job").strip().title()
    if new_count > 0 and carryover_count > 0:
        return f"{keyword_label} Jobs: {new_count} New + {carryover_count} Still Open"
    if new_count > 0:
        return f"{keyword_label} Jobs Alert: {new_count} New Match{'es' if new_count != 1 else ''}"
    return f"{keyword_label} Jobs Update: {carryover_count} Still Open Match{'es' if carryover_count != 1 else ''}"


def run_agent(settings: Settings, options: AgentOptions) -> int:
    _require_env(settings, require_email=not options.dry_run)
    _validate_recipient_config(settings, options)

    sources_label = ", ".join(options.sources or ["remoteok"])
    if options.prefetched_jobs is not None:
        jobs = options.prefetched_jobs
        print(f"Using shared fetched jobs cache for sources: {sources_label} | total: {len(jobs)}")
    else:
        jobs = fetch_jobs_from_sources(settings, options.sources or ["remoteok"])
        print(f"Fetched jobs from sources: {sources_label} | total: {len(jobs)}")
    keyword_jobs = filter_jobs_by_keyword(jobs, options.keyword)
    keyword_jobs = _rank_jobs_for_profile(keyword_jobs, options)
    _set_run_metrics(
        options,
        fetched_jobs_count=len(jobs),
        keyword_jobs_count=len(keyword_jobs),
        emailed_jobs_count=0,
    )

    if not keyword_jobs:
        print(f"No jobs found for keyword: {_display_keyword(options.keyword)}")
        return 0

    candidate_jobs, store, seen_before, current_keys = _load_previous_snapshot(
        keyword_jobs,
        dedupe_enabled=options.dedupe_enabled,
        seen_jobs_file=options.seen_jobs_file,
        snapshot_store=options.snapshot_store,
    )
    llm_candidates = candidate_jobs
    sent_job_keys: set[str] = set()
    if options.sent_jobs_store is not None and hasattr(options.sent_jobs_store, "load_sent_job_keys"):
        sent_job_keys = set(options.sent_jobs_store.load_sent_job_keys(max_age_days=MAX_CARRYOVER_AGE_DAYS))
        if sent_job_keys:
            print(f"Loaded sent-job history for carryover window: {MAX_CARRYOVER_AGE_DAYS} days ({len(sent_job_keys)} keys)")

    if options.dedupe_enabled and store is not None:
        current_set = set(current_keys)
        added = len(current_set - seen_before)
        removed = len(seen_before - current_set)
        print(
            f"Keyword-matched jobs: {len(keyword_jobs)} | "
            f"added since last run: {added} | removed since last run: {removed}"
        )
        llm_candidates = _new_jobs_only(candidate_jobs, seen_before)

    llm_candidate_keys = {stable_job_key(job) for job in llm_candidates if stable_job_key(job)}
    carryover_jobs = _carryover_jobs_from_sent_history(
        candidate_jobs,
        sent_job_keys=sent_job_keys,
        exclude_job_keys=llm_candidate_keys,
    )
    if carryover_jobs:
        print(f"Carryover jobs (already sent, still matching): {len(carryover_jobs)}")

    cleaned_output = "NONE"
    emailed_new_jobs: list[dict[str, Any]] = []
    fallback_new_match_count = 0
    email_sections: list[str] = []

    if llm_candidates:
        effective_llm_limit = max(1, int(options.llm_input_limit))
        if effective_llm_limit > MAX_LLM_INPUT_JOBS:
            print(
                f"Clamping llm_input_limit from {effective_llm_limit} to {MAX_LLM_INPUT_JOBS} "
                "to avoid oversized LLM payloads."
            )
            effective_llm_limit = MAX_LLM_INPUT_JOBS

        llm_candidates_capped = _cap_jobs_per_company_for_llm(
            llm_candidates,
            max_per_company=MAX_LLM_JOBS_PER_COMPANY,
        )
        if len(llm_candidates_capped) != len(llm_candidates):
            print(
                "Applied per-company LLM cap: "
                f"{MAX_LLM_JOBS_PER_COMPANY} (reduced candidates from "
                f"{len(llm_candidates)} to {len(llm_candidates_capped)})"
            )

        jobs_for_llm = llm_payload(llm_candidates_capped, limit=effective_llm_limit)
        print(
            f"Sending {len(jobs_for_llm)} job(s) to LLM "
            f"(candidate pool: {len(llm_candidates_capped)}, limit: {effective_llm_limit})"
        )
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
        if cleaned_output != "NONE":
            emailed_new_jobs = _match_emailed_jobs_from_output(cleaned_output, candidate_jobs=llm_candidates)
            if emailed_new_jobs:
                email_sections.append(_build_grouped_job_section("New matches:", emailed_new_jobs))
            else:
                # Fallback if the model output cannot be mapped back to known job URLs.
                emailed_new_jobs = _parse_bullet_jobs_from_output(cleaned_output)
                fallback_new_match_count = _bullet_line_count(cleaned_output)
                email_sections.append("New matches:")
                email_sections.append(cleaned_output)
        else:
            print("Model found no relevant NEW jobs from LLM.")
    else:
        print("No newly added jobs for LLM in this run.")

    if carryover_jobs:
        email_sections.append(_build_carryover_section(carryover_jobs))

    if not email_sections:
        print("No new or carryover jobs to email. Skipping email.")
        _set_run_metrics(options, emailed_jobs_count=0)
        if options.dedupe_enabled and store is not None:
            store.save(set(current_keys))
        return 0

    email_body = "\n\n".join(section for section in email_sections if section.strip())
    rendered_new_count = len(emailed_new_jobs) if emailed_new_jobs else fallback_new_match_count
    emailed_jobs_count_for_metrics = rendered_new_count + len(carryover_jobs)
    email_subject = _build_email_subject(
        keyword=options.keyword,
        new_count=rendered_new_count,
        carryover_count=len(carryover_jobs),
    )

    if options.dry_run:
        print("Dry run enabled. Email body:")
        print(email_body)
        emailed_jobs = _dedupe_jobs_by_key([*emailed_new_jobs, *carryover_jobs])
        _set_run_metrics(options, emailed_jobs_count=max(len(emailed_jobs), emailed_jobs_count_for_metrics))
    else:
        send_email(
            smtp_host=settings.smtp_host,
            smtp_port=settings.smtp_port,
            email_user=settings.email_user,
            email_pass=settings.email_pass,
            email_to=settings.email_to,
            subject=email_subject,
            body=email_body,
        )
        print("Email sent successfully!")
        emailed_jobs = _dedupe_jobs_by_key([*emailed_new_jobs, *carryover_jobs])
        _set_run_metrics(options, emailed_jobs_count=max(len(emailed_jobs), emailed_jobs_count_for_metrics))
        if options.sent_jobs_store is not None and emailed_jobs:
            options.sent_jobs_store.record_sent_jobs(emailed_jobs)

    if options.dedupe_enabled and store is not None:
        store.save(set(current_keys))

    return 0
