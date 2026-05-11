import { useEffect, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_URL ?? "https://api.swarmhaul.defited.com";

type RepEvent = {
  timestamp: number;
  type: "assign" | "confirm";
  sig: string;
  legsAccepted: number;
  legsCompleted: number;
  score: number;
};

type HistoryResponse = {
  pubkey: string;
  events: RepEvent[];
};

const cache = new Map<string, { data: HistoryResponse; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000;

async function fetchHistory(pubkey: string): Promise<HistoryResponse> {
  const cached = cache.get(pubkey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  const res = await fetch(`${API_BASE}/reputation/${pubkey}/history`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: HistoryResponse = await res.json();
  cache.set(pubkey, { data, fetchedAt: Date.now() });
  return data;
}

function Sparkline({
  events,
  color,
  width = 120,
  height = 32,
}: {
  events: RepEvent[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (events.length === 0) {
    return (
      <svg width={width} height={height}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--color-line)"
          strokeWidth={1}
          strokeDasharray="2,3"
        />
      </svg>
    );
  }

  const pad = 2;
  const scores = events.map((e) => e.score);
  const minS = 0;
  const maxS = 100;
  const range = maxS - minS || 1;

  const xStep = (width - pad * 2) / Math.max(scores.length - 1, 1);
  const toX = (i: number) => pad + i * xStep;
  const toY = (s: number) => pad + ((maxS - s) / range) * (height - pad * 2);

  const points = scores.map((s, i) => `${toX(i)},${toY(s)}`).join(" ");
  const lastX = toX(scores.length - 1);
  const lastY = toY(scores[scores.length - 1]);

  // Build fill path (close down to bottom)
  const fillPath =
    `M ${toX(0)},${toY(scores[0])} ` +
    scores
      .slice(1)
      .map((s, i) => `L ${toX(i + 1)},${toY(s)}`)
      .join(" ") +
    ` L ${lastX},${height} L ${pad},${height} Z`;

  return (
    <svg width={width} height={height} overflow="visible">
      <defs>
        <linearGradient
          id={`sg-${color.replace(/[^a-z0-9]/gi, "")}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d={fillPath}
        fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, "")})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Terminal dot */}
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
      <circle
        cx={lastX}
        cy={lastY}
        r={4}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.4}
      />
    </svg>
  );
}

export function ReputationSparkline({
  pubkey,
  color,
}: {
  pubkey: string;
  color: string;
}) {
  const [events, setEvents] = useState<RepEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHistory(pubkey)
      .then((d) => {
        if (!cancelled) setEvents(d.events);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pubkey]);

  if (events === null) {
    return (
      <div className="flex items-center gap-1">
        <div className="w-[120px] h-[32px] flex items-center justify-center">
          <div
            className="text-[9px] tracking-[0.14em] uppercase font-semibold animate-pulse"
            style={{ color: "var(--color-ash)" }}
          >
            LOADING
          </div>
        </div>
      </div>
    );
  }

  const latest = events[events.length - 1];
  const confirmCount = events.filter((e) => e.type === "confirm").length;

  return (
    <div className="flex flex-col items-end gap-1">
      <Sparkline events={events} color={color} />
      <div className="text-[9px] tracking-[0.12em] uppercase font-semibold text-[var(--color-ash)]">
        {events.length === 0
          ? "NO ON-CHAIN EVENTS"
          : `${confirmCount} CONFIRMED · PEAK ${latest ? Math.max(...events.map((e) => e.score)) : 0}`}
      </div>
    </div>
  );
}
