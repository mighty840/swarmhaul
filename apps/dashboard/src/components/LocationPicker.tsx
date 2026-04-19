import { useEffect, useRef, useState } from "react";

interface LatLng {
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  origin: LatLng;
  destination: LatLng;
  onChange: (next: { origin: LatLng; destination: LatLng }) => void;
}

/**
 * Click-to-pick origin + destination on a dark terminal-themed map.
 *
 * Alternates between setting origin (first click) and destination
 * (second click). A third click replaces origin again. A RESET button
 * drops both points back to default values.
 */
export function LocationPicker({
  origin,
  destination,
  onChange,
}: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<{ origin: any; destination: any; line: any }>({
    origin: null,
    destination: null,
    line: null,
  });
  const LRef = useRef<any>(null);
  const [next, setNext] = useState<"origin" | "destination">("origin");
  const stateRef = useRef({ origin, destination, next });

  // Keep the handler refs up-to-date without tearing the map down.
  useEffect(() => {
    stateRef.current = { origin, destination, next };
  }, [origin, destination, next]);

  useEffect(() => {
    let cancelled = false;
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      LRef.current = L;

      const map = L.map(mapRef.current, {
        center: [origin.lat, origin.lng],
        zoom: 12,
        zoomControl: true,
      });
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        { maxZoom: 19, attribution: "© CARTO © OSM" },
      ).addTo(map);
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
        { maxZoom: 19, opacity: 0.55 },
      ).addTo(map);

      map.on("click", (e: any) => {
        const pt = { lat: e.latlng.lat, lng: e.latlng.lng };
        const s = stateRef.current;
        if (s.next === "origin") {
          onChange({ origin: pt, destination: s.destination });
          setNext("destination");
        } else {
          onChange({ origin: s.origin, destination: pt });
          setNext("origin");
        }
      });

      mapInstanceRef.current = map;

      // Initial marker draw
      drawMarkers(origin, destination);
      map.fitBounds(
        [
          [origin.lat, origin.lng],
          [destination.lat, destination.lng],
        ],
        { padding: [40, 40], maxZoom: 14 },
      );
    });

    return () => {
      cancelled = true;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers whenever origin/destination change
  useEffect(() => {
    drawMarkers(origin, destination);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.lat, origin.lng, destination.lat, destination.lng]);

  function drawMarkers(o: LatLng, d: LatLng) {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L) return;

    const prev = markersRef.current;
    if (prev.origin) map.removeLayer(prev.origin);
    if (prev.destination) map.removeLayer(prev.destination);
    if (prev.line) map.removeLayer(prev.line);

    const originMarker = L.marker([o.lat, o.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="background:#00ff9c;color:#06060a;font-weight:700;font-size:11px;letter-spacing:0.14em;width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #06060a,0 0 16px rgba(0,255,156,0.6);">A</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    }).addTo(map);

    const destMarker = L.marker([d.lat, d.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="background:#ff2d8a;color:#06060a;font-weight:700;font-size:11px;letter-spacing:0.14em;width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px #06060a,0 0 16px rgba(255,45,138,0.6);">B</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
    }).addTo(map);

    const line = L.polyline(
      [
        [o.lat, o.lng],
        [d.lat, d.lng],
      ],
      { color: "#9898a5", weight: 1.5, dashArray: "6 4", opacity: 0.7 },
    ).addTo(map);

    markersRef.current = {
      origin: originMarker,
      destination: destMarker,
      line,
    };
  }

  const haversineKm = (a: LatLng, b: LatLng): number => {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const distance = haversineKm(origin, destination);

  const reset = () => {
    const defaults = {
      origin: { lat: 48.137, lng: 11.575 },
      destination: { lat: 48.155, lng: 11.605 },
    };
    onChange(defaults);
    setNext("origin");
    const map = mapInstanceRef.current;
    if (map) {
      map.fitBounds(
        [
          [defaults.origin.lat, defaults.origin.lng],
          [defaults.destination.lat, defaults.destination.lng],
        ],
        { padding: [40, 40], maxZoom: 14 },
      );
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="label">
          PICKUP &amp; DROPOFF ▸ CLICK MAP TO SET {next === "origin" ? "A" : "B"}
        </label>
        <button
          type="button"
          onClick={reset}
          className="text-[10px] tracking-[0.14em] uppercase font-semibold text-[var(--color-ash)] hover:text-[var(--color-bone)]"
        >
          RESET
        </button>
      </div>
      <div
        ref={mapRef}
        className="h-[260px] w-full bg-[var(--color-void)] border border-[var(--color-line)]"
      />
      <div className="grid grid-cols-3 gap-3 mt-2 text-[10px] font-mono">
        <div>
          <div className="label-muted">
            <span className="text-[var(--color-phosphor)]">A</span> ORIGIN
          </div>
          <div className="text-[var(--color-bone)] tabular-nums">
            {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}
          </div>
        </div>
        <div>
          <div className="label-muted">
            <span className="text-[var(--color-magenta)]">B</span> DESTINATION
          </div>
          <div className="text-[var(--color-bone)] tabular-nums">
            {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
          </div>
        </div>
        <div>
          <div className="label-muted">HAVERSINE DISTANCE</div>
          <div className="text-[var(--color-bone)] tabular-nums font-semibold">
            {distance.toFixed(2)} KM
          </div>
        </div>
      </div>
    </div>
  );
}
