/**
 * BenchLytix TypeScript SDK client.
 *
 * Thin wrapper over the Machine API v1 (S2a). Zero runtime deps —
 * relies on global `fetch` (Node ≥18, all modern browsers/runtimes).
 *
 * Surface (3 methods matching the 3 live v1 routes from S2a):
 *   - leaderboard({ category?, limit? })          → GET /v1/agents
 *   - agent(slug)                                  → GET /v1/agents/[slug]
 *   - verifyStatus(agentId)                        → GET /v1/verified-status
 *
 * More methods (score, compare, categories, methodology) arrive in S2b
 * when those routes land. This SDK will add them without a major bump.
 */

import {
  BenchlytixError,
  errorFromResponse,
} from './errors'
import type {
  AgentProfile,
  LeaderboardParams,
  RankedAgentRow,
  SuccessEnvelope,
  VerifiedStatus,
} from './types'

export interface BenchLytixOptions {
  /**
   * API key (format `blx_live_<...>` or `blx_test_<...>`). Required.
   * If omitted, falls back to `process.env.BENCHLYTIX_API_KEY` in Node envs.
   */
  apiKey?: string
  /**
   * Override base URL. Default `https://api.benchlytix.com/v1`.
   * Useful for staging / self-hosted proxies. Set via `BENCHLYTIX_BASE_URL` env.
   */
  baseUrl?: string
  /** Request timeout in ms. Default 30000. */
  timeoutMs?: number
  /**
   * Override the global fetch. Exposed for testing and for runtimes with a
   * non-standard fetch (e.g. edge workers with custom transports).
   */
  fetch?: typeof fetch
}

const DEFAULT_BASE_URL = 'https://api.benchlytix.com/v1'

export class BenchLytix {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: BenchLytixOptions = {}) {
    const apiKey =
      options.apiKey ??
      (typeof process !== 'undefined' ? process.env?.BENCHLYTIX_API_KEY : undefined)
    if (!apiKey) {
      throw new Error(
        '[benchlytix] apiKey is required. Pass { apiKey } or set BENCHLYTIX_API_KEY.'
      )
    }
    this.apiKey = apiKey
    this.baseUrl = (
      options.baseUrl ??
      (typeof process !== 'undefined' ? process.env?.BENCHLYTIX_BASE_URL : undefined) ??
      DEFAULT_BASE_URL
    ).replace(/\/$/, '')
    this.timeoutMs = options.timeoutMs ?? 30_000
    const fetchCandidate = options.fetch ?? (globalThis.fetch as typeof fetch | undefined)
    if (!fetchCandidate) {
      throw new Error(
        '[benchlytix] No global fetch found. Node 18+ required, or pass { fetch }.'
      )
    }
    this.fetchImpl = fetchCandidate
  }

  /** GET /v1/agents — ranked list of verified agents. */
  async leaderboard(params: LeaderboardParams = {}): Promise<SuccessEnvelope<RankedAgentRow[]>> {
    const search = new URLSearchParams()
    if (params.category !== undefined) search.set('category', params.category)
    if (params.limit !== undefined) search.set('limit', String(params.limit))
    const qs = search.toString()
    return this.request<RankedAgentRow[]>(`/agents${qs ? `?${qs}` : ''}`)
  }

  /** GET /v1/agents/[slug] — full profile + latest score. */
  async agent(slug: string): Promise<SuccessEnvelope<AgentProfile>> {
    if (!slug || typeof slug !== 'string') {
      throw new Error('[benchlytix] agent(slug): slug must be a non-empty string')
    }
    return this.request<AgentProfile>(`/agents/${encodeURIComponent(slug)}`)
  }

  /**
   * Lookup an agent's verified-status by its UUID. Unknown id → 200
   * with `verified: false` and all nulls (NOT 404), so callers can
   * branch on a single field without try/catch.
   *
   * @param agentId  The agent's UUID (NOT the slug). For slug-based
   *                 lookup use `agent(slug)` and read `verified_at`.
   */
  async verifyStatus(agentId: string): Promise<SuccessEnvelope<VerifiedStatus>> {
    if (!agentId || typeof agentId !== 'string') {
      throw new Error(
        '[benchlytix] verifyStatus(agentId): id must be a non-empty string'
      )
    }
    // The wire query-param name is fixed by the upstream API contract;
    // SDK consumers see only `agentId` (above). Server-side rename of
    // the param to `agent_id` is tracked separately and will not change
    // this method's TypeScript signature.
    const qs = new URLSearchParams({ agent_metrxbot_id: agentId }).toString()
    return this.request<VerifiedStatus>(`/verified-status?${qs}`)
  }

  private async request<T>(path: string): Promise<SuccessEnvelope<T>> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          'User-Agent': '@benchlytixai/sdk-ts/0.1.0',
        },
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof BenchlytixError) throw err
      // Network / abort error — wrap as server error.
      throw new BenchlytixError({
        code: 'internal_error',
        message: err instanceof Error ? err.message : 'Network error',
        status: 0,
        requestId: '',
      })
    }
    clearTimeout(timeout)

    let parsed: unknown
    const text = await response.text()
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text)
      } catch {
        // Non-JSON body — treat as server error.
        throw new BenchlytixError({
          code: 'internal_error',
          message: `Non-JSON response (HTTP ${response.status})`,
          status: response.status,
          requestId: response.headers.get('x-request-id') ?? '',
        })
      }
    }

    if (!response.ok) {
      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfter =
        retryAfterHeader && !Number.isNaN(Number(retryAfterHeader))
          ? Number(retryAfterHeader)
          : undefined
      throw errorFromResponse(response.status, parsed, retryAfter)
    }

    return parsed as SuccessEnvelope<T>
  }
}
