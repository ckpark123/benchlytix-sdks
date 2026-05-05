/**
 * MCP tool handlers — 6 tools per `Specs/developer-experience.md` §3.
 *
 * Each handler is a pure function that takes a BenchLytix SDK client + args
 * and returns an MCP `CallToolResult`-compatible object. The `src/index.ts`
 * entry wires these into the `@modelcontextprotocol/sdk` stdio Server.
 *
 * Breaking the handlers out of index.ts keeps tests free of MCP SDK
 * transport plumbing — we exercise each handler as a plain async fn.
 *
 * S2a route coverage (wired):
 *   - get_leaderboard  → bl.leaderboard(...)
 *   - get_agent_score  → bl.agent(...)                   (score is nested)
 *   - verify_agent     → bl.agent(slug) OR bl.verifyStatus(id) by arg shape
 *
 * S2b route coverage (stubs that return `not_available` until S2b lands):
 *   - get_categories
 *   - compare_agents
 *   - get_methodology
 */

import type { BenchLytix } from '@benchlytixai/sdk'
import { BenchlytixError } from '@benchlytixai/sdk'

export interface ToolContent {
  type: 'text'
  text: string
}

export interface ToolResult {
  content: ToolContent[]
  isError?: boolean
}

function ok(payload: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  }
}

function fail(message: string, code = 'internal_error'): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: { code, message } }, null, 2) }],
  }
}

function wrapError(err: unknown): ToolResult {
  if (err instanceof BenchlytixError) {
    return fail(err.message, err.code)
  }
  return fail(err instanceof Error ? err.message : String(err))
}

// ---------------------------------------------------------------------------
// get_leaderboard — wraps bl.leaderboard(...)
// ---------------------------------------------------------------------------

export const GET_LEADERBOARD_SCHEMA = {
  name: 'get_leaderboard',
  description:
    'Return the ranked list of verified BenchLytix agents, optionally filtered by task category.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        description:
          'Optional task category slug (e.g. "legal-summarization"). Unknown categories return an empty list.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Max rows to return (default 25).',
      },
    },
    additionalProperties: false,
  },
}

export async function getLeaderboard(
  bl: BenchLytix,
  args: { category?: string; limit?: number }
): Promise<ToolResult> {
  try {
    const res = await bl.leaderboard({
      category: args.category,
      limit: args.limit,
    })
    return ok(res.data)
  } catch (err) {
    return wrapError(err)
  }
}

// ---------------------------------------------------------------------------
// get_agent_score — wraps bl.agent(slug), returns nested score breakdown
// ---------------------------------------------------------------------------

export const GET_AGENT_SCORE_SCHEMA = {
  name: 'get_agent_score',
  description:
    'Return the full score breakdown (overall + per-dimension) for a verified agent by slug.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: { type: 'string', description: 'Agent slug (e.g. "legal-bot").' },
    },
    required: ['slug'],
    additionalProperties: false,
  },
}

export async function getAgentScore(
  bl: BenchLytix,
  args: { slug: string }
): Promise<ToolResult> {
  if (!args.slug) return fail('slug is required', 'validation_error')
  try {
    const res = await bl.agent(args.slug)
    return ok({
      slug: res.data.slug,
      name: res.data.name,
      overall_score: res.data.latest_score?.overall_score ?? null,
      task_success_rate: res.data.latest_score?.task_success_rate ?? null,
      latency_percentile: res.data.latest_score?.latency_percentile ?? null,
      cost_efficiency_score: res.data.latest_score?.cost_efficiency_score ?? null,
      reliability_score: res.data.latest_score?.reliability_score ?? null,
      week: res.data.latest_score?.week ?? null,
      badge_url: res.data.badge_url,
      verified_at: res.data.verified_at,
    })
  } catch (err) {
    return wrapError(err)
  }
}

// ---------------------------------------------------------------------------
// verify_agent — by agent UUID OR slug
// ---------------------------------------------------------------------------

export const VERIFY_AGENT_SCHEMA = {
  name: 'verify_agent',
  description:
    'Check whether an agent is BenchLytix-verified. Accepts either a BenchLytix slug or an agent UUID.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      slug: { type: 'string', description: 'BenchLytix agent slug.' },
      agent_id: {
        type: 'string',
        description: 'Agent UUID (use when you hold the UUID rather than the slug).',
      },
    },
    additionalProperties: false,
  },
}

