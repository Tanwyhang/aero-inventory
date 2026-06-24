"use client";

import { useState } from "react";
import { Bone, Cat, Dog, Fish, PawPrint, Pencil } from "lucide-react";
import { updateWorkspaceIdentityAction } from "@/app/actions/workspaces";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { WorkspaceActionButton } from "@/components/workspace-action-button";
import { cn } from "@/lib/utils";

export const storeIcons = [
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
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(initialName);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xl font-semibold tracking-[-0.035em]">
      <button
        type="button"
        disabled={readOnly || !workspaceId}
        onClick={() => setIsOpen(true)}
        className={cn(
          "flex min-w-0 items-center gap-3 rounded-xl text-left outline-none transition focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2",
          !readOnly && workspaceId && "hover:bg-zinc-100 hover:px-2 hover:py-1",
        )}
      >
        <span className="min-w-0 truncate font-semibold text-black">{name}</span>
        {readOnly ? null : <Pencil className="size-4 shrink-0 stroke-[2.4] text-zinc-500" aria-hidden="true" />}
      </button>

      {workspaceId ? (
        <span className="rounded-full border border-border bg-zinc-50 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-zinc-500" title={workspaceId}>
          ID {workspaceId.split("-").at(-1)}
        </span>
      ) : null}

      {workspaceId ? (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent className="max-w-[22rem] rounded-3xl sm:max-w-md">
            <div>
              <DialogTitle className="text-2xl font-black tracking-[-0.05em]">Edit workspace</DialogTitle>
              <DialogDescription className="mt-1 text-sm font-semibold text-zinc-500">Update the store name and icon shown across Aero.</DialogDescription>
            </div>
            <form action={updateWorkspaceIdentityAction} className="grid gap-4">
              <input type="hidden" name="organizationId" value={workspaceId} />
              <input type="hidden" name="returnTo" value="/" />
              <label className="grid gap-2 text-sm font-black text-zinc-700">
                Workspace name
                <Input name="name" required value={name} onChange={(event) => setName(event.target.value)} className="h-12 rounded-xl font-bold" />
              </label>
              <label className="grid gap-2 text-sm font-black text-zinc-700">
                Icon
                <NativeSelect name="icon" value={storeIcons[iconIndex].label} onChange={(event) => setIconIndex(Math.max(0, storeIcons.findIndex((item) => item.label === event.target.value)))} className="h-12 rounded-xl bg-white font-bold">
                  {storeIcons.map((item) => <NativeSelectOption key={item.label} value={item.label}>{item.label}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="h-11 rounded-xl bg-white font-black">Cancel</Button>
                <WorkspaceActionButton confirm="Click Confirm to update this workspace." className="h-11 rounded-xl bg-lime px-5 font-black text-black hover:bg-lime">Save</WorkspaceActionButton>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
