"""BenchLytix Python client — sync + async.

Mirrors the @benchlytixai/sdk TypeScript surface method-for-method.

Both entry points share the same request-level logic via `_parse_response`.
The sync client uses `httpx.Client`; the async client uses `httpx.AsyncClient`.

Example
-------
>>> from benchlytix import BenchLytix
>>> bl = BenchLytix(api_key="blx_live_...")
>>> result = bl.leaderboard(category="legal-summarization", limit=5)
>>> for row in result.data:
...     print(row.name, row.overall_score)
"""

from __future__ import annotations

import os
from types import TracebackType
from typing import Any, List, Optional, Tuple, Type
from urllib.parse import quote

import httpx

from .errors import BenchlytixError, error_from_response
from .types import (
    AgentResponse,
    LeaderboardResponse,
    ReplacementsResponse,
    ScorecardResponse,
    VerifiedStatusResponse,
)


def _replacement_params(
    goal: Optional[str],
    paid_tool: Optional[str],
    hosting: Optional[str],
    osi_only: Optional[bool],
    include_proprietary: Optional[bool],
    must_keep_integrations: Optional[List[str]],
) -> List[Tuple[str, str]]:
    if not goal and not paid_tool:
        raise ValueError("replacements(): goal or paid_tool is required")
    params: List[Tuple[str, str]] = []
    if goal:
        params.append(("goal", goal))
    if paid_tool:
        params.append(("paid_tool", paid_tool))
    if hosting:
        params.append(("hosting", hosting))
    if osi_only is not None:
        params.append(("osi_only", "true" if osi_only else "false"))
    if include_proprietary is not None:
        params.append(("include_proprietary", "true" if include_proprietary else "false"))
    # One parameter per app, so an app name may contain a comma.
    for app in must_keep_integrations or []:
        params.append(("must_keep_integrations", app))
    return params

_DEFAULT_BASE_URL = "https://api.benchlytix.com/v1"
_USER_AGENT = "benchlytix-python/0.2.0"


def _resolve_api_key(explicit: Optional[str]) -> str:
    key = explicit or os.environ.get("BENCHLYTIX_API_KEY")
    if not key:
        raise ValueError(
            "BenchLytix api_key is required. Pass api_key=... or set "
            "BENCHLYTIX_API_KEY in your environment."
        )
    return key


def _resolve_base_url(explicit: Optional[str]) -> str:
    return (
        explicit
        or os.environ.get("BENCHLYTIX_BASE_URL")
        or _DEFAULT_BASE_URL
    ).rstrip("/")


def _parse_response(response: httpx.Response) -> Any:
    """Raise the right BenchlytixError subclass, or return parsed JSON."""
    try:
        body = response.json() if response.content else None
    except ValueError:
        body = None

    if response.is_error:
        retry_after_header = response.headers.get("retry-after")
        retry_after: Optional[int] = None
        if retry_after_header is not None:
            try:
                retry_after = int(retry_after_header)
            except ValueError:
                retry_after = None
        raise error_from_response(response.status_code, body, retry_after)

    return body


