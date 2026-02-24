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
    seen_urls: set[str] = set()
    seen_lines: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if line.startswith(("\u2022", "-", "*")):
            line = re.sub(r"^[\u2022*]\s*", "- ", line)
            match = re.search(r"https?://\S+", line)
            if match:
                url = match.group(0).rstrip(").,]")
                if url in seen_urls:
                    continue
                seen_urls.add(url)
            elif line in seen_lines:
                continue
            seen_lines.add(line)
            lines.append(line)

    if not lines:
        return "NONE"

    return "\n".join(lines[:max_bullets])
