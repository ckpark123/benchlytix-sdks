"""Typed exceptions — mirror @benchlytix/sdk TS error classes."""

from __future__ import annotations

from typing import Any, Optional


class BenchlytixError(Exception):
    """Base class for every SDK-surfaced error.

    Carries the fields from the S2a error envelope: `code`, `status`,
    `request_id`, plus optional `details`.
    """

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status: int,
        request_id: str,
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.request_id = request_id
        self.details = details

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"{self.__class__.__name__}(code={self.code!r}, status={self.status}, "
            f"message={self.message!r}, request_id={self.request_id!r})"
        )


class BenchlytixAuthError(BenchlytixError):
    """Raised on 401 responses."""


class BenchlytixNotFoundError(BenchlytixError):
    """Raised on 404 responses."""


class BenchlytixRateLimitError(BenchlytixError):
    """Raised on 429 responses. Exposes `retry_after` in seconds."""

    def __init__(
        self,
        *,
        code: str,
        message: str,
        status: int,
        request_id: str,
        details: Optional[Any] = None,
        retry_after: Optional[int] = None,
    ) -> None:
        super().__init__(
            code=code,
            message=message,
            status=status,
            request_id=request_id,
            details=details,
        )
        self.retry_after = retry_after


class BenchlytixServerError(BenchlytixError):
    """Raised on 5xx responses."""


def error_from_response(
    status: int,
    body: Any,
    retry_after: Optional[int] = None,
) -> BenchlytixError:
    """Build the right subclass from a parsed response body + HTTP status.

    Mirrors @benchlytix/sdk's `errorFromResponse` so both SDKs raise
    shape-identical errors. `body` may be `None` when the response has
    no JSON payload (e.g. a 502 gateway).
    """

    envelope = body if isinstance(body, dict) and "error" in body else None
    err = envelope["error"] if envelope else {}
    code = err.get("code") or _default_code_for_status(status)
    message = err.get("message") or f"HTTP {status}"
    request_id = err.get("request_id") or ""
    details = err.get("details")

    if status == 401:
        return BenchlytixAuthError(
            code=code,
            message=message,
            status=status,
            request_id=request_id,
            details=details,
        )
    if status == 404:
        return BenchlytixNotFoundError(
            code=code,
            message=message,
            status=status,
            request_id=request_id,
            details=details,
        )
    if status == 429:
        return BenchlytixRateLimitError(
            code=code,
            message=message,
            status=status,
            request_id=request_id,
            details=details,
            retry_after=retry_after,
        )
    if status >= 500:
        return BenchlytixServerError(
            code=code,
            message=message,
            status=status,
            request_id=request_id,
            details=details,
        )
    return BenchlytixError(
        code=code,
        message=message,
        status=status,
        request_id=request_id,
        details=details,
    )


def _default_code_for_status(status: int) -> str:
    if status == 401:
        return "unauthorized"
    if status == 403:
        return "forbidden"
    if status == 404:
        return "not_found"
    if status == 429:
        return "rate_limited"
    if status == 503:
        return "not_available"
    return "internal_error"
