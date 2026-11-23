/** Reseller portal — dashboard. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, CalendarClock, CreditCard, IndianRupee, UserPlus, Users } from "lucide-react";
import { Bar, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBlock, SkeletonGrid, StatCard, fmtInt, getJson } from "@/components/meta-billing/shared";
import { fmtMoney } from "@/components/reseller/shared";

export function useResellerMe() {
  return useQuery<any>({ queryKey: ["/api/reseller/me"], queryFn: () => getJson("/api/reseller/me"), staleTime: 60_000 });
}

export default function ResellerDashboard() {
  const { data: me } = useResellerMe();
  const { data, isLoading, isError, error } = useQuery<any>({ queryKey: ["/api/reseller/dashboard"], queryFn: () => getJson("/api/reseller/dashboard") });
  const d = data;
  const used = d?.customers.total ?? 0;
  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Reseller Dashboard" subtitle={me ? `${me.businessName} · ${me.resellerCode}` : "Your customers, sales and margin"} />
      <main className="space-y-5 p-4 sm:p-6">
        {me?.expired && (
          <p className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertTriangle className="h-4 w-4" />Your reseller agreement expired on {new Date(me.validUntil).toDateString()}. You can view data but cannot sell until HoverChat renews it.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Customers: <strong className="text-foreground">{used}</strong> of {me?.maxCustomers ?? "—"} allowed</p>
          {me?.permissions?.createCustomers && <Link href="/reseller/customers/new"><Button><UserPlus className="mr-2 h-4 w-4" />Add customer</Button></Link>}
        </div>
        {isLoading ? <SkeletonGrid n={8} /> : isError ? <ErrorBlock error={error} /> : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Total customers" value={fmtInt(d.customers.total)} icon={Users} tone="brand" hint={`${fmtInt(d.customers.active)} active · ${fmtInt(d.customers.inactive)} inactive`} />
              <StatCard label="Subscriptions sold" value={fmtInt(d.subscriptions.sold)} icon={CreditCard} hint={`${fmtInt(d.subscriptions.active)} active · ${fmtInt(d.subscriptions.expired)} expired`} />
              <StatCard label="Sales this month" value={fmtMoney(d.thisMonth.sales)} icon={IndianRupee} hint={`${fmtInt(d.thisMonth.count)} paid sale(s)`} />
              <StatCard label="Gross margin (all time)" value={fmtMoney(d.balances.grossMargin)} icon={IndianRupee} tone="brand" hint={`Withdrawable ${fmtMoney(d.balances.withdrawable)} · on hold ${fmtMoney(d.balances.onHold)}`} />
              <StatCard label="Pending payments" value={fmtMoney(d.pendingPayments.amount)} hint={`${fmtInt(d.pendingPayments.count)} invoice(s) · projected margin ${fmtMoney(d.pendingPayments.projectedMargin)}`} />
              <StatCard label="Upcoming renewals (30d)" value={fmtInt(d.subscriptions.upcomingRenewals30d)} icon={CalendarClock} />
              <StatCard label="Awaiting first payment" value={fmtInt(d.subscriptions.pending)} />
              <StatCard label="Margin this month" value={fmtMoney(d.thisMonth.margin)} />
            </div>
            <Card className="border-border shadow-none">
              <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Customer growth</CardTitle><p className="text-xs text-muted-foreground">New customers per month and running total (12 months)</p></CardHeader>
              <CardContent className="h-[260px] pt-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={d.growth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(120,120,120,0.15)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(m) => { const [y, mo] = m.split("-"); return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "short" }); }} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="added" name="New customers" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Line dataKey="total" name="Total customers" stroke="var(--brand, #08a957)" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">Gross margin counts paid sales after refunds. Earnings become withdrawable after a {me?.payoutHoldDays ?? 7}-day hold; payouts are made by HoverChat. You sell HoverChat subscriptions only — customers pay Meta directly for WhatsApp messaging.</p>
          </>
        )}
      </main>
    </div>
  );
}

