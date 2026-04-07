import { useEffect, useState } from "react";

interface StatusBarProps {
  connected: boolean;
  packagesActive: number;
  bidsTotal: number;
  agentsTotal: number;
  view: string;
  onViewChange: (view: "map" | "shipper" | "courier" | "economy") => void;
}

const VIEWS: Array<{ key: "economy" | "map" | "shipper" | "courier"; label: string; idx: string }> = [
  { key: "economy", label: "OBSERVATORY", idx: "01" },
  { key: "map", label: "SWARM MAP", idx: "02" },
  { key: "shipper", label: "DISPATCH", idx: "03" },
  { key: "courier", label: "COURIERS", idx: "04" },
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
      <div className="flex items-center justify-between px-4 h-10 border-b border-[var(--color-line)]">
        <div className="flex items-center gap-5">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold tracking-[0.04em] text-[var(--color-bone)]">
              SWARMHAUL
            </span>
            <span className="editorial text-[12px] text-[var(--color-ash)]">
              /agent coordination protocol
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 border border-[var(--color-line-hot)]">
            <span className="text-[9px] tracking-[0.16em] text-[var(--color-dim)]">
              v0.1.0
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5">
            <div className={connected ? "dot-live" : "dot-dead"} />
            <span className="text-[9px] tracking-[0.16em] uppercase text-[var(--color-ash)]">
              {connected ? "DEVNET ── LINKED" : "OFFLINE"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden lg:flex items-center gap-4 text-[10px]">
            <span className="text-[var(--color-dim)] tracking-[0.14em]">
              PKG <span className="text-[var(--color-bone)] font-medium">{packagesActive}</span>
            </span>
            <span className="text-[var(--color-faint)]">│</span>
            <span className="text-[var(--color-dim)] tracking-[0.14em]">
              BID <span className="text-[var(--color-bone)] font-medium">{bidsTotal}</span>
            </span>
            <span className="text-[var(--color-faint)]">│</span>
            <span className="text-[var(--color-dim)] tracking-[0.14em]">
              AGT <span className="text-[var(--color-bone)] font-medium">{agentsTotal}</span>
            </span>
          </div>

          <span className="text-[10px] tracking-[0.1em] text-[var(--color-dim)] tabular-nums">
            {ts}
          </span>

          <button className="btn-primary">CONNECT WALLET</button>
        </div>
      </div>

      {/* Nav row */}
      <div className="flex items-center px-4 h-10">
        <div className="flex items-center gap-1">
          {VIEWS.map(({ key, label, idx }) => (
            <button
              key={key}
              onClick={() => onViewChange(key)}
              className={`btn-ghost flex items-center gap-2 ${view === key ? "active" : ""}`}
            >
              <span className="text-[8px] opacity-50">{idx}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="text-[9px] tracking-[0.16em] uppercase text-[var(--color-dim)]">
          MUNICH OPS ▸ EU-CENTRAL ▸ NODE 38bV...rH6R
        </div>
      </div>
    </header>
  );
}
