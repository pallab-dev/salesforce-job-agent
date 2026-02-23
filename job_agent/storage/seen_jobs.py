from __future__ import annotations

import json
from pathlib import Path


class SeenJobsStore:
    def __init__(self, path: Path):
        self.path = path

    def load(self) -> set[str]:
        if not self.path.exists():
            return set()
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return set()
        if not isinstance(raw, list):
            return set()
        return {str(item) for item in raw if str(item).strip()}

    def save(self, keys: set[str]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(sorted(keys), ensure_ascii=True, indent=2),
            encoding="utf-8",
        )

    def filter_new(self, keys: list[str]) -> tuple[list[str], set[str]]:
        seen = self.load()
        new_keys = [key for key in keys if key and key not in seen]
        return new_keys, seen

