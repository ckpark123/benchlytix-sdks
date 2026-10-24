#!/usr/bin/env node
/**
 * benchlytix-mcp-server — stdio MCP server.
 *
 * Wires the 6 tool handlers in `tools.ts` into @modelcontextprotocol/sdk's
 * stdio transport. API key is read from `BENCHLYTIX_API_KEY` (never from
 * tool args — args would leak into `ps` output).
 *
 * Usage:
 *   BENCHLYTIX_API_KEY=blx_live_... npx -y benchlytix-mcp-server
 *
 * Install in Claude Code:
 *   claude mcp add benchlytix -- npx -y benchlytix-mcp-server
 *
 * Install in Cursor / VS Code — see README.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { BenchLytix } from '@benchlytixai/sdk'

import { TOOL_SCHEMAS, dispatch } from './tools'

const SERVER_NAME = 'benchlytix-mcp-server'
const SERVER_VERSION = '0.2.1'

async function main(): Promise<void> {
  const apiKey = process.env.BENCHLYTIX_API_KEY
  if (!apiKey) {
    // Intentionally write to stderr — stdout is the MCP transport.
    console.error(
      '[benchlytix-mcp-server] BENCHLYTIX_API_KEY is required. Set it in your MCP server config.'
    )
    process.exit(1)
  }

  const bl = new BenchLytix({
    apiKey,
    baseUrl: process.env.BENCHLYTIX_BASE_URL,
  })

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_SCHEMAS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>
    return dispatch(req.params.name, bl, args)
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Log connection on stderr, not stdout.
  console.error(`[${SERVER_NAME}] connected (v${SERVER_VERSION})`)
}

main().catch((err) => {
  console.error('[benchlytix-mcp-server] fatal:', err)
  process.exit(1)
})
