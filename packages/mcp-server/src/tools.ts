/**
 * MCP tool handlers — the 6 tools of `Specs/developer-experience.md` §3 plus
 * `find_replacements` (PR-S3) and `get_scorecard` (PR-S2).
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
 * PR-S3 (0.2.0):
 *   - find_replacements → bl.replacements(...) (GET /v1/replacements)
 *
 * PR-S2 (0.2.0):
 *   - get_scorecard → bl.scorecard(suite) (GET /v1/scorecards/{suite})
 *
 * Stubs that return `not_available` (no v1 route behind them):
 *   - get_categories
 *   - get_methodology
 * compare_agents is not a stub: it reads bl.agent(slug) per slug.
 */

import type { BenchLytix } from '@benchlytixai/sdk'
import { BenchlytixError } from '@benchlytixai/sdk'

/**
 * 2026-09-27 honest-scores: every score the MCP server hands an agent
 * carries its evidence basis + the human label ("Estimated from
 * documentation") so a model consuming the tool output cannot present a
 * desk estimate as a measurement. Read defensively (the published SDK dist
 * may lag the source types); the API always returns both fields.
 */
const DOCUMENTATION_ONLY_LABEL = 'Estimated from documentation'
const EVIDENCE_LABELS: Record<string, string> = {
  documentation_only: DOCUMENTATION_ONLY_LABEL,
  probe_measured: 'Measured by probe',
  runtime_measured: 'Measured from runtime telemetry',
}
function evidenceFields(score: unknown): {
  evidence_basis: string | null
  evidence_label: string | null
} {
  const s = (score ?? {}) as { evidence_basis?: unknown; evidence_label?: unknown }
  const basis = typeof s.evidence_basis === 'string' ? s.evidence_basis : null
  const label =
    typeof s.evidence_label === 'string'
      ? s.evidence_label
      : basis
        ? (EVIDENCE_LABELS[basis] ?? null)
        : null
  return { evidence_basis: basis, evidence_label: label }
}

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
      ...evidenceFields(res.data.latest_score),
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
        ...evidenceFields(res.data.latest_score),
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
    'List all BenchLytix task categories. Not implemented in 0.2.x: returns not_available.',
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
    'get_categories is not implemented in this version. The task categories are listed at https://www.benchlytix.com/docs/scoring-methodology.',
    'not_available'
  )
}

// ---------------------------------------------------------------------------
// compare_agents: stitched client-side from bl.agent(slug) per slug
// ---------------------------------------------------------------------------

export const COMPARE_AGENTS_SCHEMA = {
  name: 'compare_agents',
  description:
    'Compare 2 to 5 agents side by side, by slug.',
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
    return fail('slugs must be an array of 2 to 5 agent slugs', 'validation_error')
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
            ...evidenceFields(data.latest_score),
          }
        } catch (err) {
          if (err instanceof BenchlytixError && err.code === 'not_found') {
            return {
              slug,
              name: null,
              overall_score: null,
              verified_at: null,
              evidence_basis: null,
              evidence_label: null,
            }
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
    'Return the BenchLytix scoring methodology document. Not implemented in 0.2.x: returns not_available.',
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
    'get_methodology is not implemented in this version. Read the methodology at https://www.benchlytix.com/docs/scoring-methodology.',
    'not_available'
  )
}

// ---------------------------------------------------------------------------
// find_replacements — wraps bl.replacements(...) (PR-S3, investigation §5)
// ---------------------------------------------------------------------------

