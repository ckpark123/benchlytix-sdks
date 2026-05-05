/**
 * Brand-separation regression test for `@benchlytixai/sdk`.
 *
 * Mirrors the marketing-site brand-separation gate
 * (`__tests__/marketing/source-isolation.test.ts` in the BenchLytix
 * monorepo). Asserts that no published artifact (src/ + README +
 * package.json) contains brand tokens that should never appear in the
 * public SDK surface.
 *
 * Two carefully-scoped exemptions:
 *
 * 1. The wire-format query-param `agent_metrxbot_id` is fixed by the
 *    upstream API contract. The SDK has to send it on the wire to make
 *    requests succeed. The exemption is the EXACT string with the
 *    `agent_` prefix; loose mentions of "metrxbot" or "MetrxBot" still
 *    fail the gate.
 * 2. None for now. Add explicit per-line exemptions only with a
 *    code-comment explaining why the gate would otherwise be wrong.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_ROOT = join(__dirname, '..')
const PUBLISHED_ROOTS = ['src', 'README.md', 'package.json']

// Tokens that must NOT appear in public SDK artifacts. Identical to the
// marketing site's BANNED_TOKENS_RAW; case-folded compare.
const BANNED_TOKENS = [
  'Powered by Metrxbot',
  'Certified by Metrxbot',
  'metrxbot.com',
  'Metrx-Bot',
  'Metrx Bot',
  'metrx-team',
  'Metrxbot',
  'MetrxBot',
] as const

// Allowed substrings — the wire-format param name only. Exact-match.
const EXEMPT_SUBSTRINGS = ['agent_metrxbot_id'] as const

function* walk(path: string): Generator<string> {
  const stat = statSync(path)
  if (stat.isFile()) {
    yield path
    return
  }
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      yield* walk(join(path, entry))
    }
  }
}

describe('brand separation (published artifacts)', () => {
  it('src/ + README + package.json contain zero banned brand tokens', () => {
    const violations: { file: string; token: string; line: number }[] = []

    for (const root of PUBLISHED_ROOTS) {
      const abs = join(PACKAGE_ROOT, root)
      for (const file of walk(abs)) {
        if (!/\.(ts|tsx|js|md|json)$/.test(file)) continue
        const content = readFileSync(file, 'utf-8')
        // Strip exempted exact substrings before scanning so the
        // remaining text-only scan can use a plain indexOf.
        let scanContent = content
        for (const ex of EXEMPT_SUBSTRINGS) {
          scanContent = scanContent.split(ex).join('')
        }
        const lower = scanContent.toLowerCase()
        for (const token of BANNED_TOKENS) {
          const idx = lower.indexOf(token.toLowerCase())
          if (idx !== -1) {
            const upTo = scanContent.slice(0, idx)
            const line = upTo.split('\n').length
            violations.push({
              file: file.replace(PACKAGE_ROOT + '/', ''),
              token,
              line,
            })
          }
        }
      }
    }

    expect(
      violations,
      `Brand-separation violations:\n${violations
        .map((v) => `  ${v.file}:${v.line}  →  ${v.token}`)
        .join('\n')}`
    ).toEqual([])
  })
})
