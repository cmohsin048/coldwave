import { cn } from "@/lib/utils";

/** 0-10 spam score gauge with red/amber/green banding. */
export function SpamGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(10, score));
  const pct = (clamped / 10) * 100;
  const band =
    clamped < 3 ? "green" : clamped < 5 ? "amber" : "red";
  const color =
    band === "green"
      ? "hsl(var(--success))"
      : band === "amber"
        ? "hsl(var(--warning))"
        : "hsl(var(--danger))";
  const label =
    band === "green" ? "Good" : band === "amber" ? "Risky" : "Likely spam";

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-3xl font-bold" style={{ color }}>
          {clamped.toFixed(1)}
          <span className="text-base text-muted-foreground">/10</span>
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold text-white"
          )}
          style={{ background: color }}
        >
          {label}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>0 · inbox</span>
        <span>5 · block threshold</span>
        <span>10 · spam</span>
      </div>
    </div>
  );
}
