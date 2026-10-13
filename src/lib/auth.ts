import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { ensureOrg, AccessDenied } from "./org";

export type Session = { userId: string; orgId: string; email: string; role: string };

export const isDevAuth = () => process.env.AUTH_MODE === "dev";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* RSC: read-only */ } },
    },
  });
}

/** Current user + org, or redirect to /login. Cached per request. */
export const requireSession = cache(async (): Promise<Session> => {
  if (isDevAuth()) {
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) throw new Error("AUTH_MODE=dev is not allowed in production");
    const email = process.env.DEV_USER_EMAIL ?? "dev@example.com";
    const s = await ensureOrg(email);
    return { ...s, email };
  }
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  try {
    const s = await ensureOrg(user.email, user.id, (user.user_metadata?.full_name as string) ?? null);
    return { ...s, email: user.email };
  } catch (e) {
    if (e instanceof AccessDenied) redirect("/login?denied=1");
    throw e;
  }
});
