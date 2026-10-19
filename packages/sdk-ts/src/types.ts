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

/**
 * What kind of evidence produced a score (2026-09-27 honest-scores).
 * `documentation_only` = estimated from published materials, not measured —
 * every BenchLytix surface labels it "Estimated from documentation"
 * (`evidence_label`). Display the label next to the number.
 */
export type EvidenceBasis =
  | 'documentation_only'
  | 'probe_measured'
  | 'runtime_measured'

/** `GET /v1/agents` row — mirrors RankedAgentRow. */
export interface RankedAgentRow {
  id: string
  slug: string
  name: string
  task_category: TaskCategory
  overall_score: number | null
  verified_at: string | null
  evidence_basis: EvidenceBasis | null
  evidence_label: string | null
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
    evidence_basis: EvidenceBasis | null
    evidence_label: string | null
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
  evidence_basis: EvidenceBasis | null
  evidence_label: string | null
}

export interface LeaderboardParams {
  category?: TaskCategory
  /** 1..100, default 25 server-side. */
  limit?: number
}

// ---------------------------------------------------------------------------
// Replacement finder — `GET /v1/replacements` (0.2.0). Mirrors
// lib/replacements/match.ts MatchResult. Every candidate carries exactly one
// evidence_label; scorecard_url / verdict / run_id appear ONLY on `tested`
// rows; coverage only where a crawled connector directory exists. There is
// no score field: show the label next to the name.
// ---------------------------------------------------------------------------

export type ReplacementEvidenceLabel = 'tested' | 'coverage_checked' | 'listed_untested'
export type ReplacementLicenceClass = 'osi' | 'open_core' | 'fair_code' | 'source_available' | 'proprietary' | 'unclassified'
export type ReplacementVerdict = 'replace' | 'partial' | 'do_not_replace' | 'insufficient'

export interface ReplacementsParams {
  /** Taxonomy goal slug (e.g. "automation", "team-wiki"). goal or paidTool is required. */
  goal?: string
  /** The paid tool you use, free text (e.g. "Zapier"). */
  paidTool?: string
  setup?: {
    hosting?: 'none' | 'docker' | 'k8s'
    osiOnly?: boolean
    /** Proprietary-licensed self-hosted projects are hidden unless this is true. */
    includeProprietary?: boolean
    /** Up to 20 app names; coverage is computed where a connector directory is crawled. */
    mustKeepIntegrations?: string[]
  }
}

export interface ReplacementClaim {
  text: string
  basis: 'measured' | 'crawled' | 'editorial'
  source_url: string
}

export interface ReplacementCoverage {
  tool: string
  matched: string[]
  missing: string[]
  unknown: string[]
  /** matched ÷ apps named (0–100); null when no apps were named. */
  pct: number | null
  crawled_at: string
  source_url: string
  snapshot_status: 'complete' | 'partial'
  connector_count: number
}

export interface ReplacementCandidate {
  slug: string
  /** The reviewed taxonomy name (e.g. "Node-RED"). */
  name: string
  /** The source listing's name when it differs. */
  listed_name?: string
  /** active / inactive (no push in 12 months before the facts were read, or its README says it is no longer maintained) / unknown. */
  maintenance: 'active' | 'inactive' | 'unknown'
  /** One line on what it is: a reviewed one-liner, else the project's own words. */
  description?: { text: string; source_url: string; kind: 'reviewed' | 'project' }
  /** A reviewed warning from the project's own README. */
  caution?: { kind: 'unmaintained' | 'not_for_production' | 'maintenance_mode'; chip: string; detail: string; source_url: string; checked_at: string }
  /** A rough self-hosting reference from its compose file; never a measurement. */
  footprint?: {
    services: string[]
    size: 'small' | 'medium' | 'large'
    /** null when the services are beyond the reference servers (no price given). */
    reference_server: { spec: string; plan: string; monthly: string; source_url: string; checked_at: string } | null
    services_source_url: string
    sentence: string
  }
  source_code_url: string
  detail_url: string
  evidence_label: ReplacementEvidenceLabel
  run_id?: string
  scorecard_url?: string
  verdict?: ReplacementVerdict
  coverage?: ReplacementCoverage
  one_line?: string
  facts: {
    licence_spdx: string[]
    licence_class: ReplacementLicenceClass
    stars: number | null
    last_commit_at: string | null
    archived: boolean | null
    docker_image?: { ref: string; pull_count: number; last_updated: string | null }
    ops_burden?: number
    fetched_at: string
  }
  claims: ReplacementClaim[]
}

export interface ReplacementsResult {
  query_echo: {
    goal: string | null
    goal_title: string | null
    paid_tool: { input: string; slug: string | null; name: string | null } | null
    goals_considered: string[]
    setup: Record<string, unknown>
    /** Candidates waiting for a human review (draft / pending_review). */
    awaiting_review: number
    /** Candidates not published for another reason (rejected, or not ingested yet). */
    not_published: number
    taxonomy_version: string
    notes: string[]
  }
  candidates: ReplacementCandidate[]
  /** Candidates left out, each with the reason. */
  hidden: Array<{ slug: string; name: string; reason: 'archived' | 'proprietary' | 'osi_only' | 'hosting' }>
  /** The paid tool's public list price, read from the vendor's own page (present on paid-tool queries). */
  paid_tool_pricing?: {
    paid_tool: string
    name: string
    plan: string
    from_usd_monthly: number | null
    unit: 'per seat' | 'per plan' | 'per host' | 'usage-based'
    billing: string | null
    note: string | null
    sentence: string | null
    source_url: string
    checked_at: string
  }
  paid_tool_coverage?: {
    paid_tool: string
    matched: string[]
    missing: string[]
    unknown: string[]
    pct: number | null
    crawled_at: string | null
    source_urls: string[]
  }
  disclosure: { no_vendor_payment: true; attribution: string; methodology_url: string }
}

// ---------------------------------------------------------------------------
// Tested scorecards — `GET /v1/scorecards/{suite}` (0.2.0). Mirrors
// lib/benchmark/scorecard-api.ts WorkflowScorecardJson. Per-rep outcome and
// latency only; a recipe needs two observed reps, and an unreadable rep is
// `not_observed`, never a failure. There is no score: show verdict_words.
// ---------------------------------------------------------------------------

export type ScorecardSuite = 'workflow-automation'
export type ScorecardOutcome = 'pass' | 'fail' | 'not_observed'

export interface ScorecardRecipe {
  id: string
  trigger_app: string
  trigger_event: string
  action_app: string
  action_event: string
  outcome: ScorecardOutcome
  reps: Array<{ rep: number; outcome: ScorecardOutcome; latency_ms: number | null }>
  /** The n8n workflow JSON (n8n side) or the Zapier template (Zapier side). */
  source_url: string
}

export interface ScorecardSide {
  run_id: string
  /** The published run page with every recipe and rep. */
  run_url: string
  label: string
  target_version: string | null
  verdict: ReplacementVerdict | null
  /** Buyer-facing words for the verdict, e.g. "Can replace". */
  verdict_words: string | null
  finished_at: string | null
  counts: { pass: number; fail: number; not_observed: number; total: number }
  recipes: ScorecardRecipe[]
}

export interface ScorecardResult {
  suite: ScorecardSuite
  suite_version: string
  status: 'published' | 'no_published_run'
  sides: { n8n: ScorecardSide | null; zapier: ScorecardSide | null }
  /** Shown with every result: what was and was not tested. */
  disclosures: string[]
  methodology_url: string
  overview_url: string
}
