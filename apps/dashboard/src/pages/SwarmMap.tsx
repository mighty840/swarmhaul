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

export function SwarmMap({ packages }: { packages: Package[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

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

    map.eachLayer((layer) => {
      if ((layer as any)._swarmhaul) map.removeLayer(layer);
    });

    for (const pkg of packages) {
      const color = STATUS_COLORS[pkg.status] ?? "#6b7280";

      const originMarker = L.circleMarker([pkg.origin.lat, pkg.origin.lng], {
        radius: 7,
        color,
        fillColor: color,
        fillOpacity: 0.4,
        weight: 2,
      }).addTo(map);
      (originMarker as any)._swarmhaul = true;

      const destMarker = L.circleMarker(
        [pkg.destination.lat, pkg.destination.lng],
        {
          radius: 5,
          color,
          fillColor: "transparent",
          weight: 2,
          dashArray: "3",
        },
      ).addTo(map);
      (destMarker as any)._swarmhaul = true;

      const line = L.polyline(
        [
          [pkg.origin.lat, pkg.origin.lng],
          [pkg.destination.lat, pkg.destination.lng],
        ],
        {
          color,
          weight: 1.5,
          opacity: 0.5,
          dashArray: pkg.status === "in_transit" ? undefined : "6 4",
        },
      ).addTo(map);
      (line as any)._swarmhaul = true;

      originMarker.bindPopup(
        `<div style="min-width:180px">
          <div style="color:${color};font-size:9px;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:6px">${STATUS_LABEL[pkg.status]}</div>
          <div style="color:#f4f4f1;font-size:12px;font-weight:600;margin-bottom:8px">${pkg.description}</div>
          <div style="font-size:10px;color:#8a8a98;line-height:1.7">
            <div>BUDGET ▸ ${pkg.maxBudgetSol} SOL</div>
            <div>WEIGHT ▸ ${pkg.weightKg} KG</div>
            <div>VOLUME ▸ ${pkg.volumeLitres} L</div>
          </div>
        </div>`,
      );
    }
  }, [packages]);

  return (
    <div className="space-y-4 glitch-in">
      <div className="flex items-end justify-between border-b border-[var(--color-line)] pb-4">
        <div>
          <div className="label mb-2">▸ GEOSPATIAL VIEW</div>
          <h1 className="text-[32px] leading-none tracking-[-0.02em] font-light">
            <span className="editorial text-[var(--color-cyan)]">swarm</span> map
          </h1>
        </div>
        <div className="text-right">
          <div className="label mb-1">REGION</div>
          <div className="text-[12px] tracking-[0.14em] text-[var(--color-bone)]">
            48.137° N, 11.575° E
          </div>
          <div className="text-[10px] text-[var(--color-dim)]">MUNICH ▸ DE</div>
        </div>
      </div>

      <Panel
        title="LIVE GEOSPATIAL TRACKING"
        meta={`${packages.length} PACKAGES`}
        accent="cyan"
      >
        <div className="relative">
          <div ref={mapRef} className="h-[calc(100vh-280px)] min-h-[480px]" />

          {/* Status legend overlay */}
          <div className="absolute top-4 left-4 panel z-[400] w-[180px]">
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
                  <span className="text-[9px] tracking-[0.14em] uppercase text-[var(--color-ash)]">
                    {STATUS_LABEL[status]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Coordinate readout overlay */}
          <div className="absolute bottom-4 left-4 panel z-[400]">
            <div className="px-3 py-2 flex items-center gap-3">
              <div className="dot-live" />
              <span className="text-[9px] tracking-[0.14em] uppercase text-[var(--color-ash)]">
                TRACKING {packages.length} OBJECTS
              </span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
