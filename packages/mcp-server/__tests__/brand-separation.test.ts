/**
 * Brand-separation regression test for `benchlytix-mcp-server`. See
 * `packages/sdk-ts/__tests__/brand-separation.test.ts` for the full
 * rationale; this is the same gate scoped to this package.
 *
 * The MCP server has NO wire-format exemption — it talks to the SDK,
 * not the API directly. Every banned token is a hard failure.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_ROOT = join(__dirname, '..')
const PUBLISHED_ROOTS = ['src', 'README.md', 'package.json']

const BANNED_TOKENS = [
  'Powered by Metrxbot',
  'Certified by Metrxbot',
  'metrxbot.com',
  'Metrx-Bot',
  'Metrx Bot',
  'metrx-team',
  'Metrxbot',
  'MetrxBot',
  'metrxbot',
] as const

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
        const lower = content.toLowerCase()
        for (const token of BANNED_TOKENS) {
          const idx = lower.indexOf(token.toLowerCase())
          if (idx !== -1) {
            const upTo = content.slice(0, idx)
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
