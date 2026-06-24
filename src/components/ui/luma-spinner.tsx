import { cn } from "@/lib/utils";

export function LumaSpinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  const points = [6, 17, 28, 39, 50];

  return (
    <span className={cn("inline-grid size-10 place-items-center text-black", className)} role="status" aria-label={label}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" role="img" aria-label={label} className="size-full">
        <title>{label}</title>
        <desc>Each column fills bottom-up, then releases as one.</desc>
        <style>{`
          .aero-loader-bg { fill: #000000; opacity: 0.07; }
          .aero-loader-dot { fill: #000000; opacity: 0; animation: aero-loader-fill 900ms cubic-bezier(0.65, 0, 0.35, 1) infinite both; }
          @keyframes aero-loader-fill { 0% { opacity: 0.08; } 18% { opacity: 1; } 70% { opacity: 0.95; } 100% { opacity: 0.08; } }
          @media (prefers-reduced-motion: reduce) { .aero-loader-dot { animation: none; opacity: 0.45; } }
        `}</style>
        {points.flatMap((y) => points.map((x) => <circle key={`bg-${x}-${y}`} className="aero-loader-bg" cx={x} cy={y} r="2.4" />))}
        {points.flatMap((y, rowIndex) => points.map((x, columnIndex) => {
          const delay = (4 - rowIndex) * 48 + columnIndex * 24;
          return <circle key={`dot-${x}-${y}`} className="aero-loader-dot" cx={x} cy={y} r="3.1" style={{ animationDelay: `${delay}ms` }} />;
        }))}
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
