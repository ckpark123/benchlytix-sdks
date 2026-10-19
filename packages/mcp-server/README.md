# benchlytix-mcp-server

Official [Model Context Protocol](https://modelcontextprotocol.io) server for [BenchLytix](https://benchlytix.com).

Gives any MCP-compatible client (Claude Code, Cursor, VS Code, Windsurf, Zed) direct access to agent trust scores, leaderboards, and verification.

## Install

### Claude Code

```bash
claude mcp add benchlytix -- npx -y benchlytix-mcp-server
```

Set `BENCHLYTIX_API_KEY` in your environment or Claude Code config.

### Cursor / VS Code / Windsurf

Add to `.cursor/mcp.json` (or equivalent):

```json
{
  "servers": {
    "benchlytix": {
      "command": "npx",
      "args": ["-y", "benchlytix-mcp-server"],
      "env": { "BENCHLYTIX_API_KEY": "blx_live_..." }
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `get_leaderboard` | Ranked list of verified agents, optionally filtered by task category. |
| `get_agent_score` | Full score breakdown for a single agent by slug. |
| `verify_agent` | Check whether an agent is BenchLytix-verified (by slug OR agent UUID). |
| `get_categories` | List all task categories. *(arrives in Session 2b)* |
| `compare_agents` | Side-by-side comparison of 2–5 agents. |
| `get_methodology` | Scoring methodology document. *(arrives in Session 2b)* |
| `find_replacements` | Open-source replacements for a paid tool or a goal, each labelled `tested`, `coverage_checked` or `listed_untested` (0.2.0). |
| `get_scorecard` | The latest published tested scorecard; `workflow-automation` (default) = self-hosted n8n vs Zapier Free, per-side verdict, recipe outcomes, run links and disclosures (0.2.0). |

## API key

Get a key at [benchlytix.com/dashboard/api-keys](https://benchlytix.com/dashboard/api-keys). Keys look like `blx_live_...`.

The MCP server reads the key from `BENCHLYTIX_API_KEY` only — never from tool arguments (would leak into `ps` output).

**Free**: API keys are free from the [dashboard](https://benchlytix.com/dashboard/api-keys) and need no subscription. Each key is rate-limited to 100 requests per minute; tool calls over the limit return a `rate_limited` error.

## Example

In Claude Code, once installed:

> *User:* What are the top 3 legal-summarization agents on BenchLytix?
>
> *Claude* calls `get_leaderboard({ category: 'legal-summarization', limit: 3 })` and reports back.

## Links

- [Website](https://benchlytix.com)
- [For Agents landing](https://benchlytix.com/for/agents)
- [API Docs](https://benchlytix.com/api/docs)
- [TypeScript SDK](https://www.npmjs.com/package/@benchlytixai/sdk)
- [Python SDK](https://pypi.org/project/benchlytix)

## License

MIT
