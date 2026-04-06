import { useEffect, useRef } from "react";
import type { Package } from "@swarmhaul/types";

// Dynamic Leaflet import to avoid SSR issues
let L: typeof import("leaflet") | null = null;

const STATUS_COLORS: Record<string, string> = {
  listed: "#3b82f6",
  swarm_forming: "#eab308",
  in_transit: "#f97316",
  delivered: "#10b981",
  failed: "#ef4444",
};

export function SwarmMap({ packages }: { packages: Package[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((leaflet) => {
      L = leaflet;
      const map = L.map(mapRef.current!, {
        center: [48.137, 11.575], // Munich
        zoom: 13,
        zoomControl: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      mapInstanceRef.current = map;
    });

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update markers when packages change
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;
    const map = mapInstanceRef.current;

    // Clear existing markers
    map.eachLayer((layer) => {
      if ((layer as any)._swarmhaul) map.removeLayer(layer);
    });

    for (const pkg of packages) {
      const color = STATUS_COLORS[pkg.status] ?? "#6b7280";

      // Origin marker
      const originMarker = L.circleMarker([pkg.origin.lat, pkg.origin.lng], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.6,
        weight: 2,
      }).addTo(map);
      (originMarker as any)._swarmhaul = true;

      originMarker.bindPopup(
        `<strong>${pkg.description}</strong><br/>` +
          `Status: ${pkg.status}<br/>` +
          `Budget: ${pkg.maxBudgetSol} SOL<br/>` +
          `Weight: ${pkg.weightKg}kg`,
      );

      // Destination marker
      const destMarker = L.circleMarker(
        [pkg.destination.lat, pkg.destination.lng],
        {
          radius: 6,
          color,
          fillColor: color,
          fillOpacity: 0.3,
          weight: 1,
          dashArray: "4",
        },
      ).addTo(map);
      (destMarker as any)._swarmhaul = true;

      // Line between origin and destination
      const line = L.polyline(
        [
          [pkg.origin.lat, pkg.origin.lng],
          [pkg.destination.lat, pkg.destination.lng],
        ],
        {
          color,
          weight: 2,
          opacity: 0.4,
          dashArray: pkg.status === "in_transit" ? undefined : "8 4",
        },
      ).addTo(map);
      (line as any)._swarmhaul = true;
    }
  }, [packages]);

  return (
    <div className="relative">
      <div ref={mapRef} className="h-[calc(100vh-120px)] rounded-lg overflow-hidden" />
      <div className="absolute top-3 left-3 bg-gray-900/90 border border-gray-700 rounded-lg p-3 text-xs space-y-1.5">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-gray-400">{status.replace("_", " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
