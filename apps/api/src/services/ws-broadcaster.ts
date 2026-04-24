import type { WSEvent } from "@swarmhaul/types";

type WebSocket = {
  readyState: number;
  OPEN: number;
  send(data: string): void;
  on(event: string, cb: () => void): void;
};

const clients = new Set<WebSocket>();

export function addClient(ws: WebSocket) {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
}

export function broadcast(event: WSEvent) {
  const data = JSON.stringify(event, (_, v) => (typeof v === "bigint" ? v.toString() : v));
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

export function getClientCount(): number {
  return clients.size;
}
