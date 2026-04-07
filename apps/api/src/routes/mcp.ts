import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { prisma } from "../db/client.js";
import { MCP_TOOLS, handleMcpToolCall } from "../mcp/tools.js";
import { McpCallBody } from "../schemas/index.js";

type McpBody = z.infer<typeof McpCallBody>;

/**
 * MCP HTTP transport.
 *
 * Two endpoints:
 * - GET  /mcp/tools         — returns the tool manifest (MCP discovery)
 * - POST /mcp/call          — { tool, arguments } → tool result
 */
export async function mcpRoutes(app: FastifyInstance) {
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

  app.post(
    "/call",
    { schema: { body: McpCallBody } },
    async (req, reply) => {
      const { tool, arguments: args } = req.body as McpBody;

      try {
        const result = await handleMcpToolCall(prisma, tool, args ?? {});
        return {
          isError: false,
          content: [
            {
              type: "text",
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
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
