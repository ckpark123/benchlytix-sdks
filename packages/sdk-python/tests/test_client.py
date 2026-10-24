"""benchlytix — client tests.

Strategy: use httpx's MockTransport (no extra dep) so every test gives
its own canned response. Tests mirror the TS SDK client test surface:
3 methods x happy + 4 error paths, plus async variants.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from benchlytix import (
    AgentProfile,
    BenchLytix,
    BenchlytixAuthError,
    BenchlytixError,
    BenchlytixNotFoundError,
    BenchlytixRateLimitError,
    BenchlytixServerError,
    RankedAgentRow,
    VerifiedStatus,
)
from benchlytix.client import AsyncBenchLytix

META = {
    "request_id": "11111111-1111-4111-8111-111111111111",
    "rate_limit": {"limit": 100, "remaining": 99, "reset": 1700000000},
}


def _response(body: Any, status: int = 200, headers: dict[str, str] | None = None) -> httpx.Response:
    return httpx.Response(
        status,
        content=json.dumps(body).encode(),
        headers={"content-type": "application/json", **(headers or {})},
    )


def _transport(handler):
    return httpx.MockTransport(handler)


def _async_transport(handler):
    async def async_handler(request: httpx.Request) -> httpx.Response:
        return handler(request)

    return httpx.MockTransport(async_handler)


def _client(handler) -> BenchLytix:
    return BenchLytix(
        api_key="blx_live_test",
        base_url="https://api.benchlytix.com/v1",
        transport=_transport(handler),
    )


# ----- constructor -----


def test_constructor_requires_api_key(monkeypatch):
    monkeypatch.delenv("BENCHLYTIX_API_KEY", raising=False)
    with pytest.raises(ValueError, match="api_key is required"):
        BenchLytix()


def test_constructor_defaults_to_www_api_host(monkeypatch):
    # api.benchlytix.com has no DNS record; the API lives on www (2026-10-24).
    monkeypatch.delenv("BENCHLYTIX_BASE_URL", raising=False)
    captured: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(str(request.url))
        return _response({"data": [], "meta": META})

    client = BenchLytix(api_key="blx_live_test", transport=_transport(handler))
    client.leaderboard()
    assert captured[0] == "https://www.benchlytix.com/api/v1/agents"


def test_constructor_strips_trailing_slash():
    captured: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(str(request.url))
        return _response({"data": [], "meta": META})

    client = BenchLytix(
        api_key="blx_live_test",
        base_url="https://staging.benchlytix.com/api/v1/",
        transport=_transport(handler),
    )
    client.leaderboard()
    assert captured[0] == "https://staging.benchlytix.com/api/v1/agents"


# ----- leaderboard -----


def test_leaderboard_happy_path():
    row: dict[str, Any] = {
        "id": "a1",
        "slug": "legal-bot",
        "name": "Legal Bot",
        "task_category": "legal-summarization",
        "overall_score": 87.4,
        "verified_at": "2026-04-01T00:00:00.000Z",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer blx_live_test"
        assert request.url.path.endswith("/agents")
        assert request.url.params.get("category") == "legal-summarization"
        assert request.url.params.get("limit") == "5"
        return _response({"data": [row], "meta": META})

    client = _client(handler)
    result = client.leaderboard(category="legal-summarization", limit=5)
    assert len(result.data) == 1
    assert isinstance(result.data[0], RankedAgentRow)
    assert result.data[0].slug == "legal-bot"
    assert result.meta.rate_limit.limit == 100


def test_leaderboard_omits_params_when_none():
    captured: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(dict(request.url.params))
        return _response({"data": [], "meta": META})

    client = _client(handler)
    client.leaderboard()
    assert captured[0] == {}


# ----- agent -----


def test_agent_happy_path():
    profile: dict[str, Any] = {
        "id": "a1",
        "slug": "legal-bot",
        "name": "Legal Bot",
        "description": "A helpful legal assistant.",
        "task_category": "legal-summarization",
        "homepage_url": "https://example.com",
        "verified_at": "2026-04-01T00:00:00.000Z",
        "latest_score": {
            "week": "2026-W15",
            "overall_score": 87.4,
            "task_success_rate": 0.92,
            "latency_percentile": 88,
            "cost_efficiency_score": 75,
            "reliability_score": 91,
        },
        "badge_url": "https://benchlytix.com/api/v1/badge/legal-bot.svg",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/agents/legal-bot")
        return _response({"data": profile, "meta": META})

    client = _client(handler)
    result = client.agent("legal-bot")
    assert isinstance(result.data, AgentProfile)
    assert result.data.latest_score is not None
    assert result.data.latest_score.overall_score == 87.4


def test_agent_url_encodes_slug():
    captured: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        # Use raw_path (bytes, pre-decode) to verify URL encoding.
        captured.append(request.url.raw_path.decode())
        return _response(
            {
                "data": {
                    "id": "x",
                    "slug": "x",
                    "name": "x",
                    "description": None,
                    "task_category": "x",
                    "homepage_url": None,
                    "verified_at": None,
                    "latest_score": None,
                    "badge_url": "",
                },
                "meta": META,
            }
        )

    client = _client(handler)
    client.agent("weird slug")
    assert "%20" in captured[0]


def test_agent_rejects_empty_slug():
    client = _client(lambda r: _response({"data": None, "meta": META}))
    with pytest.raises(ValueError, match="non-empty string"):
        client.agent("")


# ----- verify_status -----


def test_verify_status_happy_path():
    payload: dict[str, Any] = {
        "verified": True,
        "score": 87.4,
        "verified_at": "2026-04-01T00:00:00.000Z",
        "badge_url": "https://benchlytix.com/api/v1/badge/legal-bot.svg",
        "slug": "legal-bot",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/verified-status")
        assert request.url.params["agent_metrxbot_id"] == (
            "00000000-0000-4000-8000-000000000000"
        )
        return _response({"data": payload, "meta": META})

    client = _client(handler)
    result = client.verify_status("00000000-0000-4000-8000-000000000000")
    assert isinstance(result.data, VerifiedStatus)
    assert result.data.verified is True


def test_verify_status_returns_empty_shape_for_unknown_id():
    payload: dict[str, Any] = {
        "verified": False,
        "score": None,
        "verified_at": None,
        "badge_url": None,
        "slug": None,
    }
    client = _client(lambda r: _response({"data": payload, "meta": META}))
    result = client.verify_status("00000000-0000-4000-8000-000000000000")
    assert result.data.verified is False
    assert result.data.score is None


# ----- error classes -----


def test_401_raises_auth_error():
    body = {
        "error": {
            "code": "unauthorized",
            "message": "Invalid API key",
            "request_id": "99999999-9999-4999-8999-999999999999",
        }
    }
    client = _client(lambda r: _response(body, status=401))
    with pytest.raises(BenchlytixAuthError) as exc_info:
        client.leaderboard()
    err = exc_info.value
    assert err.code == "unauthorized"
    assert err.status == 401
    assert err.request_id == "99999999-9999-4999-8999-999999999999"


def test_404_raises_not_found():
    body = {"error": {"code": "not_found", "message": "Agent not found", "request_id": "x"}}
    client = _client(lambda r: _response(body, status=404))
    with pytest.raises(BenchlytixNotFoundError):
        client.agent("missing")


def test_429_raises_rate_limit_with_retry_after():
    body = {"error": {"code": "rate_limited", "message": "Too many", "request_id": "x"}}
    client = _client(
        lambda r: _response(body, status=429, headers={"retry-after": "60"})
    )
    with pytest.raises(BenchlytixRateLimitError) as exc_info:
        client.leaderboard()
    assert exc_info.value.retry_after == 60
    assert exc_info.value.code == "rate_limited"


def test_500_raises_server_error():
    body = {"error": {"code": "internal_error", "message": "Oops", "request_id": "x"}}
    client = _client(lambda r: _response(body, status=500))
    with pytest.raises(BenchlytixServerError):
        client.leaderboard()


def test_503_raises_server_error_with_not_available_code():
    body = {"error": {"code": "not_available", "message": "Disabled", "request_id": "x"}}
    client = _client(lambda r: _response(body, status=503))
    with pytest.raises(BenchlytixServerError) as exc_info:
        client.leaderboard()
    assert exc_info.value.code == "not_available"


def test_non_json_body_still_raises_typed_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            502,
            content=b"<html>oops</html>",
            headers={"content-type": "text/html"},
        )

    client = _client(handler)
    with pytest.raises(BenchlytixError):
        client.leaderboard()


# ----- async variant -----


@pytest.mark.asyncio
async def test_async_leaderboard():
    row = {
        "id": "a1",
        "slug": "legal-bot",
        "name": "Legal Bot",
        "task_category": "legal-summarization",
        "overall_score": 87.4,
        "verified_at": "2026-04-01T00:00:00.000Z",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return _response({"data": [row], "meta": META})

    async with AsyncBenchLytix(
        api_key="blx_live_test",
        base_url="https://api.benchlytix.com/v1",
        transport=_async_transport(handler),
    ) as client:
        result = await client.leaderboard(limit=5)
    assert len(result.data) == 1
    assert result.data[0].slug == "legal-bot"


@pytest.mark.asyncio
async def test_async_auth_error():
    body = {"error": {"code": "unauthorized", "message": "no", "request_id": "x"}}

    def handler(request: httpx.Request) -> httpx.Response:
        return _response(body, status=401)

    async with AsyncBenchLytix(
        api_key="blx_live_test",
        base_url="https://api.benchlytix.com/v1",
        transport=_async_transport(handler),
    ) as client:
        with pytest.raises(BenchlytixAuthError):
            await client.leaderboard()
