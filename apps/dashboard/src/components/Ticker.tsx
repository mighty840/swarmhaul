import type { WSEvent } from "@swarmhaul/types";

function formatEvent(evt: WSEvent): string {
  switch (evt.type) {
    case "PACKAGE_LISTED":
      return `LISTED ▸ ${evt.package.description.slice(0, 32)} ▸ ${evt.package.maxBudgetSol} SOL`;
    case "BID_RECEIVED":
      return `BID ▸ ${evt.bid.agentPubkey.slice(0, 12)} ▸ ${evt.bid.costSol} SOL`;
    case "SWARM_FORMED":
      return `SWARM ▸ ${evt.swarm.legs.length} LEGS ▸ ${evt.swarm.totalCostSol} SOL`;
    case "LEG_COMPLETED":
      return `LEG DONE ▸ ${evt.leg.agentPubkey.slice(0, 12)} ▸ ${evt.leg.agreedPaymentSol} SOL`;
    case "PACKAGE_DELIVERED":
      return `DELIVERED ▸ ${evt.packageId.slice(0, 12)}`;
    default:
      return evt.type;
  }
}

const PLACEHOLDERS = [
  "AWAITING TELEMETRY",
  "AGENTS IDLE",
  "SWARM COORDINATOR ONLINE",
  "ESCROW VAULTS LOCKED",
  "REPUTATION ENGINE ACTIVE",
  "PROTOCOL: SWARMHAUL/0.1",
];

export function Ticker({ events }: { events: WSEvent[] }) {
  const items =
    events.length > 0
      ? events.slice(0, 12).map(formatEvent)
      : PLACEHOLDERS;
  const doubled = [...items, ...items];

  return (
    <div className="border-y border-[var(--color-line)] bg-[var(--color-graphite)] overflow-hidden h-7 flex items-center">
      <div className="px-3 border-r border-[var(--color-line)] h-full flex items-center bg-[var(--color-elevated)]">
        <span className="text-[9px] tracking-[0.18em] uppercase text-[var(--color-phosphor)] font-semibold">
          ◉ LIVE FEED
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <div
          className="flex gap-12 whitespace-nowrap"
          style={{
            animation: "scroll-x 60s linear infinite",
            width: "max-content",
          }}
        >
          {doubled.map((item, i) => (
            <span
              key={i}
              className="text-[10px] tracking-[0.12em] text-[var(--color-ash)] py-2"
            >
              <span className="text-[var(--color-dim)]">▸</span> {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
