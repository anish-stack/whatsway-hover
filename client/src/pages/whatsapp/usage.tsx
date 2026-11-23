/**
 * WhatsApp Usage — Meta message consumption and ESTIMATED Meta cost.
 * Subscription revenue never appears here.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck, IndianRupee, MessageSquare, XCircle } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CATEGORY_COLORS, CATEGORY_LABEL, EmptyBlock, ErrorBlock, MetaBillingNotice, SkeletonGrid, StatCard,
  UsageFilters, type UsageFilterState, filterQuery, fmtDate, fmtInt, fmtMoney, getJson, qs,
} from "@/components/meta-billing/shared";
import { BreakdownBars, CategoryVolumeChart, DeliveryRateChart, SpendChart } from "@/components/meta-billing/usage-charts";

export default function WhatsAppUsagePage() {
  const [filters, setFilters] = useState<UsageFilterState>({ range: "this_month" });
  const [granularity, setGranularity] = useState<"day" | "month">("day");
  const [page, setPage] = useState(1);
  const base = filterQuery(filters);
  const customIncomplete = filters.range === "custom" && (!filters.from || !filters.to);

  const summary = useQuery<any>({
    queryKey: ["/api/whatsapp/usage/summary", base],
    queryFn: () => getJson(`/api/whatsapp/usage/summary${qs(base)}`),
    enabled: !customIncomplete,
  });
  const series = useQuery<any>({
    queryKey: ["/api/whatsapp/usage/timeseries", base, granularity],
    queryFn: () => getJson(`/api/whatsapp/usage/timeseries${qs({ ...base, granularity })}`),
    enabled: !customIncomplete,
  });
  const byCountry = useQuery<any>({
    queryKey: ["/api/whatsapp/usage/breakdown", "country", base],
    queryFn: () => getJson(`/api/whatsapp/usage/breakdown${qs({ ...base, by: "country" })}`),
    enabled: !customIncomplete,
  });
  const byCampaign = useQuery<any>({
    queryKey: ["/api/whatsapp/usage/breakdown", "campaign", base],
    queryFn: () => getJson(`/api/whatsapp/usage/breakdown${qs({ ...base, by: "campaign" })}`),
    enabled: !customIncomplete,
  });
  const history = useQuery<any>({
    queryKey: ["/api/whatsapp/usage/history", base, page],
    queryFn: () => getJson(`/api/whatsapp/usage/history${qs({ ...base, page, pageSize: 25 })}`),
    enabled: !customIncomplete,
  });

  const s = summary.data;
  const currency = s?.estimatedCost?.currency || "INR";
  const costValue = s?.estimatedCost?.amount === null
    ? Object.entries(s?.estimatedCost?.byCurrency ?? {}).map(([c, v]) => fmtMoney(v as number, c)).join(" + ")
    : fmtMoney(s?.estimatedCost?.amount ?? 0, currency);

  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="WhatsApp Usage" subtitle="Message consumption and estimated Meta charges" />
      <main className="space-y-5 p-4 sm:p-6">
        <MetaBillingNotice />
        <UsageFilters value={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
        {customIncomplete && <p className="text-sm text-muted-foreground">Pick both dates for a custom range.</p>}

        {summary.isLoading ? <SkeletonGrid n={8} /> : summary.isError ? <ErrorBlock error={summary.error} /> : s && (
          <>
            <p className="text-xs text-muted-foreground">
              {s.period.label}: {fmtDate(s.period.from)} – {fmtDate(new Date(new Date(s.period.to).getTime() - 1))} ({s.period.timezone})
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total messages" value={fmtInt(s.totals.total)} icon={MessageSquare} hint={`${fmtInt(s.totals.sent)} accepted by Meta`} />
              <StatCard label="Delivered" value={fmtInt(s.totals.delivered)} icon={CheckCheck} tone="brand" hint={`${s.totals.deliveryRate}% delivery rate`} />
              <StatCard label="Failed" value={fmtInt(s.totals.failed)} icon={XCircle} tone={s.totals.failed ? "danger" : "default"} />
              <StatCard label="Estimated Meta cost" value={costValue} icon={IndianRupee} tone="brand"
                hint={`${fmtInt(s.totals.billable)} billable delivered${s.totals.unpriced ? ` · ${fmtInt(s.totals.unpriced)} without a rate` : ""}`} />
              {(["marketing", "utility", "authentication", "service"] as const).map((k) => (
                <StatCard key={k} label={`${CATEGORY_LABEL[k]} messages`}
                  value={<span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[k] }} />{fmtInt(s.categories[k])}</span>} />
              ))}
            </div>
            {s.totals.unpriced > 0 && (
              <p className="text-xs text-amber-700">
                {fmtInt(s.totals.unpriced)} billable messages had no active rate for their country/category, so they are not in the estimate. Ask your administrator to add the rate.
              </p>
            )}
          </>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Trends</h2>
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v as "day" | "month")}>
            <TabsList className="h-8">
              <TabsTrigger value="day" className="text-xs">Daily</TabsTrigger>
              <TabsTrigger value="month" className="text-xs">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {series.isError ? <ErrorBlock error={series.error} /> : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <CategoryVolumeChart title={granularity === "day" ? "Daily consumption" : "Monthly consumption"} points={series.data?.points ?? []} />
            <SpendChart points={series.data?.points ?? []} currency={currency} />
            <DeliveryRateChart points={series.data?.points ?? []} />
            <BreakdownBars title="Country-wise usage" rows={byCountry.data?.rows ?? []} />
          </div>
        )}

        <Card className="border-border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base font-semibold">Campaign usage</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            {(byCampaign.data?.rows ?? []).length === 0 ? <EmptyBlock title="No campaign messages in this period" /> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Campaign</th><th className="py-2 pr-3 text-right font-medium">Messages</th>
                  <th className="py-2 pr-3 text-right font-medium">Delivered</th><th className="py-2 pr-3 text-right font-medium">Failed</th>
                  <th className="py-2 text-right font-medium">Est. cost</th></tr></thead>
                <tbody>
                  {byCampaign.data.rows.map((r: any) => (
                    <tr key={r.key || "none"} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">{r.label}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(r.total)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(r.delivered)} <span className="text-xs text-muted-foreground">({r.deliveryRate}%)</span></td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(r.failed)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtMoney(r.cost, r.currency || currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base font-semibold">Message log</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            {history.isError ? <ErrorBlock error={history.error} /> : (history.data?.rows ?? []).length === 0 ? <EmptyBlock title="No tracked messages" /> : (
              <>
                <table className="w-full min-w-[760px] text-sm">
                  <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Time</th><th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Country</th><th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Template</th><th className="py-2 pr-3 text-right font-medium">Rate</th>
                    <th className="py-2 text-right font-medium">Est. cost</th></tr></thead>
                  <tbody>
                    {history.data.rows.map((r: any) => (
                      <tr key={r.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(r.createdAt, true)}</td>
                        <td className="py-2 pr-3"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: CATEGORY_COLORS[r.category === "authentication_international" ? "authentication" : r.category] ?? "#999" }} />{CATEGORY_LABEL[r.category] ?? r.category}</span>
                          {!r.billable && <Badge variant="outline" className="ml-1.5 text-[10px]">free</Badge>}</td>
                        <td className="py-2 pr-3">{r.recipientCountry === "*" ? "Other" : r.recipientCountry}</td>
                        <td className="py-2 pr-3 capitalize">{r.status}{r.errorCode ? <span className="ml-1 font-mono text-xs text-red-600">#{r.errorCode}</span> : null}</td>
                        <td className="py-2 pr-3 text-xs">{r.templateName || "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-xs">{r.appliedRate ? `${Number(r.appliedRate).toFixed(4)} ${r.currency}` : "—"}</td>
                        <td className="py-2 text-right tabular-nums">{r.appliedRate ? fmtMoney(Number(r.estimatedCost), r.currency || currency, 4) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Page {history.data.pagination.page} of {Math.max(1, history.data.pagination.totalPages)} · {fmtInt(history.data.pagination.total)} messages</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button size="sm" variant="outline" disabled={page >= history.data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

