"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LumaSpinner } from "@/components/ui/luma-spinner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function WorkspaceActionButton({
  children,
  confirm,
  className,
  variant = "outline",
}: {
  children: ReactNode;
  confirm: string;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();

  return (
    <Button
      type={armed ? "submit" : "button"}
      variant={variant}
      disabled={pending}
      className={className}
      onClick={(event) => {
        if (armed) return;
        event.preventDefault();
        setArmed(true);
        toast.message(confirm);
      }}
    >
      {pending ? <LumaSpinner label="Processing workspace action" /> : null}
      {pending ? "Processing…" : armed ? "Confirm" : children}
    </Button>
  );
}

export function CopyInviteLinkButton({ url, className }: { url: string; className?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("h-11 rounded-xl border-border bg-white px-4 text-sm font-black hover:bg-white", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Invite link copied");
        } catch {
          toast.error("Copy failed", { description: "Allow clipboard access, then try again." });
        }
      }}
    >
      <Copy className="size-4" />
      Copy link
    </Button>
  );
}
