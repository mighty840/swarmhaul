import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { AgentReputation, Package } from "@swarmhaul/types";
import { Panel } from "../components/Panel.js";
import { useErrorReporter } from "../components/ErrorBanner.js";
import { useConfirmDelivery } from "../hooks/useConfirmDelivery.js";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const EXPLORER_BASE = "https://explorer.solana.com";
const LEG_COLORS = [
  "var(--color-phosphor)",
  "var(--color-magenta)",
  "var(--color-cyan)",
  "var(--color-amber)",
];

interface RawLeg {
  id: string;
  legIndex: number;
  agentPubkey: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  distanceKm: number;
  estimatedDurationMin: number;
  agreedPaymentSol: number;
  status: string;
  confirmSignature?: string | null;
  onChainLeg?: string | null;
  completedAt?: string | null;
}

interface RawSwarm {
  id: string;
  packageId: string;
  status: string;
  totalCostSol: number;
  onChainSwarm?: string | null;
  formSignature?: string | null;
  formedAt?: string;
  legs: RawLeg[];
}

interface RawPackage {
  id: string;
  shipperPubkey: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  description: string;
  weightKg: number;
  volumeLitres: number;
  maxBudgetSol: number;
  status: string;
  listedAt: string;
  deliveredAt?: string | null;
  onChainPackage?: string | null;
  listSignature?: string | null;
  swarm?: RawSwarm | null;
}

function shortenPubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}··${pk.slice(-4)}`;
}

const STATUS_COLOR: Record<string, string> = {
  delivered: "var(--color-phosphor)",
  in_transit: "var(--color-amber)",
  swarm_forming: "var(--color-magenta)",
  settled: "var(--color-phosphor)",
  forming: "var(--color-magenta)",
  pending: "var(--color-cyan)",
  completed: "var(--color-phosphor)",
  listed: "var(--color-cyan)",
  failed: "var(--color-blood)",
};

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "var(--color-ash)";
  return (
    <span className="status-pill" style={{ color }}>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      />
      {status.replace(/_/g, " ")}
    </span>
  );
}

// Lifecycle phases shown as a horizontal progression strip. Derived
// entirely from package.status + per-leg status; no extra API calls.
type PhaseKey = "listed" | "swarm_formed" | "in_transit" | "delivered" | "failed";

interface Phase {
  key: PhaseKey;
  label: string;
  reached: boolean;
  current: boolean;
}

function deriveLifecyclePhases(
  pkgStatus: string,
  swarmStatus: string | null | undefined,
  completedLegs: number,
  totalLegs: number,
): Phase[] {
  // Map canonical pkg status → lifecycle index (0..3). `failed` is a
  // terminal sidestream we render in red.
  let currentIdx: number;
  switch (pkgStatus) {
    case "listed":
      currentIdx = swarmStatus === "forming" || swarmStatus === "active" ? 1 : 0;
      break;
    case "swarm_forming":
      currentIdx = 1;
      break;
    case "in_transit":
      currentIdx = 2;
      break;
    case "delivered":
      currentIdx = 3;
      break;
    case "failed":
      return [
        { key: "failed", label: "FAILED", reached: true, current: true },
      ];
    default:
      currentIdx = 0;
  }

  // Mid-delivery hint: once any leg has confirmed but not all, treat
  // the phase as IN TRANSIT even if the DB mirror hasn't caught up.
  if (currentIdx === 1 && totalLegs > 0 && completedLegs > 0 && completedLegs < totalLegs) {
    currentIdx = 2;
  }

  const phases: Array<Omit<Phase, "reached" | "current">> = [
    { key: "listed", label: "LISTED" },
    { key: "swarm_formed", label: "SWARM FORMED" },
    { key: "in_transit", label: "IN TRANSIT" },
    { key: "delivered", label: "DELIVERED" },
  ];
  return phases.map((p, idx) => ({
    ...p,
    reached: idx <= currentIdx,
    current: idx === currentIdx,
  }));
}

function LifecycleTimeline({ phases }: { phases: Phase[] }) {
  if (phases.length === 1 && phases[0].key === "failed") {
    return (
      <div className="mt-3 flex items-center gap-2 text-[10px] tracking-[0.16em] font-semibold uppercase text-[var(--color-blood)]">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: "var(--color-blood)",
            boxShadow: "0 0 6px var(--color-blood)",
          }}
        />
        LIFECYCLE ▸ FAILED
      </div>
    );
  }

  return (
    <div
      className="mt-4 flex items-center gap-0 flex-wrap"
      aria-label="Swarm lifecycle"
    >
      {phases.map((p, idx) => {
        const dotColor = p.current
          ? "var(--color-cyan)"
          : p.reached
            ? "var(--color-phosphor)"
            : "var(--color-faint)";
        const textColor = p.current
          ? "var(--color-bone)"
          : p.reached
            ? "var(--color-steel)"
            : "var(--color-faint)";
        return (
          <div key={p.key} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: dotColor,
                  boxShadow: p.current ? `0 0 8px ${dotColor}` : "none",
                }}
              />
              <span
                className="text-[9px] tracking-[0.18em] font-semibold uppercase"
                style={{ color: textColor }}
              >
                {p.label}
              </span>
            </div>
            {idx < phases.length - 1 && (
              <span
                className="mx-2 h-px w-6"
                style={{
                  backgroundColor: phases[idx + 1].reached
                    ? "var(--color-phosphor)"
                    : "var(--color-faint)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MiniMap({ pkg, legs }: { pkg: RawPackage; legs: RawLeg[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;

      const map = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        { maxZoom: 19 },
      ).addTo(map);
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
        { maxZoom: 19, opacity: 0.55 },
      ).addTo(map);

      const bounds: [number, number][] = [
        [pkg.originLat, pkg.originLng],
        [pkg.destLat, pkg.destLng],
      ];

      L.circleMarker([pkg.originLat, pkg.originLng], {
        radius: 7,
        color: "#00d4ff",
        fillColor: "#00d4ff",
        fillOpacity: 0.6,
        weight: 2,
      }).addTo(map);
      L.circleMarker([pkg.destLat, pkg.destLng], {
        radius: 6,
        color: "#00d4ff",
        fillColor: "transparent",
        weight: 2,
        dashArray: "3",
      }).addTo(map);

      const accentHex = [
        "#00ff9c",
        "#ff2d8a",
        "#00d4ff",
        "#ffb800",
      ];
      legs
        .slice()
        .sort((a, b) => a.legIndex - b.legIndex)
        .forEach((leg, idx) => {
          const c = accentHex[idx % accentHex.length];
          L.polyline(
            [
              [leg.pickupLat, leg.pickupLng],
              [leg.dropoffLat, leg.dropoffLng],
            ],
            { color: c, weight: 3, opacity: 0.9 },
          ).addTo(map);
          bounds.push([leg.pickupLat, leg.pickupLng]);
          bounds.push([leg.dropoffLat, leg.dropoffLng]);
          if (idx > 0) {
            L.circleMarker([leg.pickupLat, leg.pickupLng], {
              radius: 4,
              color: c,
              fillColor: "#06060a",
              fillOpacity: 1,
              weight: 2,
            }).addTo(map);
          }
        });

      map.fitBounds(bounds as any, { padding: [24, 24] });
      mapInstanceRef.current = map;
    });

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, [pkg, legs]);

  return <div ref={mapRef} className="h-[360px] w-full bg-[var(--color-void)]" />;
}

export function SwarmDetailView({
  packageId,
  leaderboard,
  onBack,
}: {
  packageId: string;
  leaderboard: AgentReputation[];
  onBack: () => void;
}) {
  const [pkg, setPkg] = useState<RawPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const { push } = useErrorReporter();
  const { publicKey } = useWallet();
  const { confirm, phase, reset } = useConfirmDelivery();
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API_URL}/packages/${packageId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setPkg(data);
      })
      .catch((err) => {
        push(
          `Could not load swarm for package ${packageId.slice(0, 8)}: ${err.message ?? err}`,
          "swarm-detail",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [packageId, push, refreshTick]);

  useEffect(() => {
    if (phase.kind === "done") {
      const t = setTimeout(() => {
        setRefreshTick((n) => n + 1);
        reset();
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [phase, reset]);

  if (loading && !pkg) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="cursor text-[var(--color-phosphor)] text-[12px] tracking-[0.18em] uppercase font-bold">
          LOADING SWARM
        </span>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="space-y-4 glitch-in">
        <button className="btn-secondary" onClick={onBack}>
          ◂ BACK
        </button>
        <Panel title="NOT FOUND" accent="magenta">
          <div className="p-6 text-[12px] text-[var(--color-bone)]">
            No package found for id{" "}
            <span className="pubkey">{packageId.slice(0, 12)}</span>.
          </div>
        </Panel>
      </div>
    );
  }

  const swarm = pkg.swarm ?? null;
  const legs = (swarm?.legs ?? []).slice().sort((a, b) => a.legIndex - b.legIndex);
  const repByAgent = new Map(leaderboard.map((a) => [a.agentPubkey, a]));

  const totalPaid = legs.reduce((s, l) => s + l.agreedPaymentSol, 0);
  const totalDistance = legs.reduce((s, l) => s + l.distanceKm, 0);
  const completedCount = legs.filter((l) => l.status === "completed").length;

  const viewerIsShipper =
    !!publicKey && publicKey.toBase58() === pkg.shipperPubkey;
  const activeConfirmLegId =
    phase.kind !== "idle" && phase.kind !== "done" && phase.kind !== "error"
      ? (phase as { legId?: string }).legId
      : null;
  const confirmInFlight =
    phase.kind === "building" ||
    phase.kind === "awaiting-signature" ||
    phase.kind === "sending" ||
    phase.kind === "confirming" ||
    phase.kind === "persisting";
  const phaseLabel: Record<string, string> = {
    building: "BUILDING TX…",
    "awaiting-signature": "AWAITING WALLET SIGNATURE…",
    sending: "SENDING…",
    confirming: "CONFIRMING ON-CHAIN…",
    persisting: "PERSISTING…",
    done: "CONFIRMED ✓",
  };

  return (
    <div className="space-y-5 glitch-in">
      {/* Hero */}
      <div className="flex items-end justify-between border-b border-[var(--color-line)] pb-4 gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <button
              className="btn-secondary"
              onClick={onBack}
              aria-label="back"
            >
              ◂ BACK
            </button>
            <div className="label">▸ SWARM INSPECTOR</div>
          </div>
          <h1 className="text-[30px] leading-[1.05] tracking-[-0.02em] font-light text-[var(--color-bone)] truncate">
            <span className="display-serif text-[var(--color-magenta)]">
              Swarm
            </span>{" "}
            {pkg.description}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusPill status={pkg.status} />
            {swarm && <StatusPill status={swarm.status} />}
            <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--color-steel)]">
              PKG {shortenPubkey(pkg.id)}
            </span>
            {pkg.onChainPackage && (
              <a
                href={`${EXPLORER_BASE}/address/${pkg.onChainPackage}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--color-cyan)] hover:underline"
              >
                ON-CHAIN ▸ {shortenPubkey(pkg.onChainPackage)}
              </a>
            )}
          </div>
          <LifecycleTimeline
            phases={deriveLifecyclePhases(
              pkg.status,
              swarm?.status,
              completedCount,
              legs.length,
            )}
          />
        </div>
        <div className="text-right shrink-0">
          <div className="label mb-1">BUDGET</div>
          <div className="text-[28px] font-light leading-none tabular-nums text-[var(--color-bone)]">
            {pkg.maxBudgetSol}{" "}
            <span className="text-[12px] text-[var(--color-ash)] font-semibold tracking-[0.14em]">
              SOL
            </span>
          </div>
        </div>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="panel p-4">
          <div className="label mb-1.5">LEGS</div>
          <div className="stat-num-sm">
            {completedCount}/{legs.length || "0"}
          </div>
          <div className="label-muted mt-1">COMPLETED / TOTAL</div>
        </div>
        <div className="panel p-4">
          <div className="label mb-1.5">DISTANCE</div>
          <div className="stat-num-sm">
            {totalDistance.toFixed(2)}{" "}
            <span className="text-[11px] text-[var(--color-ash)] font-semibold">
              KM
            </span>
          </div>
          <div className="label-muted mt-1">SUM OF LEGS</div>
        </div>
        <div className="panel p-4">
          <div className="label mb-1.5">PAYOUT</div>
          <div className="stat-num-sm">
            {totalPaid.toFixed(4)}{" "}
            <span className="text-[11px] text-[var(--color-ash)] font-semibold">
              SOL
            </span>
          </div>
          <div className="label-muted mt-1">
            {pkg.maxBudgetSol > 0
              ? `${Math.round((totalPaid / pkg.maxBudgetSol) * 100)}% OF BUDGET`
              : "— NO BUDGET"}
          </div>
        </div>
        <div className="panel p-4">
          <div className="label mb-1.5">WEIGHT · VOLUME</div>
          <div className="stat-num-sm">
            {pkg.weightKg}
            <span className="text-[11px] text-[var(--color-ash)] font-semibold">
              KG
            </span>{" "}
            / {pkg.volumeLitres}
            <span className="text-[11px] text-[var(--color-ash)] font-semibold">
              L
            </span>
          </div>
          <div className="label-muted mt-1">PAYLOAD SPEC</div>
        </div>
      </div>

      {/* Map preview */}
      <Panel
        title="ROUTE PREVIEW"
        meta={`${legs.length} LEGS · PER-LEG COLORS`}
        accent="cyan"
      >
        <MiniMap pkg={pkg} legs={legs} />
      </Panel>

      {/* Legs list */}
      <Panel
        title="LEG BREAKDOWN ▸ EXECUTION SEQUENCE"
        meta={
          swarm?.formSignature ? (
            <a
              href={`${EXPLORER_BASE}/tx/${swarm.formSignature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--color-cyan)]"
            >
              FORM TX ▸ {swarm.formSignature.slice(0, 10)}…
            </a>
          ) : (
            "NO SWARM YET"
          )
        }
        accent="magenta"
      >
        {legs.length === 0 ? (
          <div className="p-6 text-[11px] text-[var(--color-ash)] text-center">
            ░░ awaiting bids — swarm has not formed yet ░░
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-line)]">
            {legs.map((leg, idx) => {
              const color = LEG_COLORS[idx % LEG_COLORS.length];
              const rep = repByAgent.get(leg.agentPubkey);
              return (
                <div
                  key={leg.id}
                  className="p-4 grid grid-cols-12 gap-3 items-start hover:bg-[var(--color-hover)]"
                >
                  {/* Leg index + color rail */}
                  <div className="col-span-1 flex flex-col items-center gap-2">
                    <div
                      className="w-8 h-8 flex items-center justify-center border-2 text-[13px] font-bold tabular-nums"
                      style={{ borderColor: color, color }}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </div>
                    <div
                      className="w-0.5 flex-1 min-h-[20px]"
                      style={{ backgroundColor: color, opacity: 0.5 }}
                    />
                  </div>

                  {/* Agent + coords */}
                  <div className="col-span-12 lg:col-span-5 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className="pubkey text-[12px]"
                        style={{ color }}
                      >
                        {shortenPubkey(leg.agentPubkey)}
                      </span>
                      {rep && (
                        <span className="status-pill text-[var(--color-bone)] border-[var(--color-line-hot)]">
                          REP {rep.reliabilityScore}
                        </span>
                      )}
                      <StatusPill status={leg.status} />
                    </div>
                    <div className="text-[10px] text-[var(--color-steel)] font-mono space-y-0.5">
                      <div>
                        <span className="text-[var(--color-ash)]">
                          PICKUP ▸{" "}
                        </span>
                        {leg.pickupLat.toFixed(4)}, {leg.pickupLng.toFixed(4)}
                      </div>
                      <div>
                        <span className="text-[var(--color-ash)]">
                          DROPOFF ▸{" "}
                        </span>
                        {leg.dropoffLat.toFixed(4)}, {leg.dropoffLng.toFixed(4)}
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="col-span-6 lg:col-span-3 space-y-1">
                    <div className="label-muted">DISTANCE / DURATION</div>
                    <div className="text-[12px] text-[var(--color-bone)] tabular-nums font-semibold">
                      {leg.distanceKm.toFixed(2)} KM · {leg.estimatedDurationMin}{" "}
                      MIN
                    </div>
                  </div>

                  <div className="col-span-6 lg:col-span-3 text-right">
                    <div className="label-muted">AGREED PAYMENT</div>
                    <div className="text-[16px] font-light leading-tight text-[var(--color-bone)] tabular-nums">
                      {leg.agreedPaymentSol.toFixed(4)}{" "}
                      <span className="text-[10px] text-[var(--color-ash)] font-semibold">
                        SOL
                      </span>
                    </div>
                    {leg.confirmSignature && (
                      <a
                        href={`${EXPLORER_BASE}/tx/${leg.confirmSignature}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9px] tracking-[0.14em] uppercase text-[var(--color-phosphor)] hover:underline font-semibold"
                      >
                        CONFIRM TX ▸ {leg.confirmSignature.slice(0, 6)}…
                      </a>
                    )}
                    {!leg.confirmSignature && leg.onChainLeg && (
                      <a
                        href={`${EXPLORER_BASE}/address/${leg.onChainLeg}?cluster=devnet`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9px] tracking-[0.14em] uppercase text-[var(--color-cyan)] hover:underline font-semibold"
                      >
                        LEG ACCT ▸ {leg.onChainLeg.slice(0, 6)}…
                      </a>
                    )}
                    {viewerIsShipper &&
                      leg.status === "pending" &&
                      leg.onChainLeg &&
                      swarm?.onChainSwarm &&
                      pkg.onChainPackage && (
                        <div className="mt-3 flex flex-col items-end gap-1">
                          <button
                            className="btn-primary"
                            disabled={confirmInFlight}
                            onClick={() =>
                              confirm({
                                legId: leg.id,
                                courierPubkey: leg.agentPubkey,
                              })
                            }
                          >
                            {confirmInFlight && activeConfirmLegId === leg.id
                              ? phaseLabel[phase.kind] ?? "WORKING…"
                              : "CONFIRM DELIVERY"}
                          </button>
                          {phase.kind === "error" && (
                            <span className="text-[9px] tracking-[0.12em] uppercase text-[var(--color-blood)] max-w-[240px] text-right">
                              {phase.message.slice(0, 120)}
                            </span>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
