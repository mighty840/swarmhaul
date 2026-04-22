import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

const sessions = new Map<string, Server>();

export function addMcpSession(sessionId: string, server: Server) {
  sessions.set(sessionId, server);
}

export function removeMcpSession(sessionId: string) {
  sessions.delete(sessionId);
}

export function getMcpSessionCount(): number {
  return sessions.size;
}

export async function broadcastMcpNotification(message: string): Promise<void> {
  const dead: string[] = [];
  for (const [id, server] of sessions) {
    try {
      await server.notification({
        method: "notifications/message",
        params: { level: "info", logger: "swarmhaul", data: message },
      });
    } catch {
      dead.push(id);
    }
  }
  for (const id of dead) sessions.delete(id);
}
