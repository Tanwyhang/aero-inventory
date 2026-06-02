"use client";

import { useState } from "react";
import { Bone, Cat, Dog, Fish, PawPrint, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const storeIcons = [
  { label: "Paw", icon: PawPrint },
  { label: "Bone", icon: Bone },
  { label: "Dog", icon: Dog },
  { label: "Cat", icon: Cat },
  { label: "Fish", icon: Fish },
];

export function StoreIdentityEditor({
  initialName = "Happy Paws Pet Store",
  initialIcon = "Paw",
  workspaceId,
  readOnly = false,
}: {
  initialName?: string;
  initialIcon?: string;
  workspaceId?: string;
  readOnly?: boolean;
}) {
  const initialIconIndex = Math.max(0, storeIcons.findIndex((item) => item.label === initialIcon));
  const [iconIndex, setIconIndex] = useState(initialIconIndex);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const ActiveIcon = storeIcons[iconIndex].icon;

  return (
    <div className="mt-3 flex items-center gap-3 text-xl font-semibold tracking-[-0.035em]">
      <div className="relative">
        <button
          type="button"
          className="rounded-md outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2"
          aria-label={`Store icon: ${storeIcons[iconIndex].label}. Open icon menu.`}
          aria-expanded={isMenuOpen}
          title="Choose store icon"
          disabled={readOnly}
          onClick={() => !readOnly && setIsMenuOpen(!isMenuOpen)}
        >
          <ActiveIcon className="size-7 fill-black stroke-black" />
        </button>

        {isMenuOpen && !readOnly ? (
          <div className="absolute left-0 top-10 z-20 grid w-48 gap-1 rounded-xl border border-white/50 bg-white/85 p-2 backdrop-blur-2xl">
            {storeIcons.map((item, index) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.label}
                  type="button"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-black outline-none transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-lime",
                    index === iconIndex && "bg-lime",
                  )}
                  onClick={() => {
                    setIconIndex(index);
                    setIsMenuOpen(false);
                  }}
                >
                  <Icon className="size-5 fill-black stroke-black" />
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <label className="flex min-w-0 items-center gap-2">
        <input
          aria-label="Store name"
          readOnly={readOnly}
          className="w-[260px] min-w-0 bg-transparent font-semibold text-black outline-none transition placeholder:text-zinc-400 focus:border-b focus:border-black"
          defaultValue={initialName}
        />
        {readOnly ? null : <Pencil className="size-4 stroke-[2.4] text-zinc-500" aria-hidden="true" />}
      </label>

      {workspaceId ? (
        <span className="rounded-full border border-border bg-zinc-50 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-zinc-500" title={workspaceId}>
          ID {workspaceId.slice(0, 8)}
        </span>
      ) : null}
    </div>
  );
}
