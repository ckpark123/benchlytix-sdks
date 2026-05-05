# BenchLytix SDKs

Official client libraries for the BenchLytix Machine API — agent trust scores, leaderboards, and verification.

## Packages

- **TypeScript / JavaScript** — [`@benchlytixai/sdk`](./packages/sdk-ts) — `npm install @benchlytixai/sdk`
- **Python** — [`benchlytix`](./packages/sdk-python) — `pip install benchlytix`
- **MCP server** — [`benchlytix-mcp-server`](./packages/mcp-server) — `npx benchlytix-mcp-server`

> **Note on the npm scope**: the `@benchlytixai` scope is used for the TypeScript SDK (the `@benchlytix` scope was already taken on npmjs.com). The Python SDK and MCP server names are unaffected.

All three are MIT licensed. The full source above + per-package READMEs cover install, quickstart, and the response shapes returned by the live API.

## Get an API key

Sign in at [benchlytix.com/dashboard/api-keys](https://benchlytix.com/dashboard/api-keys) and click "Create API key". The key is shown ONCE at creation; save it immediately. Keys are rate-limited to 100 req/min and require an active API Access subscription.

## Docs

- **API reference** → [benchlytix.com/docs/api](https://benchlytix.com/docs/api)
- **Open-source roadmap** → [benchlytix.com/docs/open-source](https://benchlytix.com/docs/open-source)
- **Methodology** → [benchlytix.com/docs/scoring-methodology](https://benchlytix.com/docs/scoring-methodology)

## Contributing

Bug reports + PRs welcome at [Issues](https://github.com/ckpark123/benchlytix-sdks/issues). Each package has its own test suite; CI runs them on every PR.
