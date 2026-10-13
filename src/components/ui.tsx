import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" };
const btn = (variant: BtnProps["variant"] = "primary", size: BtnProps["size"] = "md") =>
  cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600/40",
    size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
    variant === "primary" && "bg-navy-900 text-white hover:bg-navy-800",
    variant === "secondary" && "border border-ink-200 bg-white text-ink-900 hover:bg-ink-50",
    variant === "ghost" && "text-ink-700 hover:bg-ink-100",
    variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
  );
export function Button({ variant, size, className, ...p }: BtnProps) {
  return <button className={cn(btn(variant, size), className)} {...p} />;
}
export function ButtonLink({ variant, size, className, ...p }: React.ComponentProps<typeof Link> & { variant?: BtnProps["variant"]; size?: BtnProps["size"] }) {
  return <Link className={cn(btn(variant, size), className)} {...p} />;
}

const field = "w-full rounded-md border border-ink-200 bg-white px-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-600/15";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(field, "h-9", className)} {...p} />;
});
export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "h-9 pr-7", className)} {...p} />;
}
export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "py-2 min-h-[72px]", className)} {...p} />;
}
export function Field({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-2xs text-ink-400">{hint}</span>}
    </label>
  );
}

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-ink-200 bg-white", className)} {...p} />;
}
export function CardHeader({ title, action, sub }: { title: React.ReactNode; action?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-2.5">
      <div>
        <h2 className="text-[13px] font-semibold text-ink-900">{title}</h2>
        {sub && <p className="text-2xs text-ink-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

const tones = {
  gray: "bg-ink-100 text-ink-700",
  navy: "bg-navy-100 text-navy-800",
  green: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200",
};
export function Badge({ tone = "gray", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap", tones[tone], className)} {...p} />;
}

export function PageHeader({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {sub && <div className="mt-0.5 text-sm text-ink-500">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-[13px] text-ink-500">{children}</div>;
}

export function Stat({ label, value, sub, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string }) {
  const body = (
    <div className="px-4 py-3">
      <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
      <div className="num mt-1 text-xl font-semibold text-ink-900">{value}</div>
      {sub && <div className="mt-0.5 text-2xs text-ink-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:bg-ink-50">{body}</Link> : body;
}

export function DL({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-2xs uppercase tracking-wide text-ink-500">{k}</dt>
          <dd className="num text-[13px] text-ink-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export const confidenceTone = (c: string | null | undefined): keyof typeof tones =>
  c === "verified" ? "green" : c === "reported" ? "navy" : c === "public_record" ? "gray" : "amber";
