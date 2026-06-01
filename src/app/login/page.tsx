import { redirect } from "next/navigation";

import { signInWithGoogle } from "@/app/actions/auth";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { Button } from "@/components/ui/button";
import { getCurrentMembership } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const membership = await getCurrentMembership();
  const params = await searchParams;

  if (membership) {
    redirect("/");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-black">
      <FluidEntrySurface className="w-full max-w-md rounded-3xl border border-white/50 bg-white/70 backdrop-blur-2xl" contentClassName="p-8">
        <div className="text-sm font-black uppercase tracking-[0.18em] text-zinc-500">Aero Inventory</div>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.06em]">Sign in</h1>
        <p className="mt-3 text-base font-semibold leading-7 text-zinc-600">
          Use your approved Google account to access the inventory dashboard.
        </p>
        {params.error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Google sign-in failed. Check your OAuth settings and try again.
          </div>
        ) : null}
        <form action={signInWithGoogle} className="mt-7">
          <Button className="h-13 w-full rounded-lg bg-black text-base font-bold text-white hover:bg-black">
            Continue with Google
          </Button>
        </form>
        <p className="mt-5 text-sm font-medium text-zinc-500">
          If your account is not approved, ask the admin to invite you.
        </p>
      </FluidEntrySurface>
    </main>
  );
}
