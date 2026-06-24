import { LumaSpinner } from "@/components/ui/luma-spinner";

export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 px-5 text-black">
      <LumaSpinner className="size-20" label="Loading Aero" />
    </main>
  );
}
