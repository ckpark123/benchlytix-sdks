/**
 * @benchlytixai/sdk — client tests.
 *
 * Strategy: inject a fake `fetch` into the constructor, assert request
 * shape (URL, headers) and response parsing for all 3 methods + the
 * 4 error classes (401 / 404 / 429 / 5xx).
 *
 * No live HTTP. No S2 fixtures pulled over network. The response bodies
 * in this file are the canonical contract — they match S2a's envelope
 * verbatim. If S2a drifts, this file fails fast.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  BenchLytix,
  BenchlytixAuthError,
  BenchlytixError,
  BenchlytixNotFoundError,
  BenchlytixRateLimitError,
  BenchlytixServerError,
} from '../src'
import type {
  AgentProfile,
  RankedAgentRow,
  SuccessEnvelope,
  VerifiedStatus,
} from '../src/types'

function makeResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

const META = {
  request_id: '11111111-1111-4111-8111-111111111111',
  rate_limit: { limit: 100, remaining: 99, reset: 1700000000 },
}

describe('BenchLytix constructor', () => {
  it('throws when no apiKey is provided and env is empty', () => {
    const originalKey = process.env.BENCHLYTIX_API_KEY
    delete process.env.BENCHLYTIX_API_KEY
    try {
      expect(() => new BenchLytix({})).toThrow(/apiKey is required/)
    } finally {
      if (originalKey !== undefined) process.env.BENCHLYTIX_API_KEY = originalKey
    }
  })

  it('accepts an explicit apiKey', () => {
    const client = new BenchLytix({ apiKey: 'blx_live_abc', fetch: vi.fn() })
    expect(client).toBeInstanceOf(BenchLytix)
  })

  it('defaults to the www API host (api.benchlytix.com has no DNS record)', async () => {
    const prev = process.env.BENCHLYTIX_BASE_URL
    delete process.env.BENCHLYTIX_BASE_URL
    try {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(makeResponse({ data: [], meta: META }))
      const client = new BenchLytix({ apiKey: 'blx_live_abc', fetch: fetchMock })
      await client.leaderboard()
      expect(fetchMock.mock.calls[0]![0]).toBe('https://www.benchlytix.com/api/v1/agents')
    } finally {
      if (prev !== undefined) process.env.BENCHLYTIX_BASE_URL = prev
    }
  })

  it('strips trailing slash from baseUrl', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse({ data: [], meta: META }))
    const client = new BenchLytix({
      apiKey: 'blx_live_abc',
      baseUrl: 'https://staging.benchlytix.com/api/v1/',
      fetch: fetchMock,
    })
    await client.leaderboard({})
    const calledUrl = fetchMock.mock.calls[0]![0] as string
    expect(calledUrl).toBe('https://staging.benchlytix.com/api/v1/agents')
  })
})

describe('BenchLytix.leaderboard', () => {
  it('calls GET /agents with bearer header and parses envelope', async () => {
    const sampleRow: RankedAgentRow = {
      id: 'a1',
      slug: 'legal-bot',
      name: 'Legal Bot',
      task_category: 'legal-summarization',
      overall_score: 87.4,
      verified_at: '2026-04-01T00:00:00.000Z',
    }
    const envelope: SuccessEnvelope<RankedAgentRow[]> = {
      data: [sampleRow],
      meta: META,
    }
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(makeResponse(envelope))
    const client = new BenchLytix({
      apiKey: 'blx_live_abc',
      baseUrl: 'https://api.benchlytix.com/v1',
      fetch: fetchMock,
    })
    const result = await client.leaderboard({ category: 'legal-summarization', limit: 5 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(
      'https://api.benchlytix.com/v1/agents?category=legal-summarization&limit=5'
    )
    expect((init as RequestInit).method).toBe('GET')
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe(
      'Bearer blx_live_abc'
    )
    expect(result.data).toEqual([sampleRow])
    expect(result.meta.request_id).toBe(META.request_id)
    expect(result.meta.rate_limit.limit).toBe(100)
  })

  it('omits query string when no params given', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse({ data: [], meta: META }))
    const client = new BenchLytix({
      apiKey: 'blx_live_abc',
      baseUrl: 'https://api.benchlytix.com/v1',
      fetch: fetchMock,
    })
    await client.leaderboard()
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.benchlytix.com/v1/agents')
  })
})

describe('BenchLytix.agent', () => {
  it('calls GET /agents/[slug] and returns AgentProfile', async () => {
    const profile: AgentProfile = {
      id: 'a1',
      slug: 'legal-bot',
      name: 'Legal Bot',
      description: 'A helpful legal assistant.',
      task_category: 'legal-summarization',
      homepage_url: 'https://example.com',
      verified_at: '2026-04-01T00:00:00.000Z',
      latest_score: {
        week: '2026-W15',
        overall_score: 87.4,
        task_success_rate: 0.92,
        latency_percentile: 88,
        cost_efficiency_score: 75,
        reliability_score: 91,
      },
      badge_url: 'https://benchlytix.com/api/v1/badge/legal-bot.svg',
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse({ data: profile, meta: META }))
    const client = new BenchLytix({
      apiKey: 'blx_live_abc',
      baseUrl: 'https://api.benchlytix.com/v1',
      fetch: fetchMock,
    })
    const result = await client.agent('legal-bot')
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.benchlytix.com/v1/agents/legal-bot'
    )
    expect(result.data.slug).toBe('legal-bot')
    expect(result.data.latest_score?.overall_score).toBe(87.4)
  })

  it('url-encodes slug', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        makeResponse({
          data: { id: 'x', slug: 'x', name: 'x', description: null, task_category: 'x', homepage_url: null, verified_at: null, latest_score: null, badge_url: '' },
          meta: META,
        })
      )
    const client = new BenchLytix({ apiKey: 'k', fetch: fetchMock })
    await client.agent('weird slug')
    expect(fetchMock.mock.calls[0]![0]).toContain('weird%20slug')
  })

  it('rejects empty slug', async () => {
    const client = new BenchLytix({ apiKey: 'k', fetch: vi.fn() })
    await expect(client.agent('')).rejects.toThrow(/non-empty string/)
  })
})

describe('BenchLytix.verifyStatus', () => {
  it('calls GET /verified-status?agent_metrxbot_id=...', async () => {
    const payload: VerifiedStatus = {
      verified: true,
      score: 87.4,
      verified_at: '2026-04-01T00:00:00.000Z',
      badge_url: 'https://benchlytix.com/api/v1/badge/legal-bot.svg',
      slug: 'legal-bot',
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse({ data: payload, meta: META }))
    const client = new BenchLytix({
      apiKey: 'blx_live_abc',
      baseUrl: 'https://api.benchlytix.com/v1',
      fetch: fetchMock,
    })
    const result = await client.verifyStatus('00000000-0000-4000-8000-000000000000')
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.benchlytix.com/v1/verified-status?agent_metrxbot_id=00000000-0000-4000-8000-000000000000'
    )
    expect(result.data.verified).toBe(true)
    expect(result.data.slug).toBe('legal-bot')
  })

  it('returns verified=false shape when unknown id (server 200, not 404)', async () => {
    const payload: VerifiedStatus = {
      verified: false,
      score: null,
      verified_at: null,
      badge_url: null,
      slug: null,
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse({ data: payload, meta: META }))
    const client = new BenchLytix({ apiKey: 'k', fetch: fetchMock })
    const result = await client.verifyStatus('00000000-0000-4000-8000-000000000000')
    expect(result.data.verified).toBe(false)
    expect(result.data.score).toBeNull()
  })
})

describe('error classes', () => {
  function errorBody(code: string, message: string) {
    return {
      error: {
        code,
        message,
        request_id: '99999999-9999-4999-8999-999999999999',
      },
    }
  }

  it('401 → BenchlytixAuthError', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        makeResponse(errorBody('unauthorized', 'Invalid API key'), { status: 401 })
      )
    const client = new BenchLytix({ apiKey: 'k', fetch: fetchMock })
    try {
      await client.leaderboard()
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(BenchlytixAuthError)
      const e = err as BenchlytixAuthError
      expect(e.code).toBe('unauthorized')
      expect(e.status).toBe(401)
      expect(e.requestId).toBe('99999999-9999-4999-8999-999999999999')
    }
  })

  it('404 → BenchlytixNotFoundError', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse(errorBody('not_found', 'Agent not found'), { status: 404 }))
    const client = new BenchLytix({ apiKey: 'k', fetch: fetchMock })
    await expect(client.agent('missing')).rejects.toBeInstanceOf(BenchlytixNotFoundError)
  })

  it('429 → BenchlytixRateLimitError with retryAfter', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        makeResponse(errorBody('rate_limited', 'Too many requests'), {
          status: 429,
          headers: { 'retry-after': '60' },
        })
      )
    const client = new BenchLytix({ apiKey: 'k', fetch: fetchMock })
    try {
      await client.leaderboard()
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(BenchlytixRateLimitError)
      const e = err as BenchlytixRateLimitError
      expect(e.retryAfter).toBe(60)
      expect(e.code).toBe('rate_limited')
      expect(e.status).toBe(429)
    }
  })

  it('500 → BenchlytixServerError', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse(errorBody('internal_error', 'Oops'), { status: 500 }))
    const client = new BenchLytix({ apiKey: 'k', fetch: fetchMock })
    await expect(client.leaderboard()).rejects.toBeInstanceOf(BenchlytixServerError)
  })

  it('503 → BenchlytixServerError with code not_available', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse(errorBody('not_available', 'API disabled'), { status: 503 }))
    const client = new BenchLytix({ apiKey: 'k', fetch: fetchMock })
    try {
      await client.leaderboard()
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(BenchlytixServerError)
      expect((err as BenchlytixError).code).toBe('not_available')
    }
  })

  it('falls back gracefully when body is not JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html>oops</html>', {
        status: 502,
        headers: { 'x-request-id': 'abc' },
      })
    )
    const client = new BenchLytix({ apiKey: 'k', fetch: fetchMock })
    try {
      await client.leaderboard()
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(BenchlytixError)
      expect((err as BenchlytixError).status).toBe(502)
    }
  })
})
