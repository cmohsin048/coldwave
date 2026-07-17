"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export function PlacementChart({
  data,
}: {
  data: Array<{ day: string; inboxRate: number }>;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No warmup data yet. Enable warmup on a mailbox to start tracking inbox
        placement.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="inbox" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="day" fontSize={11} />
        <YAxis domain={[0, 100]} fontSize={11} unit="%" />
        <Tooltip />
        <Area
          type="monotone"
          dataKey="inboxRate"
          stroke="hsl(142 71% 45%)"
          fill="url(#inbox)"
          name="Inbox placement"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
