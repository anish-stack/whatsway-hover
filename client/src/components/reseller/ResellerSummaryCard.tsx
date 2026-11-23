/** Super-admin reseller analytics (dashboard + Reseller Management header). */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Handshake } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, fmtInt, getJson } from "@/components/meta-billing/shared";
import { fmtMoney } from "./shared";

export default function ResellerSummaryCard({ compact = false }: { compact?: boolean }) {
  const { data: s, isLoading } = useQuery<any>({ queryKey: ["/api/admin/resellers/summary"], queryFn: () => getJson("/api/admin/resellers/summary?range=this_month") });
  if (isLoading || !s) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const totalCust = s.customers.direct + s.customers.reseller;
  const pct = totalCust ? Math.round((s.customers.reseller / totalCust) * 100) : 0;
  return (
    <Card className="border-border shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base sm:text-base"><Handshake className="h-4 w-4 text-primary" />Reseller channel</CardTitle>
        {compact && <Link href="/admin/resellers" className="text-sm font-medium text-primary hover:underline">Manage resellers</Link>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Resellers" value={fmtInt(s.resellers.total)} hint={`${fmtInt(s.resellers.active)} active · ${fmtInt(s.resellers.suspended)} suspended · ${fmtInt(s.resellers.pendingActivation)} invited`} />
          <StatCard label="Reseller customers" value={fmtInt(s.customers.reseller)} hint={`${pct}% of customers · ${fmtInt(s.customers.direct)} direct`} />
          <StatCard label="Sold via resellers (month)" value={fmtInt(s.period.subscriptionsSold)} hint={`${fmtInt(s.lifetime.subscriptionsSold)} lifetime`} />
          <StatCard label="Reseller revenue (month)" value={fmtMoney(s.period.revenue)} tone="brand" hint={`Margin ${fmtMoney(s.period.grossMargin)} · HoverChat keeps ${fmtMoney(s.period.platformRevenue)}`} />
        </div>
        {!compact && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Top resellers this month</p>
            {s.topResellers.length === 0 ? <p className="text-sm text-muted-foreground">No paid reseller sales this month.</p> : (
              <ol className="divide-y divide-border/60 text-sm">
                {s.topResellers.map((t: any, i: number) => (
                  <li key={t.resellerId} className="flex items-center justify-between py-2">
                    <Link href={`/admin/resellers/${t.resellerId}`} className="hover:text-primary"><span className="mr-2 text-muted-foreground">{i + 1}.</span>{t.name} <span className="font-mono text-xs text-muted-foreground">{t.code}</span></Link>
                    <span className="tabular-nums">{fmtMoney(t.revenue)} <span className="text-xs text-muted-foreground">· {t.sales} sale(s) · margin {fmtMoney(t.margin)}</span></span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
