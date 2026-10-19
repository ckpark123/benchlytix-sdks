"""Pydantic models mirroring the S2a API v1 envelope + service shapes.

Source of truth: `lib/api/envelope.ts` + `lib/api/v1-service.ts`.
If S2 drifts, these models must update in lock-step.
"""

from __future__ import annotations

from typing import Generic, List, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")

BenchlytixErrorCode = Literal[
    "unauthorized",
    "forbidden",
    "not_found",
    "rate_limited",
    "validation_error",
    "not_available",
    "internal_error",
]


class RateLimitMeta(BaseModel):
    model_config = ConfigDict(extra="ignore")

    limit: int
    remaining: int
    reset: int  # Unix seconds


class SuccessMeta(BaseModel):
    model_config = ConfigDict(extra="ignore")

    request_id: str
    rate_limit: RateLimitMeta


class SuccessEnvelope(BaseModel, Generic[T]):
    """Envelope for every 2xx response.

    We intentionally keep `data` loose (`T` substituted at the call site)
    because pydantic v2's generics are ergonomic enough without custom
    `RootModel` gymnastics.
    """

    model_config = ConfigDict(extra="ignore")

    data: T
    meta: SuccessMeta


class ErrorPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: BenchlytixErrorCode
    message: str
    request_id: str
    details: Optional[object] = None


class ErrorEnvelope(BaseModel):
    model_config = ConfigDict(extra="ignore")

    error: ErrorPayload


class RankedAgentRow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    slug: str
    name: str
    task_category: str
    overall_score: Optional[float] = None
    verified_at: Optional[str] = None


class LatestScore(BaseModel):
    model_config = ConfigDict(extra="ignore")

    week: str
    overall_score: Optional[float] = None
    task_success_rate: Optional[float] = None
    latency_percentile: Optional[float] = None
    cost_efficiency_score: Optional[float] = None
    reliability_score: Optional[float] = None


class AgentProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    slug: str
    name: str
    description: Optional[str] = None
    task_category: str
    homepage_url: Optional[str] = None
    verified_at: Optional[str] = None
    latest_score: Optional[LatestScore] = None
    badge_url: str


class VerifiedStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")

    verified: bool
    score: Optional[float] = None
    verified_at: Optional[str] = None
    badge_url: Optional[str] = None
    slug: Optional[str] = None


# Replacement finder — GET /v1/replacements (0.2.0). Every candidate carries
# exactly one evidence_label; scorecard_url / verdict / run_id only on
# "tested" rows; there is no score field. Mirrors lib/replacements/match.ts.


class ReplacementClaim(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str
    basis: Literal["measured", "crawled", "editorial"]
    source_url: str


class ReplacementCoverage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tool: str
    matched: List[str]
    missing: List[str]
    unknown: List[str]
    pct: Optional[int] = None
    crawled_at: str
    source_url: str
    snapshot_status: Literal["complete", "partial"]
    connector_count: int


class ReplacementFacts(BaseModel):
    model_config = ConfigDict(extra="ignore")

    licence_spdx: List[str]
    licence_class: Literal["osi", "open_core", "fair_code", "source_available", "proprietary", "unclassified"]
    stars: Optional[int] = None
    last_commit_at: Optional[str] = None
    archived: Optional[bool] = None
    fetched_at: str


class ReplacementDescription(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str
    source_url: str
    kind: Literal["reviewed", "project"]


class ReplacementFootprint(BaseModel):
    """A rough self-hosting reference from the project's compose file; never a measurement."""

    model_config = ConfigDict(extra="ignore")

    services: List[str]
    size: Literal["small", "medium", "large"]
    reference_server: Optional[dict] = None
    services_source_url: str
    sentence: str


class ReplacementCandidate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    slug: str
    name: str
    listed_name: Optional[str] = None
    maintenance: Literal["active", "inactive", "unknown"] = "unknown"
    description: Optional[ReplacementDescription] = None
    caution: Optional[dict] = None
    footprint: Optional[ReplacementFootprint] = None
    source_code_url: str
    detail_url: str
    evidence_label: Literal["tested", "coverage_checked", "listed_untested"]
    run_id: Optional[str] = None
    scorecard_url: Optional[str] = None
    verdict: Optional[Literal["replace", "partial", "do_not_replace", "insufficient"]] = None
    coverage: Optional[ReplacementCoverage] = None
    one_line: Optional[str] = None
    facts: ReplacementFacts
    claims: List[ReplacementClaim]


class ReplacementDisclosure(BaseModel):
    model_config = ConfigDict(extra="ignore")

    no_vendor_payment: bool
    attribution: str
    methodology_url: str


class ReplacementsResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    query_echo: dict
    candidates: List[ReplacementCandidate]
    hidden: List[dict] = []
    paid_tool_pricing: Optional[dict] = None
    paid_tool_coverage: Optional[dict] = None
    disclosure: ReplacementDisclosure


# ---------------------------------------------------------------------------
# Tested scorecards: GET /v1/scorecards/{suite} (0.2.0). Per-rep outcome and
# latency only; an unreadable rep is "not_observed", never a failure. There is
# no score: show verdict_words with the disclosures.
# ---------------------------------------------------------------------------

ScorecardOutcome = Literal["pass", "fail", "not_observed"]


class ScorecardRep(BaseModel):
    model_config = ConfigDict(extra="ignore")

    rep: int
    outcome: ScorecardOutcome
    latency_ms: Optional[int] = None


class ScorecardRecipe(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    trigger_app: str
    trigger_event: str
    action_app: str
    action_event: str
    outcome: ScorecardOutcome
    reps: List[ScorecardRep]
    source_url: str


class ScorecardCounts(BaseModel):
    """Recipe counts. ``pass`` is a Python keyword, so the field is ``pass_``."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    pass_: int = Field(alias="pass")
    fail: int
    not_observed: int
    total: int


class ScorecardSide(BaseModel):
    model_config = ConfigDict(extra="ignore")

    run_id: str
    run_url: str
    label: str
    target_version: Optional[str] = None
    verdict: Optional[Literal["replace", "partial", "do_not_replace", "insufficient"]] = None
    verdict_words: Optional[str] = None
    finished_at: Optional[str] = None
    counts: ScorecardCounts
    recipes: List[ScorecardRecipe]


class ScorecardSides(BaseModel):
    model_config = ConfigDict(extra="ignore")

    n8n: Optional[ScorecardSide] = None
    zapier: Optional[ScorecardSide] = None


class ScorecardResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    suite: Literal["workflow-automation"]
    suite_version: str
    status: Literal["published", "no_published_run"]
    sides: ScorecardSides
    disclosures: List[str]
    methodology_url: str
    overview_url: str


# Convenience aliases for the current endpoints.
LeaderboardResponse = SuccessEnvelope[List[RankedAgentRow]]
AgentResponse = SuccessEnvelope[AgentProfile]
VerifiedStatusResponse = SuccessEnvelope[VerifiedStatus]
ReplacementsResponse = SuccessEnvelope[ReplacementsResult]
ScorecardResponse = SuccessEnvelope[ScorecardResult]
