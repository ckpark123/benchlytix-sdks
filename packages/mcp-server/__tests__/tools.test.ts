/**
 * benchlytix-mcp-server — tool handler tests.
 *
 * Each tool is exercised as a pure function. The BenchLytix SDK is
 * constructed against a stub `fetch` so we're validating the FULL
 * round-trip (MCP args → SDK call → envelope parse → MCP result).
 *
 * No MCP transport is instantiated here — transport wiring lives in
 * index.ts and is covered only by a manual smoke test (plan §10).
 */

import { describe, expect, it, vi } from 'vitest'

// IMPORTANT: import via the package boundary, not the raw `../../sdk-ts/src`
// path. Importing through src creates a SECOND copy of BenchlytixError
// distinct from the one resolved by `src/tools.ts` (which imports from
// '@benchlytixai/sdk'). `instanceof` checks would silently fail and
// folded-error tests (404 → verified:false, etc.) would regress.
import { BenchLytix } from '@benchlytixai/sdk'
import type {
  RankedAgentRow,
  AgentProfile,
  VerifiedStatus,
} from '@benchlytixai/sdk'
import {
  TOOL_SCHEMAS,
  compareAgents,
  dispatch,
  getAgentScore,
  getCategories,
  getLeaderboard,
  getMethodology,
  verifyAgent,
} from '../src/tools'

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const META = {
  request_id: '11111111-1111-4111-8111-111111111111',
  rate_limit: { limit: 100, remaining: 99, reset: 1700000000 },
}

function makeClient(fetchImpl: typeof fetch): BenchLytix {
  return new BenchLytix({
    apiKey: 'blx_live_test',
    baseUrl: 'https://api.benchlytix.com/v1',
    fetch: fetchImpl,
  })
}

describe('TOOL_SCHEMAS', () => {
  it('exposes exactly 6 tools per developer-experience.md §3', () => {
    expect(TOOL_SCHEMAS).toHaveLength(6)
    const names = TOOL_SCHEMAS.map((t) => t.name)
    expect(names).toEqual([
      'get_leaderboard',
      'get_agent_score',
      'verify_agent',
      'get_categories',
      'compare_agents',
      'get_methodology',
    ])
  })

  it('every schema has name, description, inputSchema', () => {
    for (const schema of TOOL_SCHEMAS) {
      expect(schema.name).toBeTruthy()
      expect(schema.description).toBeTruthy()
      expect(schema.inputSchema.type).toBe('object')
    }
  })
})

describe('get_leaderboard', () => {
  it('returns rows wrapped in MCP content array', async () => {
    const row: RankedAgentRow = {
      id: 'a1',
      slug: 'legal-bot',
      name: 'Legal Bot',
      task_category: 'legal-summarization',
      overall_score: 87.4,
      verified_at: '2026-04-01T00:00:00.000Z',
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse({ data: [row], meta: META }))
    const bl = makeClient(fetchMock)
    const result = await getLeaderboard(bl, { category: 'legal-summarization', limit: 5 })
    expect(result.isError).toBeFalsy()
    expect(result.content).toHaveLength(1)
    const parsed = JSON.parse(result.content[0]!.text) as RankedAgentRow[]
    expect(parsed[0]!.slug).toBe('legal-bot')
  })

  it('surfaces SDK errors via isError:true', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        makeResponse(
          { error: { code: 'unauthorized', message: 'Invalid key', request_id: 'x' } },
          401
        )
      )
    const bl = makeClient(fetchMock)
    const result = await getLeaderboard(bl, {})
    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.content[0]!.text) as { error: { code: string } }
    expect(parsed.error.code).toBe('unauthorized')
  })
})

describe('get_agent_score', () => {
  it('flattens nested latest_score into a single object', async () => {
    const profile: AgentProfile = {
      id: 'a1',
      slug: 'legal-bot',
      name: 'Legal Bot',
      description: null,
      task_category: 'legal-summarization',
      homepage_url: null,
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
    const bl = makeClient(fetchMock)
    const result = await getAgentScore(bl, { slug: 'legal-bot' })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]!.text) as {
      overall_score: number
      reliability_score: number
    }
    expect(parsed.overall_score).toBe(87.4)
    expect(parsed.reliability_score).toBe(91)
  })

  it('validates slug arg', async () => {
    const bl = makeClient(vi.fn())
    const result = await getAgentScore(bl, { slug: '' })
    expect(result.isError).toBe(true)
  })
})

