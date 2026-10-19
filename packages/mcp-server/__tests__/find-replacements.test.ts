/**
 * find_replacements (MCP, 0.2.0, PR-S3): investigation §5 contract through
 * the real SDK against a stub fetch. evidence_label on every row; verdict /
 * scorecard only on tested rows; disclosure + meta passed through; input
 * validation; API errors folded into MCP error results.
 */

import { describe, expect, it, vi } from 'vitest'

import { BenchLytix } from '@benchlytixai/sdk'
import { dispatch, FIND_REPLACEMENTS_SCHEMA, findReplacements } from '../src/tools'

const META = { request_id: '11111111-1111-4111-8111-111111111111', rate_limit: { limit: 100, remaining: 99, reset: 1 } }
const DATA = {
  query_echo: { goal: 'automation', goal_title: 'Automate work between apps', paid_tool: null, goals_considered: ['automation'], setup: {}, not_yet_reviewed: 1, taxonomy_version: 'v1', notes: [] },
  candidates: [
    { slug: 'huginn', name: 'Huginn', source_code_url: 'https://github.com/huginn/huginn', detail_url: 'https://benchlytix.com/replace/tool/huginn', evidence_label: 'tested', run_id: 'r1', verdict: 'partial', scorecard_url: 'https://benchlytix.com/runs/r1', facts: { licence_spdx: ['MIT'], licence_class: 'osi', stars: 1, last_commit_at: null, archived: false, fetched_at: 'x' }, claims: [] },
    { slug: 'n8n', name: 'n8n', source_code_url: 'https://github.com/n8n-io/n8n', detail_url: 'https://benchlytix.com/replace/tool/n8n', evidence_label: 'listed_untested', facts: { licence_spdx: ['Apache-2.0', 'Commons-Clause'], licence_class: 'fair_code', stars: 1, last_commit_at: null, archived: false, fetched_at: 'x' }, claims: [] },
  ],
  disclosure: { no_vendor_payment: true, attribution: 'Data includes awesome-selfhosted (awesome-selfhosted-data, CC-BY-SA 3.0)', methodology_url: 'https://benchlytix.com/docs/scoring-methodology#replacement-finder' },
}

const bl = (f: typeof fetch) => new BenchLytix({ apiKey: 'blx_live_x', baseUrl: 'https://api.benchlytix.com/v1', fetch: f })

describe('find_replacements', () => {
  it('schema: paid_tool | goal + setup, closed objects', () => {
    expect(FIND_REPLACEMENTS_SCHEMA.inputSchema.properties).toHaveProperty('paid_tool')
    expect(FIND_REPLACEMENTS_SCHEMA.inputSchema.properties).toHaveProperty('goal')
    expect(FIND_REPLACEMENTS_SCHEMA.inputSchema.properties.setup.properties.hosting.enum).toEqual(['none', 'docker', 'k8s'])
    expect(FIND_REPLACEMENTS_SCHEMA.inputSchema.additionalProperties).toBe(false)
  })

  it('returns the contract with meta; labels on every row; verdict only on tested', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: DATA, meta: META }), { status: 200 }))
    const res = await dispatch('find_replacements', bl(f), { goal: 'automation', setup: { must_keep_integrations: ['Slack'] } })
    expect(res.isError).toBeFalsy()
    const out = JSON.parse(res.content[0]?.text ?? '{}') as typeof DATA & { meta: typeof META }
    expect(out.meta).toEqual(META)
    expect(out.disclosure.no_vendor_payment).toBe(true)
    for (const c of out.candidates) {
      expect(c.evidence_label).toBeTruthy()
      expect('verdict' in c).toBe(c.evidence_label === 'tested')
      expect('scorecard_url' in c).toBe(c.evidence_label === 'tested')
    }
    expect(new URL(String(f.mock.calls[0]?.[0])).searchParams.get('must_keep_integrations')).toBe('Slack')
  })

  it('validation and API errors become MCP error results', async () => {
    const none = await findReplacements(bl(vi.fn<typeof fetch>()), {})
    expect(none.isError).toBe(true)
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'not_available', message: 'API v1 is not yet enabled', request_id: 'x' } }), { status: 503 }))
    const res = await findReplacements(bl(f), { paid_tool: 'Zapier' })
    expect(res.isError).toBe(true)
    expect(res.content[0]?.text).toMatch(/not_available/)
  })
})
