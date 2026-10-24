"""replacements() — GET /v1/replacements (0.2.0, PR-S3). MockTransport, no network."""

from __future__ import annotations

import json

import httpx
import pytest

from benchlytix import BenchLytix, __version__
from benchlytix.client import AsyncBenchLytix

META = {"request_id": "r", "rate_limit": {"limit": 100, "remaining": 99, "reset": 1}}
DATA = {
    "query_echo": {"goal": None, "paid_tool": {"input": "Zapier", "slug": "zapier", "name": "Zapier"}},
    "candidates": [
        {
            "slug": "n8n",
            "name": "n8n",
            "source_code_url": "https://github.com/n8n-io/n8n",
            "detail_url": "https://benchlytix.com/replace/tool/n8n",
            "evidence_label": "coverage_checked",
            "facts": {"licence_spdx": ["Apache-2.0", "Commons-Clause"], "licence_class": "fair_code", "stars": 1, "last_commit_at": None, "archived": False, "fetched_at": "x"},
            "claims": [{"text": "Licence: ...", "basis": "crawled", "source_url": "https://x"}],
        }
    ],
    "disclosure": {"no_vendor_payment": True, "attribution": "awesome-selfhosted CC-BY-SA", "methodology_url": "https://benchlytix.com/docs/scoring-methodology#replacement-finder"},
}


def _handler(seen: list[httpx.Request]):
    def h(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, content=json.dumps({"data": DATA, "meta": META}).encode(), headers={"content-type": "application/json"})

    return h


def test_version_is_0_2_0() -> None:
    assert __version__ == "0.2.1"


def test_replacements_maps_params_and_parses() -> None:
    seen: list[httpx.Request] = []
    bl = BenchLytix(api_key="blx_live_x", transport=httpx.MockTransport(_handler(seen)))
    res = bl.replacements(paid_tool="Zapier", hosting="docker", osi_only=False, must_keep_integrations=["Slack", "A, B"])
    assert res.data.candidates[0].evidence_label == "coverage_checked"
    assert res.data.candidates[0].verdict is None
    req = seen[0]
    assert req.url.path.endswith("/replacements")
    assert req.url.params.get_list("must_keep_integrations") == ["Slack", "A, B"]
    assert req.url.params["paid_tool"] == "Zapier"
    assert req.headers["user-agent"] == "benchlytix-python/0.2.1"


def test_replacements_requires_goal_or_paid_tool() -> None:
    bl = BenchLytix(api_key="blx_live_x", transport=httpx.MockTransport(_handler([])))
    with pytest.raises(ValueError):
        bl.replacements()


@pytest.mark.asyncio
async def test_async_replacements() -> None:
    seen: list[httpx.Request] = []

    async def h(req: httpx.Request) -> httpx.Response:
        return _handler(seen)(req)

    bl = AsyncBenchLytix(api_key="blx_live_x", transport=httpx.MockTransport(h))
    res = await bl.replacements(goal="automation")
    assert res.data.disclosure.no_vendor_payment is True
    assert seen[0].url.params["goal"] == "automation"
