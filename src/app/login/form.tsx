"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button, Input } from "@/components/ui";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (sent) return <p className="text-sm">Check <b>{email}</b> for a sign-in link.</p>;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback`, shouldCreateUser: true } });
      setBusy(false);
      if (error) setErr(error.message); else setSent(true);
    }}>
      <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
      <Button className="w-full" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</Button>
      {err && <p className="text-xs text-red-700">{err}</p>}
    </form>
  );
}
