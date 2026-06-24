import { redirect } from "next/navigation";
import Image from "next/image";

import { signInWithGoogle } from "@/app/actions/auth";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { Button } from "@/components/ui/button";
import { getCurrentMembership } from "@/lib/auth";
import aeroLogo from "../../../design/logohorizontal.png";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const membership = await getCurrentMembership();
  const params = await searchParams;

  if (membership) {
    redirect("/workspaces");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-black">
      <div className="w-full max-w-md">
        <FluidEntrySurface className="w-full rounded-3xl border border-white/50 bg-white/70 backdrop-blur-2xl" contentClassName="p-8">
        <Image src={aeroLogo} alt="Aero" className="mx-auto h-auto w-full max-w-[420px]" priority />
        {params.error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Google sign-in failed. Check your OAuth settings and try again.
          </div>
        ) : null}
        <form action={signInWithGoogle} className="mt-7">
          <Button className="h-13 w-full rounded-lg bg-[#dbeafe] text-base font-bold text-black hover:bg-[#bfdbfe]">
            <GoogleMark />
            Continue with Google
          </Button>
        </form>
        <p className="mt-5 text-sm font-medium text-zinc-500">
          If your account is not approved, ask the admin to invite you.
        </p>
        </FluidEntrySurface>
      </div>
    </main>
  );
}
