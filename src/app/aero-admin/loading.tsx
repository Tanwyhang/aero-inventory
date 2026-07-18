import { Skeleton } from "@/components/ui/skeleton";

export default function AeroAdminLoading() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 text-black sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-72 max-w-[70vw]" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="mt-6 h-12 w-full rounded-xl" />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-72 rounded-3xl" />)}
        </div>
      </div>
    </main>
  );
}
