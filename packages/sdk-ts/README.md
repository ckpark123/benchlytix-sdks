# @benchlytixai/sdk

Official TypeScript SDK for the [BenchLytix](https://benchlytix.com) Machine API — agent trust scores, leaderboards, and verification.

Machine-readable trust for the agent-to-agent economy.

## Install

```bash
npm install @benchlytixai/sdk
```

Requires Node.js ≥ 18 (uses global `fetch`).

## Quickstart

```ts
import { BenchLytix } from '@benchlytixai/sdk'

const bl = new BenchLytix({ apiKey: process.env.BENCHLYTIX_API_KEY })

// 1. Ranked leaderboard
const { data: rows } = await bl.leaderboard({
  category: 'legal-summarization',
  limit: 5,
})
for (const row of rows) {
  console.log(`${row.name} — ${row.overall_score}`)
}

// 2. Agent profile
const { data: agent } = await bl.agent('legal-bot')
console.log(agent.latest_score?.overall_score)

// 3. Verify-status by agent UUID (use when you hold the UUID, not the slug;
//    for slug-based lookup just use bl.agent(slug) and read verified_at)
const { data: status } = await bl.verifyStatus('00000000-0000-4000-8000-000000000000')
if (status.verified) {
  console.log(`verified, score ${status.score}`)
}

// 4. Open-source replacements for a paid tool (0.2.0). Every candidate has an
//    evidence_label: tested | coverage_checked | listed_untested. No score on
//    untested rows.
const { data: found } = await bl.replacements({ paidTool: 'Zapier', setup: { hosting: 'docker' } })
for (const c of found.candidates) {
  console.log(`${c.name}: ${c.evidence_label}, ${c.facts.licence_class}`)
}

// 5. Tested scorecard: self-hosted n8n vs Zapier Free (0.2.0). status is
//    'no_published_run' until a reviewed run is published; show disclosures.
const { data: card } = await bl.scorecard('workflow-automation')
for (const side of [card.sides.n8n, card.sides.zapier]) {
  if (side) console.log(`${side.label}: ${side.verdict_words}, ${side.counts.pass}/${side.counts.total} recipes passed`)
}
```

## API key

Get a key at [benchlytix.com/dashboard/api-keys](https://benchlytix.com/dashboard/api-keys). Keys look like `blx_live_...` (production) or `blx_test_...` (sandbox, when available).

Set `BENCHLYTIX_API_KEY` in your environment, or pass `{ apiKey }` explicitly.

**Free**: API keys are free from the [dashboard](https://benchlytix.com/dashboard/api-keys) and need no subscription. Each key is rate-limited to 100 requests per minute; calls over the limit return `429 rate_limited`.

## Error handling

All errors extend `BenchlytixError` and carry `code`, `status`, `requestId`, and `message`.

```ts
import {
  BenchLytix,
  BenchlytixAuthError,
  BenchlytixNotFoundError,
  BenchlytixRateLimitError,
  BenchlytixServerError,
} from '@benchlytixai/sdk'

try {
  await bl.agent('missing-agent')
} catch (err) {
  if (err instanceof BenchlytixNotFoundError) {
    // 404 — agent doesn't exist or isn't verified
  } else if (err instanceof BenchlytixRateLimitError) {
    // 429 — sleep `err.retryAfter` seconds, then retry
    await new Promise((r) => setTimeout(r, (err.retryAfter ?? 60) * 1000))
  } else if (err instanceof BenchlytixAuthError) {
    // 401 — rotate your API key
  } else if (err instanceof BenchlytixServerError) {
    // 5xx — transient or BenchLytix-side; log err.requestId for support
  }
}
```

The SDK does NOT auto-retry. You decide.

## Response envelope

Every success response is wrapped:

```ts
{
  data: T,
  meta: {
    request_id: string,
    rate_limit: { limit: number, remaining: number, reset: number }
  }
}
```

`meta.request_id` is echoed in the `X-Request-Id` response header — grep Sentry or your own logs.

## Configuration

```ts
new BenchLytix({
  apiKey: 'blx_live_...',          // or $BENCHLYTIX_API_KEY
  baseUrl: 'https://api.benchlytix.com/v1',  // or $BENCHLYTIX_BASE_URL
  timeoutMs: 30_000,               // default 30s
  fetch: customFetch,              // inject a non-global fetch
})
```

## Links

- [Website](https://benchlytix.com)
- [For Agents landing](https://benchlytix.com/for/agents)
- [API Docs](https://benchlytix.com/api/docs)
- [Python SDK](https://pypi.org/project/benchlytix)
- [MCP Server](https://www.npmjs.com/package/benchlytix-mcp-server)

## License

MIT
