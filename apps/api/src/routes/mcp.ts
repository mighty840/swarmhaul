import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../db/client.js";
import { MCP_TOOLS, handleMcpToolCall } from "../mcp/tools.js";
import { McpCallBody } from "../schemas/index.js";
import { addMcpSession, removeMcpSession } from "../services/mcp-broadcaster.js";

type McpBody = z.infer<typeof McpCallBody>;

// Session maps for both transports
const sseTransports = new Map<string, SSEServerTransport>();
const httpTransports = new Map<string, StreamableHTTPServerTransport>();

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
          text: typeof result === "string" ? result : JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2),
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
            text: typeof result === "string" ? result : JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2),
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

  // ─── Streamable HTTP transport (MCP 2025-03-26, recommended) ─────────
  // Single POST endpoint — works cleanly through reverse proxies.
  // claude mcp add swarmhaul --transport http https://api.swarmhaul.defited.com/mcp
  app.post("/", { config: { rawBody: true } }, async (req, reply) => {
    reply.hijack();
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId) {
      // Route to existing session
      const transport = httpTransports.get(sessionId);
      if (!transport) {
        reply.raw.writeHead(404, { "Content-Type": "application/json" });
        reply.raw.end(JSON.stringify({ error: "Session not found or expired" }));
        return;
      }
      await transport.handleRequest(req.raw, reply.raw, req.body);
      return;
    }

    // No session-id → must be initialize
    if (!isInitializeRequest(req.body)) {
      reply.raw.writeHead(400, { "Content-Type": "application/json" });
      reply.raw.end(JSON.stringify({ error: "Missing Mcp-Session-Id header for non-init request" }));
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        httpTransports.set(sid, transport);
        addMcpSession(sid, server);
        app.log.info({ sid }, "MCP HTTP session initialized");
      },
    });

    const server = buildMcpServer();

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        httpTransports.delete(sid);
        removeMcpSession(sid);
        app.log.info({ sid }, "MCP HTTP session closed");
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  // GET /mcp — SSE stream for push notifications from an existing HTTP session
  app.get("/", async (req, reply) => {
    reply.hijack();
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? httpTransports.get(sessionId) : undefined;
    if (!transport) {
      reply.raw.writeHead(400, { "Content-Type": "application/json" });
      reply.raw.end(JSON.stringify({ error: "Invalid or missing Mcp-Session-Id" }));
      return;
    }
    await transport.handleRequest(req.raw, reply.raw);
  });

  // DELETE /mcp — terminate session
  app.delete("/", async (req, reply) => {
    reply.hijack();
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = sessionId ? httpTransports.get(sessionId) : undefined;
    if (!transport) {
      reply.raw.writeHead(404, { "Content-Type": "application/json" });
      reply.raw.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    await transport.close();
    reply.raw.writeHead(200).end();
  });

  // ─── Legacy SSE transport (MCP 2024-11-05) ───────────────────────────
  // Kept for backward compat. Note: requires Caddy flush_interval -1 to
  // work through a reverse proxy (see deployment docs).
  // claude mcp add swarmhaul --transport sse https://api.swarmhaul.defited.com/mcp/sse
  app.get("/sse", async (req, reply) => {
    reply.hijack();
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

    await new Promise<void>((resolve) => reply.raw.on("close", resolve));
  });

  app.post("/messages", async (req, reply) => {
    const sessionId = (req.query as Record<string, string>).sessionId;
    const transport = sessionId ? sseTransports.get(sessionId) : undefined;
    if (!transport) {
      return reply.code(404).send({ error: "Session not found or expired" });
    }
    await transport.handlePostMessage(req.raw, reply.raw);
  });
}