describe('verify_agent', () => {
  it('routes agent_id to verifyStatus', async () => {
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
    const bl = makeClient(fetchMock)
    const result = await verifyAgent(bl, {
      agent_id: '00000000-0000-4000-8000-000000000000',
    })
    expect(result.isError).toBeFalsy()
    const calledUrl = fetchMock.mock.calls[0]![0] as string
    expect(calledUrl).toContain('/verified-status?agent_metrxbot_id=')
    const parsed = JSON.parse(result.content[0]!.text) as VerifiedStatus
    expect(parsed.verified).toBe(true)
  })

  it('routes slug to /agents/[slug] and folds 404 into verified:false', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      makeResponse(
        { error: { code: 'not_found', message: 'Agent not found', request_id: 'x' } },
        404
      )
    )
    const bl = makeClient(fetchMock)
    const result = await verifyAgent(bl, { slug: 'missing' })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]!.text) as VerifiedStatus
    expect(parsed.verified).toBe(false)
    expect(parsed.slug).toBe('missing')
  })

  it('requires at least one of slug / agent_id', async () => {
    const bl = makeClient(vi.fn())
    const result = await verifyAgent(bl, {})
    expect(result.isError).toBe(true)
  })
})

describe('S2b-stub tools', () => {
  const bl = makeClient(vi.fn())

  it('get_categories returns not_available', async () => {
    const result = await getCategories(bl, {} as Record<string, never>)
    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.content[0]!.text) as { error: { code: string } }
    expect(parsed.error.code).toBe('not_available')
  })

  it('get_methodology returns not_available', async () => {
    const result = await getMethodology(bl, {} as Record<string, never>)
    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.content[0]!.text) as { error: { code: string } }
    expect(parsed.error.code).toBe('not_available')
  })

  it('compare_agents validates 2..5 slugs', async () => {
    const result = await compareAgents(bl, { slugs: ['only-one'] })
    expect(result.isError).toBe(true)
  })

  it('compare_agents stitches per-slug results client-side', async () => {
    let call = 0
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      call += 1
      if (call === 1) {
        const profile: AgentProfile = {
          id: 'a1',
          slug: 'agent-a',
          name: 'Agent A',
          description: null,
          task_category: 'x',
          homepage_url: null,
          verified_at: '2026-04-01T00:00:00.000Z',
          latest_score: {
            week: '2026-W15',
            overall_score: 85,
            task_success_rate: null,
            latency_percentile: null,
            cost_efficiency_score: null,
            reliability_score: null,
          },
          badge_url: 'https://benchlytix.com/api/v1/badge/agent-a.svg',
        }
        return makeResponse({ data: profile, meta: META })
      }
      return makeResponse(
        { error: { code: 'not_found', message: 'Agent not found', request_id: 'x' } },
        404
      )
    })
    const c = makeClient(fetchMock)
    const result = await compareAgents(c, { slugs: ['agent-a', 'agent-b'] })
    expect(result.isError).toBeFalsy()
    const parsed = JSON.parse(result.content[0]!.text) as {
      agents: Array<{ slug: string; overall_score: number | null }>
    }
    expect(parsed.agents).toHaveLength(2)
    expect(parsed.agents[0]!.overall_score).toBe(85)
    expect(parsed.agents[1]!.overall_score).toBeNull()
  })
})

describe('dispatch', () => {
  it('routes known tool names', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(makeResponse({ data: [], meta: META }))
    const bl = makeClient(fetchMock)
    const result = await dispatch('get_leaderboard', bl, {})
    expect(result.isError).toBeFalsy()
  })

  it('returns not_found for unknown tools', async () => {
    const bl = makeClient(vi.fn())
    const result = await dispatch('bogus_tool', bl, {})
    expect(result.isError).toBe(true)
    const parsed = JSON.parse(result.content[0]!.text) as { error: { code: string } }
    expect(parsed.error.code).toBe('not_found')
  })
})
