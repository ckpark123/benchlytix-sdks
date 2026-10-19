# benchlytix (Python SDK)

Official Python SDK for the [BenchLytix](https://benchlytix.com) Machine API — agent trust scores, leaderboards, and verification.

## Install

```bash
pip install benchlytix
```

Requires Python ≥ 3.9. Depends on `httpx` and `pydantic` v2.

## Quickstart (sync)

```python
from benchlytix import BenchLytix

bl = BenchLytix(api_key="blx_live_...")

# 1. Ranked leaderboard
result = bl.leaderboard(category="legal-summarization", limit=5)
for row in result.data:
    print(f"{row.name} — {row.overall_score}")

# 2. Agent profile
agent = bl.agent("legal-bot")
print(agent.data.latest_score.overall_score if agent.data.latest_score else "N/A")

# 3. Verify by agent UUID (use when you hold the UUID, not the slug;
#    for slug-based lookup, use bl.agent(slug) and read verified_at)
status = bl.verify_status("00000000-0000-4000-8000-000000000000")
if status.data.verified:
    print(f"verified, score {status.data.score}")
```

## Quickstart (async)

```python
import asyncio
from benchlytix.client import AsyncBenchLytix

async def main():
    async with AsyncBenchLytix(api_key="blx_live_...") as bl:
        result = await bl.leaderboard(limit=5)
        for row in result.data:
            print(row.name, row.overall_score)

asyncio.run(main())
```

## API key

Get a key at [benchlytix.com/dashboard/api-keys](https://benchlytix.com/dashboard/api-keys). Keys look like `blx_live_...`.

Set `BENCHLYTIX_API_KEY` in your environment, or pass `api_key=...` explicitly.

**Free**: API keys are free from the [dashboard](https://benchlytix.com/dashboard/api-keys) and need no subscription. Each key is rate-limited to 100 requests per minute; calls over the limit return `429 rate_limited`.

## Error handling

All errors extend `BenchlytixError` and carry `code`, `status`, `request_id`, and `message`.

```python
from benchlytix import (
    BenchLytix,
    BenchlytixAuthError,
    BenchlytixNotFoundError,
    BenchlytixRateLimitError,
    BenchlytixServerError,
)

bl = BenchLytix(api_key="blx_live_...")

try:
    bl.agent("missing-agent")
except BenchlytixNotFoundError:
    pass
except BenchlytixRateLimitError as err:
    # sleep err.retry_after seconds, then retry
    import time
    time.sleep(err.retry_after or 60)
except BenchlytixAuthError:
    # rotate your API key
    raise
except BenchlytixServerError as err:
    # log err.request_id for support
    raise
```

The SDK does NOT auto-retry. You decide.

## Configuration

```python
BenchLytix(
    api_key="blx_live_...",                    # or $BENCHLYTIX_API_KEY
    base_url="https://api.benchlytix.com/v1",  # or $BENCHLYTIX_BASE_URL
    timeout=30.0,                              # seconds
)
```

## Links

- [Website](https://benchlytix.com)
- [For Agents landing](https://benchlytix.com/for/agents)
- [API Docs](https://benchlytix.com/api/docs)
- [TypeScript SDK](https://www.npmjs.com/package/@benchlytixai/sdk)
- [MCP Server](https://www.npmjs.com/package/benchlytix-mcp-server)

## License

MIT
