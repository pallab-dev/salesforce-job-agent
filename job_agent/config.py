from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    groq_api_key: str
    email_user: str
    email_pass: str
    groq_model: str = "llama-3.1-8b-instant"
    groq_api_url: str = "https://api.groq.com/openai/v1/chat/completions"
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    remoteok_api_url: str = "https://remoteok.com/api"
    request_timeout_seconds: int = 30
    groq_timeout_seconds: int = 60


def load_settings() -> Settings:
    return Settings(
        groq_api_key=(os.getenv("GROQ_API_KEY") or "").strip(),
        email_user=(os.getenv("EMAIL_USER") or "").strip(),
        email_pass=(os.getenv("EMAIL_PASS") or "").strip().replace(" ", ""),
        groq_model=(os.getenv("GROQ_MODEL") or "llama-3.1-8b-instant").strip(),
        groq_api_url=(os.getenv("GROQ_API_URL") or "https://api.groq.com/openai/v1/chat/completions").strip(),
        smtp_host=(os.getenv("SMTP_HOST") or "smtp.gmail.com").strip(),
        smtp_port=int((os.getenv("SMTP_PORT") or "587").strip()),
        remoteok_api_url=(os.getenv("REMOTEOK_API_URL") or "https://remoteok.com/api").strip(),
        request_timeout_seconds=int((os.getenv("REQUEST_TIMEOUT_SECONDS") or "30").strip()),
        groq_timeout_seconds=int((os.getenv("GROQ_TIMEOUT_SECONDS") or "60").strip()),
    )


def default_seen_jobs_path() -> Path:
    return Path(".job_agent/seen_jobs.json")

