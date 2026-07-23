import Image from "next/image";

import { unlockAeroAdminAction } from "@/app/actions/aero-admin";
import { Button } from "@/components/ui/button";
import { FluidEntrySurface } from "@/components/fluid-entry-surface";
import { LazyAeroSuperAdminDashboard } from "@/components/lazy-page-components";
import { getCachedAeroSuperAdminCustomers } from "@/lib/aero-admin-server";
import { hasAeroSuperAdminPasswordSession } from "@/lib/aero-admin-password";
import aeroLogo from "../../../design/logohorizontal.webp";

function PasswordGate({ error }: { error?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 text-black">
      <FluidEntrySurface className="w-full max-w-md rounded-3xl border border-white/50 bg-white/70 backdrop-blur-2xl" contentClassName="p-8">
        <Image src={aeroLogo} alt="Aero" className="mx-auto h-auto w-full max-w-[420px]" priority />
        <div className="mt-7">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">Aero internal</p>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.055em]">Super Admin</h1>
          <p className="mt-2 text-sm font-semibold text-zinc-500">Enter the Aero admin password to manage customer workspaces.</p>
        </div>
        {error === "password" ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            Wrong Aero admin password.
          </div>
        ) : null}
        <form action={unlockAeroAdminAction} className="mt-5 grid gap-3">
          <input
            required
            name="password"
            type="password"
            autoComplete="current-password"
            className="h-12 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold outline-none focus:border-black focus:ring-2 focus:ring-lime"
            placeholder="Aero admin password"
          />
          <Button className="h-12 w-full rounded-lg bg-black text-base font-bold text-white hover:bg-black">
            Unlock Super Admin
          </Button>
        </form>
      </FluidEntrySurface>
    </main>
  );
}

export default async function AeroAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  if (!(await hasAeroSuperAdminPasswordSession())) {
    return <PasswordGate error={params.error} />;
  }

  const customers = await getCachedAeroSuperAdminCustomers();

  return <LazyAeroSuperAdminDashboard customers={customers} accountEmail="Password access" />;
}
