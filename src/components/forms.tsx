"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/app/(app)/actions";

type FormAction = (prev: unknown, form: FormData) => Promise<ActionResult>;

const Pending = createContext(false);

export function Submit({ children, variant, size, className }: { children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; className?: string }) {
  const pending = useContext(Pending);
  return <Button type="submit" disabled={pending} variant={variant} size={size} className={className}>{pending ? "Saving…" : children}</Button>;
}

/** Form bound to a server action; shows the error inline, resets + calls onDone on success. */
export function ActionForm({ action, children, className, resetOnSuccess = true, onDone, successMessage }: {
  action: FormAction; children: React.ReactNode; className?: string; resetOnSuccess?: boolean; onDone?: (r: ActionResult) => void; successMessage?: string;
}) {
  const [state, run, pending] = useActionState(action, null as ActionResult | null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onDone?.(state);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const err = state && !state.ok ? state.error : null;
  const link = err?.match(/(\/(?:properties|contacts|owners)\/[0-9a-f-]{36})/)?.[1];
  return (
    // onSubmit (not action=) so React doesn't auto-reset the fields when the server returns an error
    <form ref={ref} className={className} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => run(fd)); }}>
      <Pending.Provider value={pending}>{children}</Pending.Provider>
      {err && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {link ? <>{err.replace(link, "")} <a className="underline" href={link}>Open existing record</a></> : err}
        </p>
      )}
      {state?.ok && successMessage && <p className="mt-2 text-xs text-emerald-700">{successMessage}</p>}
    </form>
  );
}

/** Button that runs a server action with an id. Optional confirm step (inline, no browser dialog). */
export function ActionButton({ run, children, confirm, variant = "ghost", size = "sm", className, title }: {
  run: () => Promise<ActionResult>; children: React.ReactNode; confirm?: string; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; className?: string; title?: string;
}) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const go = () => start(async () => {
    const r = await run();
    setAsking(false);
    if (!r.ok) setErr(r.error); else { setErr(null); router.refresh(); }
  });
  return (
    <span className="inline-flex flex-col">
      {asking ? (
        <span className="inline-flex items-center gap-1">
          <span className="text-2xs text-ink-500">{confirm}</span>
          <Button size="sm" variant="danger" onClick={go} disabled={pending}>Yes</Button>
          <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>No</Button>
        </span>
      ) : (
        <Button type="button" title={title} variant={variant} size={size} className={className} disabled={pending} onClick={() => (confirm ? setAsking(true) : go())}>
          {pending ? "…" : children}
        </Button>
      )}
      {err && <span className="mt-1 max-w-xs text-2xs text-red-700">{err}</span>}
    </span>
  );
}

export function Disclosure({ label, children, defaultOpen = false, className }: { label: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={cn("text-xs font-medium text-navy-700 hover:underline")}>{open ? "− " : "+ "}{label}</button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

/** Typeahead that fills a hidden input with the chosen record id. kind maps to /api/lookup. */
export function RecordPicker({ name, kind, placeholder, defaultValue, defaultLabel }: { name: string; kind: "contact" | "entity" | "property"; placeholder?: string; defaultValue?: string | null; defaultLabel?: string | null }) {
  const [q, setQ] = useState(defaultLabel ?? "");
  const [id, setId] = useState(defaultValue ?? "");
  const [opts, setOpts] = useState<{ id: string; label: string; sub?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(defaultLabel ?? "");
  useEffect(() => {
    if (q.length < 2 || (id && q === chosen)) { setOpts([]); setOpen(false); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/lookup?kind=${kind}&q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (r.ok) { setOpts((await r.json()).items); setOpen(true); }
      } catch { /* aborted */ }
    }, 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, kind, id, chosen]);
  return (
    <div className="relative">
      <input type="hidden" name={name} value={id} />
      <input value={q} placeholder={placeholder} onChange={(e) => { setQ(e.target.value); setId(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={cn("h-9 w-full rounded-md border bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-600/15", id ? "border-navy-600" : "border-ink-200")} />
      {open && opts.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-ink-200 bg-white shadow-lg">
          {opts.map((o) => (
            <button type="button" key={o.id} onMouseDown={() => { setId(o.id); setChosen(o.label); setQ(o.label); setOpen(false); }} className="block w-full px-3 py-1.5 text-left hover:bg-navy-50">
              <div className="text-[13px]">{o.label}</div>
              {o.sub && <div className="text-2xs text-ink-500">{o.sub}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
