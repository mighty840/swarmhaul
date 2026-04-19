import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export type ViewKey =
  | "economy"
  | "map"
  | "shipper"
  | "courier"
  | "reputation"
  | "swarm-detail";

interface StatusBarProps {
  connected: boolean;
  packagesActive: number;
  bidsTotal: number;
  agentsTotal: number;
  view: ViewKey;
  onViewChange: (view: ViewKey) => void;
}

const VIEWS: Array<{
  key: Exclude<ViewKey, "swarm-detail">;
  label: string;
  idx: string;
}> = [
  { key: "economy", label: "OBSERVATORY", idx: "01" },
  { key: "map", label: "SWARM MAP", idx: "02" },
  { key: "shipper", label: "DISPATCH", idx: "03" },
  { key: "courier", label: "COURIERS", idx: "04" },
  { key: "reputation", label: "REPUTATION", idx: "05" },
];

export function StatusBar({
  connected,
  packagesActive,
  bidsTotal,
  agentsTotal,
  view,
  onViewChange,
}: StatusBarProps) {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const ts = time
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z/, " UTC");

  return (
    <header className="border-b border-[var(--color-line)] bg-[var(--color-graphite)]">
      {/* Top row: brand + time + status */}
      <div className="flex items-center justify-between px-4 h-11 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => onViewChange("economy")}
            className="flex items-center gap-2.5 group cursor-pointer"
            aria-label="SwarmHaul — back to observatory"
          >
            <img
              src="/logo.svg"
              alt=""
              width={24}
              height={24}
              className="transition-[filter] duration-200 group-hover:[filter:drop-shadow(0_0_6px_rgba(0,212,255,0.55))]"
              style={{ filter: "drop-shadow(0 0 4px rgba(0,212,255,0.35))" }}
            />
            <span className="text-[15px] font-bold tracking-[0.04em] text-[var(--color-bone)]">
              SWARMHAUL
            </span>
            <span className="hidden sm:inline text-[10px] tracking-[0.14em] uppercase text-[var(--color-steel)]">
              / AGENT COORDINATION PROTOCOL
            </span>
          </button>

          <div className="hidden md:flex items-center gap-2 px-2 py-0.5 border border-[var(--color-line-hot)]">
            <span className="text-[9px] tracking-[0.16em] text-[var(--color-ash)]">
              v0.1.0
            </span>
            {import.meta.env.VITE_COMMIT_SHA &&
              import.meta.env.VITE_COMMIT_SHA !== "dev" && (
                <>
                  <span className="text-[var(--color-faint)]">│</span>
                  <a
                    href={`https://github.com/mighty840/swarmhaul/commit/${import.meta.env.VITE_COMMIT_SHA}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] tracking-[0.12em] text-[var(--color-steel)] hover:text-[var(--color-phosphor)] font-mono"
                    title={import.meta.env.VITE_COMMIT_SHA}
                  >
                    {String(import.meta.env.VITE_COMMIT_SHA).slice(0, 7)}
                  </a>
                </>
              )}
          </div>

          <div className="hidden md:flex items-center gap-1.5">
            <div className={connected ? "dot-live" : "dot-dead"} />
            <span className="text-[9px] font-semibold tracking-[0.16em] uppercase text-[var(--color-steel)]">
              {connected ? "DEVNET ── LINKED" : "OFFLINE"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden lg:flex items-center gap-4 text-[10px]">
            <span className="text-[var(--color-ash)] tracking-[0.14em]">
              PKG{" "}
              <span className="text-[var(--color-bone)] font-semibold tabular-nums">
                {packagesActive}
              </span>
            </span>
            <span className="text-[var(--color-faint)]">│</span>
            <span className="text-[var(--color-ash)] tracking-[0.14em]">
              BID{" "}
              <span className="text-[var(--color-bone)] font-semibold tabular-nums">
                {bidsTotal}
              </span>
            </span>
            <span className="text-[var(--color-faint)]">│</span>
            <span className="text-[var(--color-ash)] tracking-[0.14em]">
              AGT{" "}
              <span className="text-[var(--color-bone)] font-semibold tabular-nums">
                {agentsTotal}
              </span>
            </span>
          </div>

          <span className="text-[10px] tracking-[0.1em] text-[var(--color-steel)] tabular-nums">
            {ts}
          </span>

          <WalletMultiButton />
        </div>
      </div>

      {/* Nav row */}
      <div className="flex items-center px-4 h-11">
        <div className="flex items-center gap-1">
          {VIEWS.map(({ key, label, idx }) => (
            <button
              key={key}
              onClick={() => onViewChange(key)}
              className={`btn-ghost flex items-center gap-2 ${view === key ? "active" : ""}`}
            >
              <span className="text-[8px] text-[var(--color-ash)]">{idx}</span>
              {label}
            </button>
          ))}
          {view === "swarm-detail" && (
            <button className="btn-ghost flex items-center gap-2 active" disabled>
              <span className="text-[8px] text-[var(--color-ash)]">◈</span>
              SWARM
            </button>
          )}
        </div>

        <div className="flex-1" />

        <div className="text-[9px] font-semibold tracking-[0.16em] uppercase text-[var(--color-steel)]">
          MUNICH OPS ▸ EU-CENTRAL ▸ NODE 38bV...rH6R
        </div>
      </div>
    </header>
  );
}
