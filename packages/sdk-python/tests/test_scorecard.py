"""scorecard() — GET /v1/scorecards/{suite} (0.2.0, PR-S2). MockTransport, no network."""

from __future__ import annotations

import json

import httpx
import pytest

from benchlytix import BenchLytix
from benchlytix.client import AsyncBenchLytix
from benchlytix.errors import BenchlytixError

META = {"request_id": "r", "rate_limit": {"limit": 100, "remaining": 99, "reset": 1}}
DATA = {
    "suite": "workflow-automation",
    "suite_version": "v1",
    "status": "published",
    "sides": {
        "n8n": {
            "run_id": "11111111-1111-4111-8111-111111111111",
            "run_url": "https://benchlytix.com/runs/11111111-1111-4111-8111-111111111111",
            "label": "n8n self-hosted (n8nio/n8n:1.80.0)",
            "target_version": "n8nio/n8n:1.80.0",
            "verdict": "partial",
            "verdict_words": "Partly",
            "finished_at": "2026-10-12T10:00:00Z",
            "counts": {"pass": 1, "fail": 0, "not_observed": 0, "total": 1},
            "recipes": [
                {
                    "id": "wa-01",
                    "trigger_app": "sheets",
                    "trigger_event": "New or Updated Row",
                    "action_app": "slack",
                    "action_event": "Send Channel Message",
                    "outcome": "pass",
                    "reps": [{"rep": 1, "outcome": "pass", "latency_ms": 1200}, {"rep": 2, "outcome": "not_observed", "latency_ms": None}],
                    "source_url": "https://github.com/ckpark123/BenchLytix/blob/main/benchmarks/workflow-automation/v1/n8n/wa-01.json",
                }
            ],
        },
        "zapier": None,
    },
    "disclosures": ["No vendor pays BenchLytix for a test, a result or a position."],
    "methodology_url": "https://benchlytix.com/docs/scoring-methodology#workflow-scorecard",
    "overview_url": "https://benchlytix.com/benchmarks/replace/workflow-automation",
}


def _handler(seen: list[httpx.Request], status: int = 200, body: dict | None = None):
    def h(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        payload = body if body is not None else {"data": DATA, "meta": META}
        return httpx.Response(status, content=json.dumps(payload).encode(), headers={"content-type": "application/json"})

    return h


def test_scorecard_defaults_suite_and_parses() -> None:
    seen: list[httpx.Request] = []
    bl = BenchLytix(api_key="blx_live_x", transport=httpx.MockTransport(_handler(seen)))
    res = bl.scorecard()
    assert seen[0].url.path.endswith("/scorecards/workflow-automation")
    assert res.data.status == "published"
    side = res.data.sides.n8n
    assert side is not None
    assert side.verdict_words == "Partly"
    assert side.counts.pass_ == 1
    assert side.recipes[0].reps[1].outcome == "not_observed"
    assert side.recipes[0].reps[1].latency_ms is None
    assert res.data.sides.zapier is None


def test_scorecard_api_error_raises() -> None:
    err = {"error": {"code": "not_available", "message": "The scorecard API is not available yet", "request_id": "x"}}
    bl = BenchLytix(api_key="blx_live_x", transport=httpx.MockTransport(_handler([], 503, err)))
    with pytest.raises(BenchlytixError):
        bl.scorecard("workflow-automation")


@pytest.mark.asyncio
async def test_async_scorecard() -> None:
    seen: list[httpx.Request] = []

    async def h(req: httpx.Request) -> httpx.Response:
        return _handler(seen)(req)

    bl = AsyncBenchLytix(api_key="blx_live_x", transport=httpx.MockTransport(h))
    res = await bl.scorecard()
    assert res.data.suite == "workflow-automation"
    assert seen[0].url.path.endswith("/scorecards/workflow-automation")
