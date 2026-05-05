/**
 * SDK types — hand-written to match S2a's `lib/api/envelope.ts` + `lib/api/v1-service.ts`
 * and the three route handlers at `app/api/v1/*`.
 *
 * Drift guard: if S2a envelope or service shapes change, these types MUST update
 * in lock-step. SDK CI mocks assert these shapes; production staging smoke (future
 * work) validates against live responses.
 *
 * Source-of-truth references:
 *   - lib/api/envelope.ts       (SuccessEnvelope, ErrorEnvelope, ApiV1ErrorCode)
 *   - lib/api/v1-service.ts     (RankedAgentRow, ApiAgentProfile, VerifiedStatusPayload)
 *   - types/agents.ts           (TaskCategory — SDK mirrors a string-union, not an
 *                                enum import, to keep SDK zero-dep)
 */

/** Error code enum — matches `ApiV1ErrorCode` in `lib/api/envelope.ts`. */
export type BenchlytixErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'validation_error'
  | 'not_available'
  | 'internal_error'

/** Rate-limit meta — matches `RateLimitMeta` in envelope.ts. */
export interface RateLimitMeta {
  limit: number
  remaining: number
  /** Unix seconds at which the window resets. */
  reset: number
}

export interface SuccessMeta {
  request_id: string
  rate_limit: RateLimitMeta
}

export interface SuccessEnvelope<T> {
  data: T
  meta: SuccessMeta
}

export interface ErrorPayload {
  code: BenchlytixErrorCode
  message: string
  request_id: string
  details?: unknown
}

export interface ErrorEnvelope {
  error: ErrorPayload
}

/**
 * TaskCategory — stable string union mirrored from types/agents.ts.
 * Kept as a `string` supertype at the SDK boundary so new S2-side categories
 * don't break older SDK versions. Callers who want strict typing can cast.
 */
export type TaskCategory = string

/** `GET /v1/agents` row — mirrors RankedAgentRow. */
export interface RankedAgentRow {
  id: string
  slug: string
  name: string
  task_category: TaskCategory
  overall_score: number | null
  verified_at: string | null
}

/** `GET /v1/agents/[slug]` — mirrors ApiAgentProfile. */
export interface AgentProfile {
  id: string
  slug: string
  name: string
  description: string | null
  task_category: TaskCategory
  homepage_url: string | null
  verified_at: string | null
  latest_score: {
    week: string
    overall_score: number | null
    task_success_rate: number | null
    latency_percentile: number | null
    cost_efficiency_score: number | null
    reliability_score: number | null
  } | null
  badge_url: string
}

/** `GET /v1/verified-status` — mirrors VerifiedStatusPayload. */
export interface VerifiedStatus {
  verified: boolean
  score: number | null
  verified_at: string | null
  badge_url: string | null
  slug: string | null
}

export interface LeaderboardParams {
  category?: TaskCategory
  /** 1..100, default 25 server-side. */
  limit?: number
}
