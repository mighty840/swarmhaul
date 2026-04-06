import { useState, useEffect, useCallback, useRef } from "react";
import type { WSEvent, Package, Swarm, Bid, AgentReputation } from "@swarmhaul/types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3001";

interface EconomyStats {
  packages: { total: number; active: number; delivered: number };
  swarms: { total: number; active: number };
  bids: { total: number };
  agents: { total: number };
  legs: { completed: number };
  volume: { totalSol: number };
  wsClients: number;
}

interface Activity {
  recentBids: Array<{
    id: string;
    packageId: string;
    agentPubkey: string;
    costSol: number;
    reasoning: string | null;
    createdAt: string;
  }>;
  recentLegs: Array<{
    id: string;
    agentPubkey: string;
    agreedPaymentSol: number;
    completedAt: string | null;
    swarm: { packageId: string };
  }>;
  recentPackages: Array<{
    id: string;
    description: string;
    status: string;
    maxBudgetSol: number;
    listedAt: string;
  }>;
}

export function useSwarmData() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [stats, setStats] = useState<EconomyStats | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [leaderboard, setLeaderboard] = useState<AgentReputation[]>([]);
  const [wsEvents, setWsEvents] = useState<WSEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [pkgRes, statsRes, actRes, lbRes] = await Promise.all([
        fetch(`${API_URL}/packages`),
        fetch(`${API_URL}/economy/stats`),
        fetch(`${API_URL}/economy/activity`),
        fetch(`${API_URL}/reputation/leaderboard`),
      ]);
      setPackages(await pkgRes.json());
      setStats(await statsRes.json());
      setActivity(await actRes.json());
      setLeaderboard(await lbRes.json());
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(() => {
        wsRef.current = new WebSocket(`${WS_URL}/ws`);
      }, 3000);
    };
    ws.onmessage = (e) => {
      const event: WSEvent = JSON.parse(e.data);
      setWsEvents((prev) => [event, ...prev].slice(0, 50));
      fetchData(); // refresh on any event
    };

    return () => ws.close();
  }, [fetchData]);

  return { packages, stats, activity, leaderboard, wsEvents, connected };
}

export async function postPackage(data: {
  shipperPubkey: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  description: string;
  weightKg: number;
  volumeLitres: number;
  maxBudgetSol: number;
}) {
  const res = await fetch(`${API_URL}/packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}
