"use client";

import { useState, type ReactNode } from "react";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
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

  return (
    <Button
      type={armed ? "submit" : "button"}
      variant={variant}
      className={className}
      onClick={(event) => {
        if (armed) return;
        event.preventDefault();
        setArmed(true);
        toast.message(confirm);
      }}
    >
      {armed ? "Confirm" : children}
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
        await navigator.clipboard.writeText(url);
        toast.success("Invite link copied");
      }}
    >
      <Copy className="size-4" />
      Copy link
    </Button>
  );
}