export const FIND_REPLACEMENTS_SCHEMA = {
  name: 'find_replacements',
  description:
    'Find self-hostable replacements (each with its licence class) for a paid tool or a goal. Every candidate carries evidence_label: "tested" (a published BenchLytix test with a verdict and scorecard_url), "coverage_checked" (connector coverage computed from a crawled directory, nothing run) or "listed_untested" (public facts only). Show the label with each candidate; there is no score on untested rows. licence_class is derived from SPDX and reviewed LICENSE files (open_core, fair_code and source_available tools are not fully open source). Each candidate has description (whose words), maintenance (inactive = no push in 12 months), and where known a footprint (a rough hosting reference, not a measurement); paid_tool_pricing gives the paid tool\'s vendor list price with its source and date (from_usd_monthly is null when there is no usable amount, and amount_reason says why: tiered, reduction_terms_not_stated, withheld or no_price); hidden lists what was left out and why. Call this before recommending or adopting a self-hosted tool.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      paid_tool: { type: 'string', description: 'The paid tool to replace, e.g. "Zapier", "Airtable".' },
      goal: {
        type: 'string',
        enum: [
          'automation',
          'team-wiki',
          'spreadsheet-database',
          'forms-surveys',
          'scheduling',
          'team-chat',
          'crm',
          'product-analytics',
          'observability',
          'e-signature',
          'customer-messaging',
          'llm-tracing',
          'secrets',
          'project-tracking',
          'file-sync',
        ],
        description: 'What the user is trying to get done (BenchLytix replacement taxonomy v1).',
      },
      setup: {
        type: 'object',
        properties: {
          hosting: { type: 'string', enum: ['none', 'docker', 'k8s'] },
          osi_only: { type: 'boolean' },
          include_proprietary: { type: 'boolean', description: 'Also return proprietary-licensed self-hosted projects (hidden by default).' },
          must_keep_integrations: { type: 'array', items: { type: 'string' }, maxItems: 20 },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  },
}

export interface FindReplacementsArgs {
  paid_tool?: string
  goal?: string
  setup?: {
    hosting?: 'none' | 'docker' | 'k8s'
    osi_only?: boolean
    include_proprietary?: boolean
    must_keep_integrations?: string[]
  }
}

export async function findReplacements(bl: BenchLytix, args: FindReplacementsArgs): Promise<ToolResult> {
  if (!args.paid_tool && !args.goal) return fail('Provide paid_tool or goal', 'validation_error')
  try {
    const res = await bl.replacements({
      goal: args.goal,
      paidTool: args.paid_tool,
      setup: args.setup
        ? {
            hosting: args.setup.hosting,
            osiOnly: args.setup.osi_only,
            includeProprietary: args.setup.include_proprietary,
            mustKeepIntegrations: args.setup.must_keep_integrations,
          }
        : undefined,
    })
    // The investigation §5 contract: the envelope's meta travels with the data.
    return ok({ ...res.data, meta: res.meta })
  } catch (err) {
    return wrapError(err)
  }
}

// ---------------------------------------------------------------------------
// get_scorecard — wraps bl.scorecard(suite) (PR-S2, GET /v1/scorecards/{suite})
// ---------------------------------------------------------------------------

export const SCORECARD_SUITES = ['workflow-automation'] as const
export type ScorecardSuiteArg = (typeof SCORECARD_SUITES)[number]

export const GET_SCORECARD_SCHEMA = {
  name: 'get_scorecard',
  description:
    'Get the latest published BenchLytix tested scorecard. "workflow-automation" (the default) answers "can self-hosted n8n replace Zapier?": twelve two-step automations run three times each on Zapier Free and on self-hosted n8n. Each side has a verdict with verdict_words (e.g. "Can replace", "Partly"), recipe counts (pass / fail / not_observed; a rep whose result could not be read back is not_observed, never a failure), per-recipe outcomes with per-rep latency, and run_url to the full published run. status is "no_published_run" until a person at BenchLytix has reviewed and published a run. There is no score; quote verdict_words and the disclosures (what was not tested, how each side was judged) with any answer, and link run_url.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      suite: {
        type: 'string',
        enum: [...SCORECARD_SUITES],
        default: 'workflow-automation',
        description: 'Which tested scorecard. Only "workflow-automation" (n8n vs Zapier) exists today.',
      },
    },
    additionalProperties: false,
  },
}

export interface GetScorecardArgs {
  suite?: string
}

export async function getScorecard(bl: BenchLytix, args: GetScorecardArgs): Promise<ToolResult> {
  const suite = args.suite ?? 'workflow-automation'
  if (!(SCORECARD_SUITES as readonly string[]).includes(suite)) {
    return fail(`Unknown suite "${suite}". Available: ${SCORECARD_SUITES.join(', ')}`, 'validation_error')
  }
  try {
    const res = await bl.scorecard(suite as ScorecardSuiteArg)
    // Same as find_replacements: the envelope's meta travels with the data.
    return ok({ ...res.data, meta: res.meta })
  } catch (err) {
    return wrapError(err)
  }
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
  FIND_REPLACEMENTS_SCHEMA,
  GET_SCORECARD_SCHEMA,
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
    case 'find_replacements':
      return findReplacements(bl, args as FindReplacementsArgs)
    case 'get_scorecard':
      return getScorecard(bl, args as GetScorecardArgs)
    default:
      return Promise.resolve(fail(`Unknown tool: ${name}`, 'not_found'))
  }
}
