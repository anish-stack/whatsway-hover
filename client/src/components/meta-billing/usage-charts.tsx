/**
 * Usage charts. Categorical colours in fixed order (marketing, utility,
 * authentication, service); single-series charts use the brand hue.
 * One y-axis per chart; recessive grid; tooltip on every chart.
 */
import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CATEGORY_COLORS, CATEGORY_LABEL, EmptyBlock, fmtInt, fmtMoney } from "./shared";

const AXIS = { fontSize: 11, fill: "hsl(var(--muted-foreground, 215 16% 47%))" };
const GRID = "rgba(120,120,120,0.15)";
const BRAND = "var(--brand, #08a957)";

function shortBucket(b: string) {
  if (b.length === 7) {
    const [y, m] = b.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
  }
  const d = new Date(`${b}T00:00:00`);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short" });
}

function ChartCard({ title, subtitle, children, empty }: { title: string; subtitle?: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <Card className="border-border shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-base font-semibold">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="h-[260px] pt-0">
        {empty ? <EmptyBlock title="No messages in this period" body="Usage appears here once Meta sends delivery status webhooks." /> : children}
      </CardContent>
    </Card>
  );
}

function TooltipBox({ active, payload, label, money, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{shortBucket(String(label))}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-foreground">{p.name}</span>
          <span className="ml-auto tabular-nums text-foreground">
            {money ? fmtMoney(p.value, currency) : p.dataKey === "deliveryRate" ? `${p.value}%` : fmtInt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CategoryVolumeChart({ points, title }: { points: any[]; title: string }) {
  const empty = !points.some((p) => p.total > 0);
  return (
    <ChartCard title={title} subtitle="Messages by Meta pricing category" empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="bucket" tickFormatter={shortBucket} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "rgba(120,120,120,0.08)" }} />
          <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          {(["marketing", "utility", "authentication", "service"] as const).map((k, i, arr) => (
            <Bar key={k} dataKey={k} name={CATEGORY_LABEL[k]} stackId="cat" fill={CATEGORY_COLORS[k]}
              stroke="var(--background, #fff)" strokeWidth={1}
              radius={i === arr.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function DeliveryRateChart({ points }: { points: any[] }) {
  const empty = !points.some((p) => p.total > 0);
  return (
    <ChartCard title="Delivery rate" subtitle="Delivered ÷ tracked messages" empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="bucket" tickFormatter={shortBucket} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} unit="%" width={44} />
          <Tooltip content={<TooltipBox />} />
          <Line type="monotone" dataKey="deliveryRate" name="Delivery rate" stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function SpendChart({ points, currency }: { points: any[]; currency: string }) {
  const empty = !points.some((p) => p.total > 0);
  return (
    <ChartCard title="Estimated Meta spend" subtitle="Billable delivered messages × rate at delivery" empty={empty}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="bucket" tickFormatter={shortBucket} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => fmtMoney(v, currency, 0)} />
          <Tooltip content={<TooltipBox money currency={currency} />} cursor={{ fill: "rgba(120,120,120,0.08)" }} />
          <Bar dataKey="cost" name="Estimated cost" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Horizontal ranked bars for a breakdown (country, campaign …). */
export function BreakdownBars({ title, rows, metric = "total" }: { title: string; rows: any[]; metric?: "total" | "cost" }) {
  const top = rows.slice(0, 8);
  return (
    <ChartCard title={title} subtitle={metric === "cost" ? "Estimated cost" : "Tracked messages"} empty={top.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={110} />
          <Tooltip
            cursor={{ fill: "rgba(120,120,120,0.08)" }}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
                  <p className="font-semibold text-foreground">{payload[0].payload.label}</p>
                  <p className="text-muted-foreground">Messages: <span className="text-foreground">{fmtInt(payload[0].payload.total)}</span></p>
                  <p className="text-muted-foreground">Delivered: <span className="text-foreground">{fmtInt(payload[0].payload.delivered)} ({payload[0].payload.deliveryRate}%)</span></p>
                  <p className="text-muted-foreground">Est. cost: <span className="text-foreground">{fmtMoney(payload[0].payload.cost, payload[0].payload.currency || "INR")}</span></p>
                </div>
              ) : null
            }
          />
          <Bar dataKey={metric} name={metric === "cost" ? "Estimated cost" : "Messages"} fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