export async function verifyAgent(
  bl: BenchLytix,
  args: { slug?: string; agent_id?: string }
): Promise<ToolResult> {
  if (!args.slug && !args.agent_id) {
    return fail('Provide either slug or agent_id', 'validation_error')
  }
  try {
    if (args.agent_id) {
      const res = await bl.verifyStatus(args.agent_id)
      return ok(res.data)
    }
    // slug path
    try {
      const res = await bl.agent(args.slug!)
      return ok({
        verified: true,
        score: res.data.latest_score?.overall_score ?? null,
        verified_at: res.data.verified_at,
        badge_url: res.data.badge_url,
        slug: res.data.slug,
      })
    } catch (err) {
      if (err instanceof BenchlytixError && err.code === 'not_found') {
        return ok({
          verified: false,
          score: null,
          verified_at: null,
          badge_url: null,
          slug: args.slug ?? null,
        })
      }
      throw err
    }
  } catch (err) {
    return wrapError(err)
  }
}

// ---------------------------------------------------------------------------
// get_categories — S2b stub
// ---------------------------------------------------------------------------

export const GET_CATEGORIES_SCHEMA = {
  name: 'get_categories',
  description:
    'List all BenchLytix task categories. (Arrives with Session 2b — /api/v1/categories.)',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
}

export async function getCategories(
  _bl: BenchLytix,
  _args: Record<string, never>
): Promise<ToolResult> {
  return fail(
    'get_categories is coming in Session 2b. Until then, see https://benchlytix.com/methodology for the current category list.',
    'not_available'
  )
}

// ---------------------------------------------------------------------------
// compare_agents — S2b stub
// ---------------------------------------------------------------------------

export const COMPARE_AGENTS_SCHEMA = {
  name: 'compare_agents',
  description:
    'Compare 2–5 agents side by side. (Arrives with Session 2b — /api/v1/compare.)',
  inputSchema: {
    type: 'object' as const,
    properties: {
      slugs: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 5,
      },
    },
    required: ['slugs'],
    additionalProperties: false,
  },
}

export async function compareAgents(
  bl: BenchLytix,
  args: { slugs: string[] }
): Promise<ToolResult> {
  if (!Array.isArray(args.slugs) || args.slugs.length < 2 || args.slugs.length > 5) {
    return fail('slugs must be an array of 2–5 agent slugs', 'validation_error')
  }
  // Until S2b ships /api/v1/compare, we stitch client-side.
  try {
    const results = await Promise.all(
      args.slugs.map(async (slug) => {
        try {
          const { data } = await bl.agent(slug)
          return {
            slug: data.slug,
            name: data.name,
            overall_score: data.latest_score?.overall_score ?? null,
            verified_at: data.verified_at,
          }
        } catch (err) {
          if (err instanceof BenchlytixError && err.code === 'not_found') {
            return { slug, name: null, overall_score: null, verified_at: null }
          }
          throw err
        }
      })
    )
    return ok({ agents: results })
  } catch (err) {
    return wrapError(err)
  }
}

// ---------------------------------------------------------------------------
// get_methodology — S2b stub
// ---------------------------------------------------------------------------

export const GET_METHODOLOGY_SCHEMA = {
  name: 'get_methodology',
  description:
    'Return the BenchLytix scoring methodology document. (Arrives with Session 2b — /api/v1/methodology.)',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    additionalProperties: false,
  },
}

export async function getMethodology(
  _bl: BenchLytix,
  _args: Record<string, never>
): Promise<ToolResult> {
  return fail(
    'get_methodology is coming in Session 2b. Read the current methodology at https://benchlytix.com/methodology.',
    'not_available'
  )
}

// ---------------------------------------------------------------------------
// Registry — used by index.ts to wire MCP transport.
// ---------------------------------------------------------------------------

export const TOOL_SCHEMAS = [
  GET_LEADERBOARD_SCHEMA,
  GET_AGENT_SCORE_SCHEMA,
  VERIFY_AGENT_SCHEMA,
  GET_CATEGORIES_SCHEMA,
  COMPARE_AGENTS_SCHEMA,
  GET_METHODOLOGY_SCHEMA,
] as const

export type ToolName = (typeof TOOL_SCHEMAS)[number]['name']

export function dispatch(
  name: string,
  bl: BenchLytix,
  args: Record<string, unknown>
): Promise<ToolResult> {
  switch (name) {
    case 'get_leaderboard':
      return getLeaderboard(bl, args as { category?: string; limit?: number })
    case 'get_agent_score':
      return getAgentScore(bl, args as { slug: string })
    case 'verify_agent':
      return verifyAgent(bl, args as { slug?: string; agent_id?: string })
    case 'get_categories':
      return getCategories(bl, {} as Record<string, never>)
    case 'compare_agents':
      return compareAgents(bl, args as { slugs: string[] })
    case 'get_methodology':
      return getMethodology(bl, {} as Record<string, never>)
    default:
      return Promise.resolve(fail(`Unknown tool: ${name}`, 'not_found'))
  }
}
