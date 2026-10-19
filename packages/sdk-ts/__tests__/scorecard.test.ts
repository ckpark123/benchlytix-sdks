/**
 * @benchlytixai/sdk 0.2.0 — `scorecard()` → GET /v1/scorecards/{suite} (PR-S2).
 * Path mapping, default suite, version header, envelope pass-through.
 */

import { describe, expect, it, vi } from 'vitest'

import { BenchLytix } from '../src'
import type { ScorecardResult, SuccessEnvelope } from '../src/types'

const ENVELOPE: SuccessEnvelope<ScorecardResult> = {
  data: {
    suite: 'workflow-automation',
    suite_version: 'v1',
    status: 'published',
    sides: {
      n8n: {
        run_id: '11111111-1111-4111-8111-111111111111',
        run_url: 'https://benchlytix.com/runs/11111111-1111-4111-8111-111111111111',
        label: 'n8n self-hosted (n8nio/n8n:1.80.0)',
        target_version: 'n8nio/n8n:1.80.0',
        verdict: 'partial',
        verdict_words: 'Partly',
        finished_at: '2026-10-12T10:00:00Z',
        counts: { pass: 1, fail: 0, not_observed: 0, total: 1 },
        recipes: [
          {
            id: 'wa-01',
            trigger_app: 'sheets',
            trigger_event: 'New or Updated Row',
            action_app: 'slack',
            action_event: 'Send Channel Message',
            outcome: 'pass',
            reps: [{ rep: 1, outcome: 'pass', latency_ms: 1200 }],
            source_url: 'https://github.com/ckpark123/BenchLytix/blob/main/benchmarks/workflow-automation/v1/n8n/wa-01.json',
          },
        ],
      },
      zapier: null,
    },
    disclosures: ['No vendor pays BenchLytix for a test, a result or a position.'],
    methodology_url: 'https://benchlytix.com/docs/scoring-methodology#workflow-scorecard',
    overview_url: 'https://benchlytix.com/benchmarks/replace/workflow-automation',
  },
  meta: { request_id: 'r', rate_limit: { limit: 100, remaining: 99, reset: 1 } },
}

function client(fetchImpl: typeof fetch): BenchLytix {
  return new BenchLytix({ apiKey: 'blx_live_x', baseUrl: 'https://api.benchlytix.com/v1', fetch: fetchImpl })
}

describe('scorecard()', () => {
  it('defaults to workflow-automation and returns the envelope', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(ENVELOPE), { status: 200 }))
    const res = await client(f).scorecard()
    expect(res.data.status).toBe('published')
    expect(res.data.sides.n8n?.verdict_words).toBe('Partly')
    expect(res.data.sides.zapier).toBeNull()
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).pathname).toBe('/v1/scorecards/workflow-automation')
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('@benchlytixai/sdk-ts/0.2.0')
  })

  it('accepts the suite explicitly; API errors surface as BenchlytixError', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'not_available', message: 'The scorecard API is not available yet', request_id: 'x' } }), { status: 503 })
    )
    await expect(client(f).scorecard('workflow-automation')).rejects.toMatchObject({ code: 'not_available', status: 503 })
    expect(new URL(String(f.mock.calls[0]?.[0])).pathname).toBe('/v1/scorecards/workflow-automation')
  })
})
