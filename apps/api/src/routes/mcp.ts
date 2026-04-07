import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { MCP_TOOLS, handleMcpToolCall } from "../mcp/tools.js";

/**
 * MCP HTTP transport.
 *
 * Two endpoints:
 * - GET  /mcp/tools         — returns the tool manifest (MCP discovery)
 * - POST /mcp/call          — { tool, arguments } → tool result
 *
 * For Claude Desktop / Cursor / Codex, use the stdio transport instead
 * (apps/api/src/mcp/stdio.ts) which talks to this API over HTTP under
 * the hood.
 */
export async function mcpRoutes(app: FastifyInstance) {
  // Manifest — what tools does this server expose?
  app.get("/tools", async () => ({
    schemaVersion: "2024-11-05",
    server: {
      name: "swarmhaul",
      version: "0.1.0",
      description:
        "SwarmHaul — multi-agent coordination protocol on Solana. Discover delivery tasks, submit bids, build reputation.",
    },
    tools: MCP_TOOLS,
  }));

  // Tool dispatch — { tool, arguments }
  app.post<{ Body: { tool: string; arguments?: Record<string, unknown> } }>(
    "/call",
    async (req, reply) => {
      const { tool, arguments: args } = req.body;
      if (!tool || typeof tool !== "string") {
        return reply.code(400).send({ error: "Missing 'tool' field" });
      }

      try {
        const result = await handleMcpToolCall(prisma, tool, args ?? {});
        return {
          isError: false,
          content: [
            {
              type: "text",
              text:
                typeof result === "string" ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        app.log.error({ err }, `MCP tool ${tool} failed`);
        return reply.code(500).send({
          isError: true,
          content: [
            {
              type: "text",
              text: `Tool execution failed: ${String(err)}`,
            },
          ],
        });
      }
    },
  );
}
