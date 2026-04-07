/**
 * SwarmHaul MCP stdio server.
 *
 * Standalone entry point for use with Claude Desktop, Cursor, Codex,
 * Claude Code — anything that speaks the Model Context Protocol stdio
 * transport.
 *
 * This server is a thin client over the SwarmHaul HTTP API. It does NOT
 * connect to Postgres or Solana directly; it just translates MCP tool
 * calls into HTTP requests against the running API.
 *
 * Run with:
 *   bun run apps/api/src/mcp/stdio.ts
 *
 * Or via mcp.json:
 *   {
 *     "mcpServers": {
 *       "swarmhaul": {
 *         "command": "bun",
 *         "args": ["run", "/path/to/swarmhaul/apps/api/src/mcp/stdio.ts"],
 *         "env": { "SWARMHAUL_API": "http://localhost:3001" }
 *       }
 *     }
 *   }
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MCP_TOOLS } from "./tools.js";

const API_BASE = process.env.SWARMHAUL_API ?? "http://localhost:3001";

const server = new Server(
  {
    name: "swarmhaul",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List the tools we expose
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: MCP_TOOLS,
}));

// Dispatch tool calls via the API's /mcp/call endpoint so all logic
// stays in one place (no duplication between transports)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const res = await fetch(`${API_BASE}/mcp/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: name, arguments: args ?? {} }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        isError: true,
        content: [{ type: "text", text: `API error ${res.status}: ${text}` }],
      };
    }

    const result = (await res.json()) as {
      isError?: boolean;
      content: { type: "text"; text: string }[];
    };
    return result;
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to reach SwarmHaul API at ${API_BASE}: ${String(err)}\n\nMake sure the API is running.`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Don't print to stdout — that's the MCP transport
  console.error(`[swarmhaul-mcp] connected via stdio, api=${API_BASE}`);
}

main().catch((err) => {
  console.error("[swarmhaul-mcp] fatal:", err);
  process.exit(1);
});
