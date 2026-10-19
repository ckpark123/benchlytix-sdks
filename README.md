# BenchLytix SDKs

Official client libraries for the BenchLytix API: the replacement finder (self-hosted alternatives to the paid
tools you use, with sourced facts and the vendor's dated price), the n8n vs Zapier workflow scorecard, and the AI
agent leaderboard.

## Packages (0.2.0)

- **TypeScript / JavaScript**: [`@benchlytixai/sdk`](./packages/sdk-ts), `npm install @benchlytixai/sdk`
- **Python**: [`benchlytix`](./packages/sdk-python), `pip install benchlytix`
- **MCP server**: [`benchlytix-mcp-server`](./packages/mcp-server), `npx benchlytix-mcp-server`

What 0.2.0 adds: `replacements()` (TypeScript and Python) and the MCP tool `find_replacements`, and `scorecard()` /
`get_scorecard`. The scorecard endpoint answers "not available" until the first scorecard is published.

> **Note on the npm scope**: the `@benchlytixai` scope is used for the TypeScript SDK (the `@benchlytix` scope was
> already taken on npmjs.com). The Python SDK and MCP server names are unaffected.

All three are MIT licensed. Each package's README covers install, quickstart and the response shapes.

This repository mirrors the package sources that were published; it is updated at each release.

## Get an API key

API keys are free. Sign in at [benchlytix.com/dashboard/api-keys](https://www.benchlytix.com/dashboard/api-keys)
and create one; it is shown once, so save it. Keys are rate-limited to 100 requests a minute. Details:
[benchlytix.com/docs/api](https://www.benchlytix.com/docs/api#authentication).

## Docs

- **API reference**: [benchlytix.com/docs/api](https://www.benchlytix.com/docs/api)
- **Open source**: [benchlytix.com/docs/open-source](https://www.benchlytix.com/docs/open-source)
- **Methodology**: [benchlytix.com/docs/scoring-methodology](https://www.benchlytix.com/docs/scoring-methodology)

## Contributing

Bug reports and pull requests are welcome at [Issues](https://github.com/ckpark123/benchlytix-sdks/issues).
