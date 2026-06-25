"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function GlobalLoadingIndicator() {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsLoading(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [pathname]);

  useEffect(() => {
    let timeoutId: number | null = null;

    function showLoading() {
      if (timeoutId) window.clearTimeout(timeoutId);
      setIsLoading(true);
      timeoutId = window.setTimeout(() => setIsLoading(false), 12000);
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) return;
      if (target.target === "_blank" || target.hasAttribute("download")) return;

      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      showLoading();
    }

    function handleSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) return;
      showLoading();
    }

    function hideLoading() {
      setIsLoading(false);
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("pageshow", hideLoading);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pageshow", hideLoading);
    };
  }, []);

  if (!isLoading) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[calc(0.25rem+env(safe-area-inset-top))] bg-transparent" aria-hidden="true">
      <div className="h-full origin-left animate-pulse bg-lime shadow-[0_0_24px_rgba(190,255,0,0.7)]" />
    </div>
  );
}
