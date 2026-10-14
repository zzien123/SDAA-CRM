"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "leaflet/dist/leaflet.css";
import { setPropertyLocation } from "@/app/(app)/actions";

type Neighbor = { id: string; lat: number; lng: number; label: string };

// Free OpenStreetMap tiles by default. Set NEXT_PUBLIC_MAP_TILE_URL (e.g. a MapTiler or Mapbox URL with key) for heavier use.
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function PropertyMap({ id, lat, lng, neighbors }: { id: string; lat: number; lng: number; neighbors: Neighbor[] }) {
  const el = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false }).setView([lat, lng], 17);
      L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
      for (const n of neighbors) {
        L.circleMarker([n.lat, n.lng], { radius: 6, color: "#ffffff", weight: 2, fillColor: "#808897", fillOpacity: 0.9 })
          .addTo(map).bindTooltip(n.label).on("click", () => router.push(`/properties/${n.id}`));
      }
      const pin = L.divIcon({
        className: "",
        html: '<div style="width:18px;height:18px;border-radius:50%;background:#0f1d33;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
        iconSize: [18, 18], iconAnchor: [9, 9],
      });
      const marker = L.marker([lat, lng], { icon: pin, draggable: true, title: "Drag to correct the location" }).addTo(map);
      marker.on("dragend", async () => {
        const p = marker.getLatLng();
        setMsg("Saving…");
        const r = await setPropertyLocation(id, p.lat, p.lng);
        setMsg(r.ok ? "Pin saved" : r.error);
        if (r.ok) router.refresh();
      });
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [id, lat, lng, neighbors, router]);

  return (
    <div>
      <div ref={el} className="h-64 w-full rounded-b-lg" style={{ zIndex: 0 }} />
      {msg && <div className="px-4 py-1.5 text-2xs text-ink-600">{msg}</div>}
    </div>
  );
}
