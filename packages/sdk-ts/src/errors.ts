/**
 * Typed error classes — map 1:1 to HTTP status codes from the S2a
 * envelope (`ErrorEnvelope` in lib/api/envelope.ts).
 *
 * All errors carry:
 *   - code       (from error.code — the finite enum)
 *   - message    (human-readable, echoed from server)
 *   - status     (HTTP status)
 *   - requestId  (for support tickets / Sentry grep)
 *
 * Subclass-specific extras (e.g. retryAfter on 429) are exposed on the
 * subclass only. Callers should pattern-match via `instanceof`.
 */

import type { BenchlytixErrorCode } from './types'

export class BenchlytixError extends Error {
  readonly code: BenchlytixErrorCode
  readonly status: number
  readonly requestId: string
  readonly details?: unknown

  constructor(args: {
    code: BenchlytixErrorCode
    message: string
    status: number
    requestId: string
    details?: unknown
  }) {
    super(args.message)
    this.name = 'BenchlytixError'
    this.code = args.code
    this.status = args.status
    this.requestId = args.requestId
    this.details = args.details
    // Preserve prototype chain across ES5 targets.
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class BenchlytixAuthError extends BenchlytixError {
  constructor(args: Omit<ConstructorParameters<typeof BenchlytixError>[0], 'status'> & { status?: number }) {
    super({ ...args, status: args.status ?? 401 })
    this.name = 'BenchlytixAuthError'
    Object.setPrototypeOf(this, BenchlytixAuthError.prototype)
  }
}

export class BenchlytixNotFoundError extends BenchlytixError {
  constructor(args: Omit<ConstructorParameters<typeof BenchlytixError>[0], 'status'> & { status?: number }) {
    super({ ...args, status: args.status ?? 404 })
    this.name = 'BenchlytixNotFoundError'
    Object.setPrototypeOf(this, BenchlytixNotFoundError.prototype)
  }
}

export class BenchlytixRateLimitError extends BenchlytixError {
  /** Seconds until retry, parsed from `Retry-After` header. */
  readonly retryAfter?: number

  constructor(args: Omit<ConstructorParameters<typeof BenchlytixError>[0], 'status'> & {
    status?: number
    retryAfter?: number
  }) {
    super({ ...args, status: args.status ?? 429 })
    this.name = 'BenchlytixRateLimitError'
    this.retryAfter = args.retryAfter
    Object.setPrototypeOf(this, BenchlytixRateLimitError.prototype)
  }
}

export class BenchlytixServerError extends BenchlytixError {
  constructor(args: Omit<ConstructorParameters<typeof BenchlytixError>[0], 'status'> & { status?: number }) {
    super({ ...args, status: args.status ?? 500 })
    this.name = 'BenchlytixServerError'
    Object.setPrototypeOf(this, BenchlytixServerError.prototype)
  }
}

/**
 * Build the right subclass from an envelope payload + HTTP status.
 * Single entry point so status→class mapping lives in one place.
 */
export function errorFromResponse(
  status: number,
  body: unknown,
  retryAfter?: number
): BenchlytixError {
  const envelope =
    body && typeof body === 'object' && body !== null && 'error' in body
      ? (body as { error: { code: BenchlytixErrorCode; message: string; request_id: string; details?: unknown } })
      : null
  const code: BenchlytixErrorCode =
    envelope?.error?.code ??
    (status === 401
      ? 'unauthorized'
      : status === 403
      ? 'forbidden'
      : status === 404
      ? 'not_found'
      : status === 429
      ? 'rate_limited'
      : status === 503
      ? 'not_available'
      : 'internal_error')
  const message = envelope?.error?.message ?? `HTTP ${status}`
  const requestId = envelope?.error?.request_id ?? ''
  const details = envelope?.error?.details

  if (status === 401) return new BenchlytixAuthError({ code, message, requestId, details })
  if (status === 404) return new BenchlytixNotFoundError({ code, message, requestId, details })
  if (status === 429)
    return new BenchlytixRateLimitError({ code, message, requestId, details, retryAfter })
  if (status >= 500) return new BenchlytixServerError({ code, message, status, requestId, details })
  return new BenchlytixError({ code, message, status, requestId, details })
}
