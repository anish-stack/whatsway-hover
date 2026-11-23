/**
 * Super admin — Billing & Usage.
 * Tab 1: HoverChat subscription revenue (our money).
 * Tab 2: Meta usage estimates (customers pay Meta directly — NOT revenue).
 * The two are never summed or shown in the same figure.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck, IndianRupee, MessageSquare, Users, XCircle } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CATEGORY_COLORS, CATEGORY_LABEL, EmptyBlock, ErrorBlock, SkeletonGrid, StatCard, UsageFilters, type UsageFilterState,
  filterQuery, fmtDate, fmtInt, fmtMoney, getJson, qs,
} from "@/components/meta-billing/shared";
import { BreakdownBars, CategoryVolumeChart, SpendChart } from "@/components/meta-billing/usage-charts";

function RevenueTab() {
  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["/api/admin/billing/overview"],
    queryFn: () => getJson("/api/admin/billing/overview"),
  });
  if (isLoading) return <SkeletonGrid />;
  if (isError) return <ErrorBlock error={error} />;
  const r = data.hoverchatSubscriptionRevenue;
  const totals = Object.entries(r.revenueTotals ?? {}) as [string, number][];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue (12 months)" icon={IndianRupee} tone="brand"
          value={totals.length ? totals.map(([c, v]) => fmtMoney(v, c, 0)).join(" + ") : fmtMoney(0)} />
        <StatCard label="Active subscriptions" value={fmtInt(r.subscriptions?.active)} icon={Users} />
        <StatCard label="Renewing in 7 days" value={fmtInt(r.subscriptions?.renewingIn7d)} />
        <StatCard label="Expired · cancelled" value={`${fmtInt(r.subscriptions?.expired)} · ${fmtInt(r.subscriptions?.cancelled)}`} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Revenue by month</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            {r.revenueByMonth.length === 0 ? <EmptyBlock title="No completed payments yet" /> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Month</th><th className="py-2 text-right font-medium">Payments</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
                <tbody>{r.revenueByMonth.map((m: any) => (
                  <tr key={`${m.month}-${m.currency}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2">{m.month}</td><td className="py-2 text-right tabular-nums">{fmtInt(m.count)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(m.amount, m.currency || "INR")}</td></tr>
                ))}</tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Recent subscription payments & invoices</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            {r.recentPayments.length === 0 ? <EmptyBlock title="No payments" /> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-2 font-medium">Date</th><th className="py-2 pr-2 font-medium">Customer</th><th className="py-2 pr-2 font-medium">Plan</th><th className="py-2 pr-2 font-medium">Status</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
                <tbody>{r.recentPayments.slice(0, 15).map((p: any) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-2 text-xs">{fmtDate(p.paidAt ?? p.createdAt)}</td>
                    <td className="py-2 pr-2 text-xs">{p.email}</td>
                    <td className="py-2 pr-2 text-xs">{p.planName ?? "—"}</td>
                    <td className="py-2 pr-2"><Badge variant="outline" className="capitalize">{p.status}</Badge></td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(p.amount, p.currency || "INR")}</td></tr>
                ))}</tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetaUsageTab() {
  const [filters, setFilters] = useState<UsageFilterState>({ range: "this_month" });
  const [granularity, setGranularity] = useState<"day" | "month">("day");
  const base = filterQuery(filters);
  const incomplete = filters.range === "custom" && (!filters.from || !filters.to);
  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["/api/admin/whatsapp/usage", base, granularity],
    queryFn: () => getJson(`/api/admin/whatsapp/usage${qs({ ...base, granularity })}`),
    enabled: !incomplete,
  });
  const s = data?.summary;
  const currency = s?.estimatedCost?.currency || "INR";
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        These are estimates of what Meta bills each customer directly. They are not HoverChat revenue and are never collected by HoverChat.
      </p>
      <UsageFilters value={filters} onChange={setFilters} showDimensions={false} />
      <div className="flex gap-2 text-xs">
        {(["day", "month"] as const).map((g) => (
          <button key={g} onClick={() => setGranularity(g)} className={`rounded-lg border px-3 py-1 ${granularity === g ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
            {g === "day" ? "Daily" : "Monthly"}
          </button>
        ))}
      </div>
      {isLoading ? <SkeletonGrid n={8} /> : isError ? <ErrorBlock error={error} /> : s && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Messages" value={fmtInt(s.totals.total)} icon={MessageSquare} />
            <StatCard label="Delivered" value={fmtInt(s.totals.delivered)} icon={CheckCheck} tone="brand" hint={`${s.totals.deliveryRate}%`} />
            <StatCard label="Failed" value={fmtInt(s.totals.failed)} icon={XCircle} tone={s.totals.failed ? "danger" : "default"} />
            <StatCard label="Estimated Meta usage" value={s.estimatedCost.amount === null ? "Multiple currencies" : fmtMoney(s.estimatedCost.amount, currency)} icon={IndianRupee}
              hint={s.totals.unpriced ? `${fmtInt(s.totals.unpriced)} billable without a rate` : "Paid by customers to Meta"} />
            {(["marketing", "utility", "authentication", "service"] as const).map((k) => (
              <StatCard key={k} label={CATEGORY_LABEL[k]} value={<span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[k] }} />{fmtInt(s.categories[k])}</span>} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <CategoryVolumeChart title={granularity === "day" ? "Daily consumption" : "Monthly consumption"} points={data.series.points} />
            <SpendChart points={data.series.points} currency={currency} />
            <BreakdownBars title="Country-wise consumption" rows={data.byCountry.rows} />
            <BreakdownBars title="Category-wise estimated cost" rows={data.byCategory.rows.map((r: any) => ({ ...r, label: CATEGORY_LABEL[r.key] ?? r.key }))} metric="cost" />
          </div>
          <Card className="border-border shadow-none">
            <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Customer-wise consumption</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              {data.byCustomer.rows.length === 0 ? <EmptyBlock title="No usage in this period" /> : (
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Customer</th><th className="py-2 pr-3 text-right font-medium">Messages</th><th className="py-2 pr-3 text-right font-medium">Delivered</th><th className="py-2 pr-3 text-right font-medium">Failed</th><th className="py-2 pr-3 text-right font-medium">Billable</th><th className="py-2 text-right font-medium">Est. Meta usage</th></tr></thead>
                  <tbody>{data.byCustomer.rows.map((r: any) => (
                    <tr key={r.key} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">{r.label}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(r.total)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(r.delivered)} <span className="text-xs text-muted-foreground">({r.deliveryRate}%)</span></td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(r.failed)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(r.billable)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtMoney(r.cost, r.currency || currency)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function AdminMetaBillingPage() {
  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Billing & Meta Usage" subtitle="HoverChat revenue and Meta usage estimates, kept separate" />
      <main className="p-4 sm:p-6">
        <Tabs defaultValue="revenue">
          <TabsList>
            <TabsTrigger value="revenue">HoverChat subscription revenue</TabsTrigger>
            <TabsTrigger value="meta">Meta usage estimates</TabsTrigger>
          </TabsList>
          <TabsContent value="revenue" className="mt-4"><RevenueTab /></TabsContent>
          <TabsContent value="meta" className="mt-4"><MetaUsageTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
