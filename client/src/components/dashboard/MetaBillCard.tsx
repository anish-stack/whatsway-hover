/**
 * "Meta bill" card: what Meta reports as charged on the customer's WhatsApp
 * Business Account(s) for the period (pricing_analytics COST), split by
 * category, with a daily bar chart and HoverChat's own estimate alongside.
 * Meta charges the customer's payment method directly; HoverChat collects nothing.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, ExternalLink, Info, Receipt, RefreshCw } from "lucide-react";
import { Bar } from "react-chartjs-2";
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from "chart.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

type Range = "this_month" | "last_month" | "last_30_days";
const RANGES: { v: Range; l: string }[] = [
  { v: "this_month", l: "This month" },
  { v: "last_month", l: "Last month" },
  { v: "last_30_days", l: "30 days" },
];

// Categorical slots 1-4 (validated order), fixed per category — never by rank.
const CATS: { key: string; label: string; color: string; note?: string }[] = [
  { key: "marketing", label: "Marketing", color: "#2a78d6" },
  { key: "utility", label: "Utility", color: "#eb6834" },
  { key: "authentication", label: "Authentication (OTP)", color: "#1baf7a" },
  { key: "service", label: "Service", color: "#eda100", note: "usually free" },
];

function money(v: number | null | undefined, cur?: string | null) {
  if (v == null) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: cur || "INR", maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${cur || ""} ${v.toFixed(2)}`;
  }
}

export default function MetaBillCard({ channelId }: { channelId?: string }) {
  const [range, setRange] = useState<Range>("this_month");
  const q = useQuery<any>({
    queryKey: ["/api/whatsapp/meta-charges", range, channelId],
    queryFn: async () => {
      const qs = new URLSearchParams({ range });
      const res = await apiRequest("GET", `/api/whatsapp/meta-charges?${qs}`);
      return (await res.json()).data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const meta = q.data?.meta;
  const est = q.data?.estimate;
  const failed: any[] = (meta?.accounts || []).filter((a: any) => a.error);
  const hasMeta = !!meta && meta.accounts?.length > 0 && failed.length < meta.accounts.length;
  const currency = meta?.currency || est?.currency || "INR";
  const total = hasMeta ? meta.total : est?.amount ?? null;
  const cats = CATS.map((c) => ({
    ...c,
    cost: hasMeta ? meta.byCategory?.[c.key]?.cost ?? 0 : null,
    volume: hasMeta ? meta.byCategory?.[c.key]?.volume ?? 0 : est?.categories?.[c.key] ?? 0,
  }));
  const maxCost = Math.max(...cats.map((c) => c.cost ?? 0), 0);
  const days: Array<{ date: string; cost: number; volume: number }> = meta?.daily || [];
  const showChart = hasMeta && days.length > 1;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base sm:text-base">
            <span className="rounded-lg bg-[var(--brand-100)] p-2 text-[var(--brand)]"><Receipt className="h-4 w-4" /></span>
            Meta bill
            <span className="text-xs font-normal text-muted-foreground">charged by Meta</span>
          </CardTitle>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {RANGES.map((r) => (
              <button
                key={r.v}
                onClick={() => setRange(r.v)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {r.l}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {q.isLoading ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="h-36 animate-pulse rounded-xl bg-muted" />
            <div className="h-36 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : q.error ? (
          <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span>Could not load Meta charges.</span>
            <Button size="sm" variant="outline" onClick={() => q.refetch()}><RefreshCw className="mr-1 h-3 w-3" /> Retry</Button>
          </div>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              {/* Hero number */}
              <div className="flex flex-col justify-between rounded-xl border bg-gradient-to-br from-[var(--brand-100)] to-transparent p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {meta?.period?.label || "This month"} · {hasMeta ? "reported by Meta" : "HoverChat estimate"}
                  </p>
                  <p className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-foreground">
                    {meta?.multiCurrency ? "Multiple currencies" : money(total, currency)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {(hasMeta ? meta.volume : est?.billable ?? 0).toLocaleString("en-IN")} paid messages
                  </p>
                </div>
                {hasMeta && est?.amount != null && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    HoverChat estimate: <span className="font-medium text-foreground">{money(est.amount, est.currency)}</span>
                  </p>
                )}
              </div>

              {/* Category breakdown — labeled meters, identity never by color alone */}
              <div className="space-y-3">
                {cats.map((c) => (
                  <div key={c.key} className="group">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 text-foreground">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
                        {c.label}
                        {c.note && <span className="text-xs text-muted-foreground">({c.note})</span>}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        <span className="font-medium text-foreground">{c.cost == null ? "—" : money(c.cost, currency)}</span>
                        <span className="ml-2 text-xs">{c.volume.toLocaleString("en-IN")} msgs</span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${maxCost > 0 && c.cost ? Math.max((c.cost / maxCost) * 100, 2) : 0}%`, background: c.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {showChart && (
              <div className="h-36">
                <Bar
                  data={{
                    labels: days.map((d) => d.date.slice(5).split("-").reverse().join("/")),
                    datasets: [{
                      data: days.map((d) => d.cost),
                      backgroundColor: "#2a78d6",
                      hoverBackgroundColor: "#1d5fae",
                      borderRadius: { topLeft: 4, topRight: 4 },
                      borderSkipped: "bottom",
                      maxBarThickness: 18,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        displayColors: false,
                        callbacks: {
                          title: (items) => days[items[0].dataIndex]?.date,
                          label: (item) => {
                            const d = days[item.dataIndex];
                            return [money(d.cost, currency), `${d.volume.toLocaleString("en-IN")} paid messages`];
                          },
                        },
                      },
                    },
                    scales: {
                      x: { grid: { display: false }, ticks: { maxTicksLimit: 10, color: "#8a8986", font: { size: 10 } }, border: { display: false } },
                      y: { beginAtZero: true, grid: { color: "rgba(120,120,120,0.12)" }, ticks: { maxTicksLimit: 4, color: "#8a8986", font: { size: 10 }, callback: (v) => money(Number(v), currency).replace(/\.00$/, "") }, border: { display: false } },
                    },
                  }}
                />
              </div>
            )}

            {failed.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Meta did not return charges for {failed.length} account(s): {String(failed[0].error).replace(/\.?$/, ".")}
                  {hasMeta ? "" : " Showing HoverChat's estimate instead."}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Meta charges your card directly. Figures are Meta's approximate charges before tax; the final invoice can differ slightly.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href="https://business.facebook.com/billing_hub/payment_activity" target="_blank" rel="noreferrer">
                    Meta invoices <ExternalLink className="ml-1 h-3 w-3" />
                  </a>
                </Button>
                <Button asChild size="sm">
                  <Link href="/whatsapp-usage">Usage details <ArrowRight className="ml-1 h-3 w-3" /></Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
