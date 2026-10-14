"use client";
import dynamic from "next/dynamic";

// Leaflet touches `window`, so it only loads in the browser.
export const PropertyMapLoader = dynamic(() => import("./property-map").then((m) => m.PropertyMap), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse bg-ink-100" />,
});
