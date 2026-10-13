import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

export function money(v: number | string | null | undefined, opts: { compact?: boolean } = {}) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (opts.compact && Math.abs(n) >= 1000) {
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
    return `$${Math.round(n / 1e3)}K`;
  }
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export const num = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("en-US");

export function date(v: string | Date | null | undefined) {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v.length === 10 ? v + "T12:00:00" : v) : v;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ago(v: string | Date | null | undefined) {
  if (!v) return "never";
  const d = typeof v === "string" ? new Date(v) : v;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

export const label = (s: string | null | undefined) =>
  s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bLlc\b/, "LLC").replace(/\b5plus\b/i, "5+").replace(/\b2 4\b/, "2–4") : "—";

export function qs(base: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}
