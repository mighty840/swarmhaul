import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../db/client.js";
import { MCP_TOOLS, handleMcpToolCall } from "../mcp/tools.js";
import { McpCallBody } from "../schemas/index.js";
import { addMcpSession, removeMcpSession } from "../services/mcp-broadcaster.js";

type McpBody = z.infer<typeof McpCallBody>;

// Session-keyed transport map so /mcp/messages can route POST bodies.
const sseTransports = new Map<string, SSEServerTransport>();

function buildMcpServer(): Server {
  const server = new Server(
    { name: "swarmhaul", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: [
        "SwarmHaul multi-agent protocol on Solana.",
        "Call swarmhaul_register_agent first to fund your wallet and get your system prompt.",
        "You will receive push notifications when new digital tasks are posted.",
      ].join(" "),
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await handleMcpToolCall(
      prisma,
      request.params.name,
      (request.params.arguments as Record<string, unknown>) ?? {},
    );
    return {
      content: [
        {
          type: "text" as const,
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  return server;
}

export async function mcpRoutes(app: FastifyInstance) {
  // ─── Legacy HTTP transport (backwards compat) ────────────────────────
  app.get("/tools", async () => ({
    schemaVersion: "2024-11-05",
    server: { name: "swarmhaul", version: "0.1.0" },
    tools: MCP_TOOLS,
  }));

  app.post("/call", { schema: { body: McpCallBody } }, async (req, reply) => {
    const { tool, arguments: args } = req.body as McpBody;
    try {
      const result = await handleMcpToolCall(prisma, tool, args ?? {});
      return {
        isError: false,
        content: [
          {
            type: "text",
            text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      app.log.error({ err }, `MCP tool ${tool} failed`);
      return reply.code(500).send({
        isError: true,
        content: [{ type: "text", text: `Tool execution failed: ${String(err)}` }],
      });
    }
  });

  // ─── SSE transport — GET /mcp/sse ────────────────────────────────────
  // Establishes the SSE stream. The SDK sends an `endpoint` event pointing
  // clients to POST their JSON-RPC messages to /mcp/messages?sessionId=<id>.
  app.get("/sse", async (req, reply) => {
    const transport = new SSEServerTransport("/mcp/messages", reply.raw);
    const server = buildMcpServer();
    const { sessionId } = transport;

    sseTransports.set(sessionId, transport);
    addMcpSession(sessionId, server);

    const cleanup = () => {
      sseTransports.delete(sessionId);
      removeMcpSession(sessionId);
      app.log.info({ sessionId }, "MCP SSE session closed");
    };

    transport.onclose = cleanup;
    reply.raw.on("close", cleanup);

    await server.connect(transport);
    app.log.info({ sessionId }, "MCP SSE session connected");

    // Hold the connection open until the client disconnects.
    await new Promise<void>((resolve) => reply.raw.on("close", resolve));
  });

  // ─── SSE transport — POST /mcp/messages ──────────────────────────────
  // Client sends JSON-RPC tool calls here; we route to the right transport.
  app.post("/messages", async (req, reply) => {
    const sessionId = (req.query as Record<string, string>).sessionId;
    const transport = sessionId ? sseTransports.get(sessionId) : undefined;
    if (!transport) {
      return reply.code(404).send({ error: "Session not found or expired" });
    }
    await transport.handlePostMessage(req.raw, reply.raw);
  });
}
