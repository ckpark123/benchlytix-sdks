/**
 * @benchlytixai/sdk 0.2.0 — `replacements()` → GET /v1/replacements (PR-S3).
 * Query-string mapping, version header, envelope pass-through, input guard.
 */

import { describe, expect, it, vi } from 'vitest'

import { BenchLytix } from '../src'
import type { ReplacementsResult, SuccessEnvelope } from '../src/types'

const ENVELOPE: SuccessEnvelope<ReplacementsResult> = {
  data: {
    query_echo: {
      goal: null,
      goal_title: null,
      paid_tool: { input: 'Zapier', slug: 'zapier', name: 'Zapier' },
      goals_considered: ['automation'],
      setup: {},
      not_yet_reviewed: 0,
      taxonomy_version: 'v1',
      notes: [],
    },
    candidates: [
      {
        slug: 'n8n',
        name: 'n8n',
        source_code_url: 'https://github.com/n8n-io/n8n',
        detail_url: 'https://benchlytix.com/replace/tool/n8n',
        evidence_label: 'coverage_checked',
        facts: { licence_spdx: ['Apache-2.0', 'Commons-Clause'], licence_class: 'fair_code', stars: 1, last_commit_at: null, archived: false, fetched_at: '2026-10-11T07:00:00Z' },
        claims: [],
      },
    ],
    disclosure: { no_vendor_payment: true, attribution: 'awesome-selfhosted CC-BY-SA', methodology_url: 'https://benchlytix.com/docs/scoring-methodology#replacement-finder' },
  },
  meta: { request_id: 'r', rate_limit: { limit: 100, remaining: 99, reset: 1 } },
}

function client(fetchImpl: typeof fetch): BenchLytix {
  return new BenchLytix({ apiKey: 'blx_live_x', baseUrl: 'https://api.benchlytix.com/v1', fetch: fetchImpl })
}

describe('replacements()', () => {
  it('maps params to the query string and returns the envelope', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(ENVELOPE), { status: 200 }))
    const res = await client(f).replacements({
      paidTool: 'Zapier',
      setup: { hosting: 'docker', osiOnly: false, mustKeepIntegrations: ['Slack', 'Google Sheets'] },
    })
    expect(res.data.candidates[0]?.evidence_label).toBe('coverage_checked')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    const u = new URL(url)
    expect(u.pathname).toBe('/v1/replacements')
    expect(u.searchParams.get('paid_tool')).toBe('Zapier')
    // team_size removed 2026-10-13 (it never filtered)
    expect(u.searchParams.has('team_size')).toBe(false)
    expect(u.searchParams.get('hosting')).toBe('docker')
    expect(u.searchParams.get('osi_only')).toBe('false')
    // one parameter per app, so an app name may contain a comma
    expect(u.searchParams.getAll('must_keep_integrations')).toEqual(['Slack', 'Google Sheets'])
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('@benchlytixai/sdk-ts/0.2.0')
  })

  it('requires goal or paidTool before any request', async () => {
    const f = vi.fn<typeof fetch>()
    await expect(client(f).replacements({})).rejects.toThrow(/goal or paidTool/)
    expect(f).not.toHaveBeenCalled()
  })
})
