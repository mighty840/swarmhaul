import { useEffect, useState } from "react";
import { Panel } from "./Panel.js";

const API_BASE =
  import.meta.env.VITE_API_URL ?? "https://api.swarmhaul.defited.com";

interface RewardClaim {
  id: string;
  devnetPubkey: string;
  devnetEarningsLamports: string;
  claimedAt: string;
  status: string;
}

let cache: { data: RewardClaim[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

async function fetchClaims(): Promise<RewardClaim[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }
  const res = await fetch(`${API_BASE}/reward-claims/public`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: RewardClaim[] = await res.json();
  cache = { data, fetchedAt: Date.now() };
  return data;
}

function shortenPubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}··${pk.slice(-4)}`;
}

function lamportsToSol(lamports: string): number {
  try {
    return Number(BigInt(lamports)) / 1_000_000_000;
  } catch {
    return 0;
  }
}

function statusStyle(status: string): { color: string; label: string } {
  const s = status.toLowerCase();
  if (s === "paid" || s === "settled" || s === "complete" || s === "completed") {
    return { color: "var(--color-phosphor)", label: "PAID" };
  }
  if (s === "pending" || s === "queued") {
    return { color: "var(--color-amber)", label: "PENDING" };
  }
  if (s === "failed" || s === "rejected") {
    return { color: "var(--color-blood)", label: status.toUpperCase() };
  }
  return { color: "var(--color-steel)", label: status.toUpperCase() };
}

export function ClaimedRewardsPanel({ className = "" }: { className?: string }) {
  const [claims, setClaims] = useState<RewardClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchClaims()
      .then((d) => {
        if (!cancelled) setClaims(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalSol = (claims ?? []).reduce(
    (acc, c) => acc + lamportsToSol(c.devnetEarningsLamports),
    0,
  );
  const topClaims = (claims ?? []).slice(0, 7);

  return (
    <Panel
      title="CLAIMED REWARDS ▸ DEVNET PAYOUTS"
      meta={
        claims === null
          ? "LOADING"
          : `${claims.length} CLAIMS · ${totalSol.toFixed(3)} SOL`
      }
      accent="amber"
      className={className}
    >
      <div className="p-4">
        {/* Summary header */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] px-3 py-2.5">
            <div className="label mb-1">TOTAL CLAIMED</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[20px] font-light tabular-nums text-[var(--color-amber)]">
                {totalSol.toFixed(3)}
              </span>
              <span className="text-[10px] text-[var(--color-ash)] tracking-[0.16em] uppercase font-semibold">
                SOL
              </span>
            </div>
          </div>
          <div className="border border-[var(--color-line)] bg-[var(--color-graphite)] px-3 py-2.5">
            <div className="label mb-1">AGENTS PAID</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[20px] font-light tabular-nums text-[var(--color-bone)]">
                {claims === null ? "—" : claims.length.toString().padStart(2, "0")}
              </span>
              <span className="text-[10px] text-[var(--color-ash)] tracking-[0.16em] uppercase font-semibold">
                CLAIMANTS
              </span>
            </div>
          </div>
        </div>

        {/* Claim list */}
        {error && (
          <div className="text-[var(--color-blood)] text-[11px] py-3 text-center tracking-[0.12em] uppercase font-semibold">
            ░░ FAILED TO LOAD CLAIMS ░░
          </div>
        )}
        {claims === null && !error && (
          <div className="text-[var(--color-ash)] text-[11px] py-3 text-center tracking-[0.12em] uppercase font-semibold animate-pulse">
            ░░ LOADING CLAIMS ░░
          </div>
        )}
        {claims !== null && claims.length === 0 && !error && (
          <div className="text-[var(--color-ash)] text-[11px] py-3 text-center">
            ░░ NO CLAIMS YET ░░
          </div>
        )}
        {topClaims.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-2 pb-1.5 border-b border-[var(--color-line)]">
              <span className="label flex-none w-6 text-right">#</span>
              <span className="label flex-1">DEVNET PUBKEY</span>
              <span className="label text-right">AMOUNT</span>
              <span className="label flex-none w-16 text-right">STATUS</span>
            </div>
            {topClaims.map((claim, i) => {
              const sol = lamportsToSol(claim.devnetEarningsLamports);
              const { color, label } = statusStyle(claim.status);
              return (
                <div
                  key={claim.id}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--color-hover)] border-b border-[var(--color-line)] last:border-b-0"
                >
                  <span className="text-[11px] text-[var(--color-steel)] tabular-nums font-semibold w-6 text-right">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[11px] font-bold tracking-[0.04em] flex-1 text-[var(--color-bone)] font-mono">
                    {shortenPubkey(claim.devnetPubkey)}
                  </span>
                  <span className="text-[12px] tabular-nums font-bold text-[var(--color-amber)]">
                    {sol.toFixed(3)}
                    <span className="text-[9px] text-[var(--color-ash)] ml-1 font-semibold">
                      SOL
                    </span>
                  </span>
                  <span
                    className="text-[9px] font-bold tracking-[0.14em] px-1.5 py-0.5 w-16 text-center"
                    style={{
                      color,
                      border: `1px solid ${color}`,
                      opacity: 0.85,
                    }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {claims !== null && claims.length > topClaims.length && (
          <div className="mt-3 text-[9px] text-[var(--color-ash)] tracking-[0.14em] uppercase font-semibold text-center">
            ▸ {claims.length - topClaims.length} MORE CLAIMS BELOW THE FOLD
          </div>
        )}
      </div>
    </Panel>
  );
}
