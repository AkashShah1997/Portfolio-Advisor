"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { SNOWFLAKE_AXES, type SnowflakeAxes } from "@/lib/snowflake";

/**
 * The snowflake — 5-axis radar of the scorecard (Quality / Growth / Fortress /
 * Value / Income), colored by overall health: green when rounded and strong,
 * blue when solid, orange when thin. Fuller and rounder is better.
 */
export function Snowflake({
  axes,
  size = "md",
  title,
}: {
  axes: SnowflakeAxes;
  size?: "sm" | "md";
  title?: string;
}) {
  const mean = SNOWFLAKE_AXES.reduce((a, x) => a + axes[x.key], 0) / SNOWFLAKE_AXES.length;
  const color = mean >= 65 ? "#1baf7a" : mean >= 48 ? "#2a78d6" : "#eb6834";
  const data = SNOWFLAKE_AXES.map((a) => ({ axis: a.label, v: axes[a.key], full: 100 }));
  const h = size === "sm" ? 158 : 218;
  return (
    <div data-testid="snowflake" aria-label={title ?? "snowflake chart"}>
      <ResponsiveContainer width="100%" height={h}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%" margin={{ top: 4, right: 24, bottom: 4, left: 24 }}>
          <PolarGrid stroke="#e1e0d9" strokeWidth={1} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: size === "sm" ? 10.5 : 11.5, fill: "#6f6e66" }}
            tickLine={false}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={color}
            fillOpacity={0.24}
            isAnimationActive={true}
            animationDuration={700}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
