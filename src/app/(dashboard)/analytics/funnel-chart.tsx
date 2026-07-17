"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

const COLORS = [
  "hsl(221 83% 53%)",
  "hsl(199 89% 48%)",
  "hsl(262 83% 58%)",
  "hsl(280 65% 60%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
];

export function FunnelChart({
  data,
}: {
  data: Array<{ stage: string; count: number }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="stage" fontSize={11} />
        <YAxis fontSize={11} allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
