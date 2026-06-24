"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Home, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function AddWorkspaceShortcutButton({ url }: { url: string }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  async function installShortcut() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function shareShortcut() {
    if (navigator.share) {
      await navigator.share({ title: "Aero workspace selector", text: "Open Aero workspace selector", url });
      return;
    }

    await copyShortcut();
  }

  async function copyShortcut() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl px-3 text-xs font-black">
          <Home className="size-4" />
          Add shortcut
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-[-0.04em]">Add workspace shortcut</DialogTitle>
          <DialogDescription className="text-sm font-semibold text-zinc-500">
            Create a home-screen or desktop shortcut that opens the Aero workspace selector directly.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
          <div className="break-all rounded-xl bg-white p-3 font-mono text-xs font-bold text-zinc-600">{url}</div>
          <div className="grid gap-2 text-xs font-semibold text-zinc-600">
            <p><span className="font-black text-zinc-950">iPhone/iPad:</span> tap Share, then Add to Home Screen.</p>
            <p><span className="font-black text-zinc-950">Android Chrome:</span> tap Install if shown, or browser menu, then Add to Home screen.</p>
            <p><span className="font-black text-zinc-950">Desktop:</span> install from the browser address bar or copy this link to create a shortcut.</p>
          </div>
        </div>

        <DialogFooter className="grid gap-2 sm:grid-cols-2 sm:justify-stretch">
          {installPrompt ? (
            <Button type="button" onClick={installShortcut} className="h-11 rounded-xl text-sm font-black sm:col-span-2">
              <Home className="size-4" />
              Install shortcut
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={shareShortcut} className="h-11 rounded-xl text-sm font-black">
            <Share2 className="size-4" />
            Share
          </Button>
          <Button type="button" variant="secondary" onClick={copyShortcut} className="h-11 rounded-xl text-sm font-black">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
