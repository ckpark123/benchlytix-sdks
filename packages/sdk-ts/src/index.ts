/**
 * @benchlytixai/sdk — Official TypeScript SDK for the BenchLytix Machine API.
 *
 * @example
 *   import { BenchLytix } from '@benchlytixai/sdk'
 *   const bl = new BenchLytix({ apiKey: process.env.BENCHLYTIX_API_KEY })
 *   const { data } = await bl.leaderboard({ limit: 5 })
 */

export { BenchLytix } from './client'
export type { BenchLytixOptions } from './client'
export {
  BenchlytixError,
  BenchlytixAuthError,
  BenchlytixNotFoundError,
  BenchlytixRateLimitError,
  BenchlytixServerError,
} from './errors'
export type {
  AgentProfile,
  BenchlytixErrorCode,
  ErrorEnvelope,
  ErrorPayload,
  LeaderboardParams,
  RankedAgentRow,
  RateLimitMeta,
  ReplacementCandidate,
  ReplacementClaim,
  ReplacementCoverage,
  ReplacementEvidenceLabel,
  ReplacementLicenceClass,
  ReplacementsParams,
  ReplacementsResult,
  ReplacementVerdict,
  ScorecardOutcome,
  ScorecardRecipe,
  ScorecardResult,
  ScorecardSide,
  ScorecardSuite,
  SuccessEnvelope,
  SuccessMeta,
  TaskCategory,
  VerifiedStatus,
} from './types'
