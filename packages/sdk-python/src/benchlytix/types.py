"""Pydantic models mirroring the S2a API v1 envelope + service shapes.

Source of truth: `lib/api/envelope.ts` + `lib/api/v1-service.ts`.
If S2 drifts, these models must update in lock-step.
"""

from __future__ import annotations

from typing import Generic, List, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict

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


# Convenience aliases for the three current endpoints.
LeaderboardResponse = SuccessEnvelope[List[RankedAgentRow]]
AgentResponse = SuccessEnvelope[AgentProfile]
VerifiedStatusResponse = SuccessEnvelope[VerifiedStatus]
