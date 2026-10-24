"""benchlytix — Official Python SDK for the BenchLytix Machine API.

Example
-------
>>> from benchlytix import BenchLytix
>>> bl = BenchLytix(api_key="blx_live_...")
>>> result = bl.leaderboard(category="legal-summarization", limit=5)
>>> print(result.data[0].slug)
"""

from .client import BenchLytix
from .errors import (
    BenchlytixAuthError,
    BenchlytixError,
    BenchlytixNotFoundError,
    BenchlytixRateLimitError,
    BenchlytixServerError,
)
from .types import (
    AgentProfile,
    LatestScore,
    RankedAgentRow,
    RateLimitMeta,
    ReplacementCandidate,
    ReplacementsResult,
    ScorecardResult,
    ScorecardSide,
    SuccessEnvelope,
    SuccessMeta,
    VerifiedStatus,
)

__version__ = "0.2.1"

__all__ = [
    "BenchLytix",
    "BenchlytixError",
    "BenchlytixAuthError",
    "BenchlytixNotFoundError",
    "BenchlytixRateLimitError",
    "BenchlytixServerError",
    "AgentProfile",
    "LatestScore",
    "RankedAgentRow",
    "RateLimitMeta",
    "ReplacementCandidate",
    "ReplacementsResult",
    "ScorecardResult",
    "ScorecardSide",
    "SuccessEnvelope",
    "SuccessMeta",
    "VerifiedStatus",
    "__version__",
]
