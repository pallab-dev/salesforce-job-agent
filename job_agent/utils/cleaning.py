from __future__ import annotations

import html
import re


def clean_llm_output(text: str, max_bullets: int = 8) -> str:
    text = html.unescape(text or "")

    # Remove fenced code blocks if the model ignores instructions.
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)

    if text.strip() == "NONE":
        return "NONE"

    lines: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith(("\u2022", "-", "*")):
            line = re.sub(r"^[\u2022*]\s*", "- ", line)
            lines.append(line)

    if not lines:
        return "NONE"

    return "\n".join(lines[:max_bullets])

