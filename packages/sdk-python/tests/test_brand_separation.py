"""Brand-separation regression test for ``benchlytix`` (Python SDK).

Mirrors the marketing-site brand-separation gate. Asserts that no
published artifact (src/ + README + pyproject.toml) contains brand
tokens that should never appear in the public SDK surface.

Wire-format exemption: the upstream API expects the query parameter
``agent_metrxbot_id``. The SDK has to send it on the wire to make
requests succeed. The exemption is the EXACT string with the
``agent_`` prefix; loose mentions still fail the gate.
"""

from __future__ import annotations

from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).parent.parent
PUBLISHED_ROOTS = ["src", "README.md", "pyproject.toml"]

BANNED_TOKENS = (
    "Powered by Metrxbot",
    "Certified by Metrxbot",
    "metrxbot.com",
    "Metrx-Bot",
    "Metrx Bot",
    "metrx-team",
    "Metrxbot",
    "MetrxBot",
)

EXEMPT_SUBSTRINGS = ("agent_metrxbot_id",)


def _walk(path: Path):
    if path.is_file():
        yield path
        return
    if not path.is_dir():
        return
    for child in path.iterdir():
        if child.name in {"__pycache__", ".venv", "dist", "build"}:
            continue
        if child.name.endswith(".egg-info"):
            continue
        yield from _walk(child)


def test_published_artifacts_contain_no_banned_brand_tokens() -> None:
    violations: list[tuple[str, str, int]] = []

    for root in PUBLISHED_ROOTS:
        abs_root = PACKAGE_ROOT / root
        for file in _walk(abs_root):
            if file.suffix not in {".py", ".md", ".toml", ".json"}:
                continue
            content = file.read_text(encoding="utf-8")
            scan_content = content
            for ex in EXEMPT_SUBSTRINGS:
                scan_content = scan_content.replace(ex, "")
            lower = scan_content.lower()
            for token in BANNED_TOKENS:
                idx = lower.find(token.lower())
                if idx != -1:
                    up_to = scan_content[:idx]
                    line = up_to.count("\n") + 1
                    violations.append(
                        (str(file.relative_to(PACKAGE_ROOT)), token, line)
                    )

    assert violations == [], "Brand-separation violations:\n" + "\n".join(
        f"  {f}:{ln}  →  {t}" for f, t, ln in violations
    )