class BenchLytix:
    """Synchronous client.

    For async code, use :class:`AsyncBenchLytix` instead.
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        transport: Optional[httpx.BaseTransport] = None,
    ) -> None:
        self._api_key = _resolve_api_key(api_key)
        self._base_url = _resolve_base_url(base_url)
        self._client = httpx.Client(
            base_url=self._base_url,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Accept": "application/json",
                "User-Agent": _USER_AGENT,
            },
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "BenchLytix":
        return self

    def __exit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        self.close()

    def leaderboard(
        self,
        *,
        category: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> LeaderboardResponse:
        params: dict[str, str] = {}
        if category is not None:
            params["category"] = category
        if limit is not None:
            params["limit"] = str(limit)
        raw = _parse_response(self._client.get("/agents", params=params))
        return LeaderboardResponse.model_validate(raw)

    def agent(self, slug: str) -> AgentResponse:
        if not slug or not isinstance(slug, str):
            raise ValueError("agent(slug): slug must be a non-empty string")
        raw = _parse_response(self._client.get(f"/agents/{quote(slug, safe='')}"))
        return AgentResponse.model_validate(raw)

    def verify_status(self, agent_id: str) -> VerifiedStatusResponse:
        """Lookup an agent's verified-status by its UUID.

        Unknown id → response with ``verified=False`` and all nulls
        (NOT 404), so callers can branch on a single field without
        try/except.

        Use ``agent(slug)`` and read ``verified_at`` for slug-based
        lookup; this method is for the UUID path.

        :param agent_id: The agent's UUID (NOT the slug).
        """
        if not agent_id or not isinstance(agent_id, str):
            raise ValueError(
                "verify_status(agent_id): id must be a non-empty string"
            )
        # Wire query-param name is fixed by the upstream API contract;
        # SDK callers pass `agent_id`. Server-side rename is tracked
        # separately and won't change this method's Python signature.
        raw = _parse_response(
            self._client.get(
                "/verified-status",
                params={"agent_metrxbot_id": agent_id},
            )
        )
        return VerifiedStatusResponse.model_validate(raw)

    def replacements(
        self,
        *,
        goal: Optional[str] = None,
        paid_tool: Optional[str] = None,
        hosting: Optional[str] = None,
        osi_only: Optional[bool] = None,
        include_proprietary: Optional[bool] = None,
        must_keep_integrations: Optional[List[str]] = None,
    ) -> ReplacementsResponse:
        """Self-hostable replacements for a paid tool or a goal (GET /v1/replacements).

        Every candidate has ``evidence_label`` (tested | coverage_checked |
        listed_untested); there is no score on untested rows.
        """
        params = _replacement_params(goal, paid_tool, hosting, osi_only, include_proprietary, must_keep_integrations)
        raw = _parse_response(self._client.get("/replacements", params=params))
        return ReplacementsResponse.model_validate(raw)

    def scorecard(self, suite: str = "workflow-automation") -> ScorecardResponse:
        """The latest published tested scorecard (GET /v1/scorecards/{suite}).

        ``workflow-automation`` (the default) is self-hosted n8n vs Zapier Free.
        ``status`` is ``no_published_run`` until a reviewed run is published.
        """
        raw = _parse_response(self._client.get(f"/scorecards/{quote(suite, safe='')}"))
        return ScorecardResponse.model_validate(raw)


class AsyncBenchLytix:
    """Asynchronous client. Use inside an event loop."""

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 30.0,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ) -> None:
        self._api_key = _resolve_api_key(api_key)
        self._base_url = _resolve_base_url(base_url)
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Accept": "application/json",
                "User-Agent": _USER_AGENT,
            },
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "AsyncBenchLytix":
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        await self.aclose()

    async def leaderboard(
        self,
        *,
        category: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> LeaderboardResponse:
        params: dict[str, str] = {}
        if category is not None:
            params["category"] = category
        if limit is not None:
            params["limit"] = str(limit)
        raw = _parse_response(await self._client.get("/agents", params=params))
        return LeaderboardResponse.model_validate(raw)

    async def agent(self, slug: str) -> AgentResponse:
        if not slug or not isinstance(slug, str):
            raise ValueError("agent(slug): slug must be a non-empty string")
        raw = _parse_response(
            await self._client.get(f"/agents/{quote(slug, safe='')}")
        )
        return AgentResponse.model_validate(raw)

    async def verify_status(self, agent_id: str) -> VerifiedStatusResponse:
        """Async variant of ``BenchLytix.verify_status``. See its docstring."""
        if not agent_id or not isinstance(agent_id, str):
            raise ValueError(
                "verify_status(agent_id): id must be a non-empty string"
            )
        # Wire query-param fixed by upstream contract; see sync sibling.
        raw = _parse_response(
            await self._client.get(
                "/verified-status",
                params={"agent_metrxbot_id": agent_id},
            )
        )
        return VerifiedStatusResponse.model_validate(raw)

    async def replacements(
        self,
        *,
        goal: Optional[str] = None,
        paid_tool: Optional[str] = None,
        hosting: Optional[str] = None,
        osi_only: Optional[bool] = None,
        include_proprietary: Optional[bool] = None,
        must_keep_integrations: Optional[List[str]] = None,
    ) -> ReplacementsResponse:
        """Async variant of ``BenchLytix.replacements``."""
        params = _replacement_params(goal, paid_tool, hosting, osi_only, include_proprietary, must_keep_integrations)
        raw = _parse_response(await self._client.get("/replacements", params=params))
        return ReplacementsResponse.model_validate(raw)

    async def scorecard(self, suite: str = "workflow-automation") -> ScorecardResponse:
        """Async variant of ``BenchLytix.scorecard``."""
        raw = _parse_response(await self._client.get(f"/scorecards/{quote(suite, safe='')}"))
        return ScorecardResponse.model_validate(raw)


# Re-export at module level so `from benchlytix.client import BenchlytixError`
# works for callers who didn't import from the top-level package.
__all__ = [
    "BenchLytix",
    "AsyncBenchLytix",
    "BenchlytixError",
]
