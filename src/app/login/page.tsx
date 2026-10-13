import { LoginForm } from "./form";
export default async function Login({ searchParams }: { searchParams: Promise<{ denied?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6">
        <div className="mb-5">
          <div className="text-base font-semibold">San Diego Apartment Advisors</div>
          <div className="text-sm text-ink-500">Sign in to the brokerage CRM</div>
        </div>
        {sp.denied && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">That email isn’t authorized for this CRM.</p>}
        {sp.error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">Sign-in link expired or invalid. Try again.</p>}
        <LoginForm />
      </div>
    </div>
  );
}
