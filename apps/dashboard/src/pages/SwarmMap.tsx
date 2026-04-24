import { useEffect, useRef } from "react";
import type { Package } from "@swarmhaul/types";
import { Panel } from "../components/Panel.js";

let L: typeof import("leaflet") | null = null;

const STATUS_COLORS: Record<string, string> = {
  listed: "#00d4ff",
  swarm_forming: "#ff2d8a",
  in_transit: "#ffb800",
  delivered: "#00ff9c",
  failed: "#ff3344",
};

const STATUS_LABEL: Record<string, string> = {
  listed: "LISTED",
  swarm_forming: "SWARM FORMING",
  in_transit: "IN TRANSIT",
  delivered: "DELIVERED",
  failed: "FAILED",
};

// Per-leg color cycle so multi-leg swarms are visually distinct
const LEG_COLORS = ["#00ff9c", "#ff2d8a", "#00d4ff", "#ffb800"];

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
}

interface RawPackage extends Package {
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
  swarm?: {
    id: string;
    status: string;
    legs?: RawLeg[];
  } | null;
}

function readCoords(pkg: RawPackage) {
  const oLat = pkg.originLat ?? pkg.origin?.lat;
  const oLng = pkg.originLng ?? pkg.origin?.lng;
  const dLat = pkg.destLat ?? pkg.destination?.lat;
  const dLng = pkg.destLng ?? pkg.destination?.lng;
  if (
    !Number.isFinite(oLat) ||
    !Number.isFinite(oLng) ||
    !Number.isFinite(dLat) ||
    !Number.isFinite(dLng)
  ) {
    return null;
  }
  return { oLat: oLat!, oLng: oLng!, dLat: dLat!, dLng: dLng! };
}

function shortenPubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}··${pk.slice(-4)}`;
}

export function SwarmMap({
  packages,
  onOpenSwarm,
}: {
  packages: Package[];
  onOpenSwarm?: (packageId: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const openHandlerRef = useRef<((id: string) => void) | undefined>(
    onOpenSwarm,
  );

  // Keep the latest handler reachable from popup HTML (which lives outside
  // React's tree) without tearing markers down on every re-render.
  useEffect(() => {
    openHandlerRef.current = onOpenSwarm;
    (window as any).__swarmhaulOpenSwarm = (id: string) =>
      openHandlerRef.current?.(id);
  }, [onOpenSwarm]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((leaflet) => {
      L = leaflet;
      const map = L.map(mapRef.current!, {
        center: [48.137, 11.575],
        zoom: 13,
        zoomControl: false,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        {
          attribution: "© CARTO © OSM",
          maxZoom: 19,
        },
      ).addTo(map);

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
        { maxZoom: 19, opacity: 0.6 },
      ).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      mapInstanceRef.current = map;
    });

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;
    const map = mapInstanceRef.current;
    const Lref = L;

    map.eachLayer((layer) => {
      if ((layer as any)._swarmhaul) map.removeLayer(layer);
    });

    for (const raw of packages as RawPackage[]) {
      const coords = readCoords(raw);
      if (!coords) continue;
      const { oLat, oLng, dLat, dLng } = coords;
      const color = STATUS_COLORS[raw.status] ?? "#9898a5";

      const originMarker = Lref.circleMarker([oLat, oLng], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.5,
        weight: 2,
      }).addTo(map);
      (originMarker as any)._swarmhaul = true;

      const destMarker = Lref.circleMarker([dLat, dLng], {
        radius: 6,
        color,
        fillColor: "transparent",
        weight: 2,
        dashArray: "3",
      }).addTo(map);
      (destMarker as any)._swarmhaul = true;

      const legs = raw.swarm?.legs ?? [];
      if (legs.length > 0) {
        legs
          .slice()
          .sort((a, b) => a.legIndex - b.legIndex)
          .forEach((leg, idx) => {
            const legColor = LEG_COLORS[idx % LEG_COLORS.length];
            const legLine = Lref.polyline(
              [
                [leg.pickupLat, leg.pickupLng],
                [leg.dropoffLat, leg.dropoffLng],
              ],
              {
                color: legColor,
                weight: 3,
                opacity: 0.9,
              },
            ).addTo(map);
            (legLine as any)._swarmhaul = true;

            // Handoff marker at the pickup of every leg after the first
            if (idx > 0) {
              const handoff = Lref.circleMarker(
                [leg.pickupLat, leg.pickupLng],
                {
                  radius: 4,
                  color: legColor,
                  fillColor: "#06060a",
                  fillOpacity: 1,
                  weight: 2,
                },
              ).addTo(map);
              (handoff as any)._swarmhaul = true;
              handoff.bindTooltip(
                `HANDOFF ▸ ${shortenPubkey(leg.agentPubkey)}`,
                { direction: "top", offset: [0, -8] },
              );
            }
          });
      } else {
        // No swarm yet — draw a dashed preview of the full route
        const preview = Lref.polyline(
          [
            [oLat, oLng],
            [dLat, dLng],
          ],
          {
            color,
            weight: 1.5,
            opacity: 0.5,
            dashArray: "6 4",
          },
        ).addTo(map);
        (preview as any)._swarmhaul = true;
      }

      const hasSwarm = Boolean(raw.swarm);
      const swarmBadge = hasSwarm
        ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #24243a">
             <div style="font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#9898a5;font-weight:600;margin-bottom:4px">SWARM ▸ ${legs.length} LEGS</div>
             <button
               type="button"
               onclick="window.__swarmhaulOpenSwarm && window.__swarmhaulOpenSwarm('${raw.id}')"
               style="width:100%;padding:6px 10px;background:#00ff9c;color:#06060a;border:1px solid #00ff9c;font-family:JetBrains Mono,monospace;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer"
             >▸ INSPECT SWARM</button>
           </div>`
        : `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #24243a;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#6a6a7a;font-weight:600">AWAITING BIDS</div>`;

      originMarker.bindPopup(
        `<div style="min-width:220px">
          <div style="color:${color};font-size:9px;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:6px;font-weight:700">${STATUS_LABEL[raw.status] ?? raw.status}</div>
          <div style="color:#f4f4f1;font-size:12px;font-weight:600;margin-bottom:8px">${raw.description ?? ""}</div>
          <div style="font-size:10px;color:#c8c8d0;line-height:1.7">
            <div>BUDGET ▸ <span style="color:#f4f4f1;font-weight:600">${(raw as any).maxBudgetSol} SOL</span></div>
            <div>WEIGHT ▸ <span style="color:#f4f4f1;font-weight:600">${(raw as any).weightKg} KG</span></div>
            <div>VOLUME ▸ <span style="color:#f4f4f1;font-weight:600">${(raw as any).volumeLitres} L</span></div>
          </div>
          ${swarmBadge}
        </div>`,
      );
    }
  }, [packages]);

  const withSwarms = (packages as RawPackage[]).filter((p) => p.swarm).length;

  return (
    <div className="space-y-4 glitch-in">
      <div className="flex items-end justify-between border-b border-[var(--color-line)] pb-4">
        <div>
          <div className="label mb-2">▸ GEOSPATIAL VIEW</div>
          <h1 className="text-[32px] leading-none tracking-[-0.02em] font-light text-[var(--color-bone)]">
            <span className="display-serif text-[var(--color-cyan)]">Swarm</span>{" "}
            Map
          </h1>
        </div>
        <div className="text-right">
          <div className="label mb-1">REGION</div>
          <div className="text-[12px] tracking-[0.14em] text-[var(--color-bone)] font-semibold tabular-nums">
            48.137° N · 11.575° E
          </div>
          <div className="text-[10px] font-semibold text-[var(--color-steel)] tracking-[0.14em]">
            MUNICH ▸ DE
          </div>
        </div>
      </div>

      <Panel
        title="LIVE GEOSPATIAL TRACKING"
        meta={`${packages.length} PACKAGES · ${withSwarms} ACTIVE SWARMS`}
        accent="cyan"
      >
        <div className="relative">
          <div ref={mapRef} className="h-[calc(100vh-280px)] min-h-[480px]" />

          <div className="absolute top-4 left-4 panel z-[400] w-[160px] sm:w-[200px]">
            <div className="panel-header">
              <span className="panel-title">STATUS LEGEND</span>
            </div>
            <div className="p-3 space-y-2">
              {Object.entries(STATUS_COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-2.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 8px ${color}`,
                    }}
                  />
                  <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--color-bone)]">
                    {STATUS_LABEL[status]}
                  </span>
                </div>
              ))}
              <div className="pt-2 mt-2 border-t border-[var(--color-line)] space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-5 h-0.5"
                    style={{ backgroundColor: LEG_COLORS[0] }}
                  />
                  <span className="text-[9px] tracking-[0.14em] uppercase text-[var(--color-steel)] font-semibold">
                    LEG ROUTE
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-2 h-2 rounded-full border-2"
                    style={{
                      borderColor: LEG_COLORS[1],
                      backgroundColor: "#06060a",
                    }}
                  />
                  <span className="text-[9px] tracking-[0.14em] uppercase text-[var(--color-steel)] font-semibold">
                    HANDOFF
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-4 left-4 panel z-[400]">
            <div className="px-3 py-2 flex items-center gap-3">
              <div className="dot-live" />
              <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[var(--color-bone)]">
                TRACKING {packages.length} OBJECTS
              </span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
