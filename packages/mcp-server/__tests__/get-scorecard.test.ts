/**
 * get_scorecard (MCP, 0.2.0, PR-S2): GET /v1/scorecards/{suite} through the
 * real SDK against a stub fetch. Default suite, enum-closed schema, data +
 * meta pass-through, unknown suite refused before any request, API errors
 * folded into MCP error results.
 */

import { describe, expect, it, vi } from 'vitest'

import { BenchLytix } from '@benchlytixai/sdk'
import { dispatch, GET_SCORECARD_SCHEMA, getScorecard } from '../src/tools'

const META = { request_id: '11111111-1111-4111-8111-111111111111', rate_limit: { limit: 100, remaining: 99, reset: 1 } }
const DATA = {
  suite: 'workflow-automation',
  suite_version: 'v1',
  status: 'published',
  sides: {
    n8n: {
      run_id: 'r1',
      run_url: 'https://benchlytix.com/runs/r1',
      label: 'n8n self-hosted (n8nio/n8n:1.80.0)',
      target_version: 'n8nio/n8n:1.80.0',
      verdict: 'partial',
      verdict_words: 'Partly',
      finished_at: '2026-10-12T10:00:00Z',
      counts: { pass: 1, fail: 0, not_observed: 0, total: 1 },
      recipes: [],
    },
    zapier: null,
  },
  disclosures: ['No vendor pays BenchLytix for a test, a result or a position.'],
  methodology_url: 'https://benchlytix.com/docs/scoring-methodology#workflow-scorecard',
  overview_url: 'https://benchlytix.com/benchmarks/replace/workflow-automation',
}

const bl = (f: typeof fetch) => new BenchLytix({ apiKey: 'blx_live_x', baseUrl: 'https://api.benchlytix.com/v1', fetch: f })

describe('get_scorecard', () => {
  it('schema: suite enum with a default, closed object', () => {
    expect(GET_SCORECARD_SCHEMA.inputSchema.properties.suite.enum).toEqual(['workflow-automation'])
    expect(GET_SCORECARD_SCHEMA.inputSchema.properties.suite.default).toBe('workflow-automation')
    expect(GET_SCORECARD_SCHEMA.inputSchema.additionalProperties).toBe(false)
  })

  it('defaults the suite and returns the scorecard with meta', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: DATA, meta: META }), { status: 200 }))
    const res = await dispatch('get_scorecard', bl(f), {})
    expect(res.isError).toBeFalsy()
    const out = JSON.parse(res.content[0]?.text ?? '{}') as typeof DATA & { meta: typeof META }
    expect(out.meta).toEqual(META)
    expect(out.sides.n8n?.verdict_words).toBe('Partly')
    expect(out.disclosures.length).toBe(1)
    expect(new URL(String(f.mock.calls[0]?.[0])).pathname).toBe('/v1/scorecards/workflow-automation')
  })

  it('unknown suite → validation error, no request; API errors become MCP error results', async () => {
    const none = vi.fn<typeof fetch>()
    const bad = await getScorecard(bl(none), { suite: 'crm' })
    expect(bad.isError).toBe(true)
    expect(none).not.toHaveBeenCalled()
    const f = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'not_available', message: 'The scorecard API is not available yet', request_id: 'x' } }), { status: 503 })
    )
    const res = await getScorecard(bl(f), { suite: 'workflow-automation' })
    expect(res.isError).toBe(true)
    expect(res.content[0]?.text).toMatch(/not_available/)
  })
})
