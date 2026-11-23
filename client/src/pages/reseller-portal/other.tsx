/** Reseller portal — subscriptions, sales & earnings, transactions, pricing, profile. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { IndianRupee, Lock, Wallet } from "lucide-react";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { EmptyBlock, ErrorBlock, SkeletonGrid, StatCard, fmtInt, getJson } from "@/components/meta-billing/shared";
import { describePricing, fmtDate, fmtMoney, MODEL_LABEL, SalesFilters, type SalesFilterState, salesQuery, SalesTable, send, StatusPill } from "@/components/reseller/shared";
import { useResellerMe } from "./dashboard";

export function ResellerSubscriptionsPage() {
  const [status, setStatus] = useState("all");
  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["/api/reseller/subscriptions", status],
    queryFn: () => getJson(`/api/reseller/subscriptions${status === "all" ? "" : `?status=${status}`}`),
  });
  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Subscriptions" subtitle="Current subscription of each of your customers, soonest renewal first" />
      <main className="space-y-4 p-4 sm:p-6">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>{["all", "active", "pending", "expired"].map((s) => <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>)}</TabsList>
        </Tabs>
        <Card className="border-border shadow-none">
          <CardContent className="overflow-x-auto p-0">
            {isLoading ? <div className="m-4 h-40 animate-pulse rounded-lg bg-muted" /> : isError ? <div className="p-4"><ErrorBlock error={error} /></div> : data.rows.length === 0 ? <div className="p-4"><EmptyBlock title="No subscriptions" /></div> : (
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Customer</th><th className="py-2 pr-3 font-medium">Plan</th><th className="py-2 pr-3 font-medium">Status</th><th className="py-2 pr-3 font-medium">Started</th><th className="py-2 pr-4 font-medium">Renewal / expiry</th></tr></thead>
                <tbody>
                  {data.rows.map((r: any) => {
                    const days = r.subscription ? Math.ceil((new Date(r.subscription.endDate).getTime() - Date.now()) / 86400000) : null;
                    return (
                      <tr key={r.customerUserId} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2"><Link href={`/reseller/customers/${r.customerUserId}`} className="font-medium hover:text-primary">{r.customer}</Link><div className="text-xs text-muted-foreground">{r.email}</div></td>
                        <td className="py-2 pr-3">{r.subscription?.planName ?? "—"} <span className="text-xs capitalize text-muted-foreground">{r.subscription?.billingCycle}</span></td>
                        <td className="py-2 pr-3"><StatusPill status={r.subscription?.status ?? "none"} /></td>
                        <td className="py-2 pr-3 text-xs">{fmtDate(r.subscription?.startDate)}</td>
                        <td className="py-2 pr-4 text-xs">{fmtDate(r.subscription?.endDate)}{days !== null && r.subscription?.status === "active" && <span className={`ml-2 ${days <= 7 ? "font-semibold text-amber-700" : "text-muted-foreground"}`}>{days} day(s)</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function useCatalogPlans() {
  const { data = [] } = useQuery<any[]>({ queryKey: ["/api/reseller/catalog"], queryFn: () => getJson("/api/reseller/catalog") });
  const map = new Map<string, string>();
  for (const c of data) map.set(c.planId, c.planName);
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

export function ResellerSalesPage() {
  const [f, setF] = useState<SalesFilterState>({ range: "this_month" });
  const [page, setPage] = useState(1);
  const plans = useCatalogPlans();
  const incomplete = f.range === "custom" && (!f.from || !f.to);
  const sales = useQuery<any>({ queryKey: ["/api/reseller/sales", f, page], queryFn: () => getJson(`/api/reseller/sales${salesQuery(f, { page })}`), enabled: !incomplete });
  const earn = useQuery<any>({ queryKey: ["/api/reseller/earnings"], queryFn: () => getJson("/api/reseller/earnings") });
  const t = sales.data?.totals;
  const b = earn.data?.balances;
  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Sales & Earnings" subtitle="Every sale with frozen pricing, and your margin ledger" />
      <main className="space-y-5 p-4 sm:p-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Earnings balance</h2>
          {earn.isLoading ? <SkeletonGrid n={4} /> : b && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Gross margin" value={fmtMoney(b.grossMargin)} icon={IndianRupee} tone="brand" hint="Paid sales after refunds" />
              <StatCard label="On hold" value={fmtMoney(b.onHold)} icon={Lock} hint={`Released ${earn.data.payoutHoldDays} days after payment`} />
              <StatCard label="Withdrawable" value={fmtMoney(b.withdrawable)} icon={Wallet} tone="brand" hint="Paid out manually by HoverChat" />
              <StatCard label="Paid out" value={fmtMoney(b.paidOut)} hint={b.reversed ? `Refund reversals ${fmtMoney(b.reversed)}` : undefined} />
            </div>
          )}
        </section>
        <SalesFilters value={f} onChange={(v) => { setF(v); setPage(1); }} plans={plans} />
        {sales.isError ? <ErrorBlock error={sales.error} /> : t && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatCard label="Total sales" value={fmtMoney(t.totalSales)} hint={`${fmtInt(t.count)} sale(s)`} />
            <StatCard label="Paid sales" value={fmtMoney(t.paidSales)} hint={`${fmtInt(t.paidCount)} paid`} />
            <StatCard label="Pending payments" value={fmtMoney(t.pendingAmount)} hint={`${fmtInt(t.pendingCount)} open`} />
            <StatCard label="Gross margin" value={fmtMoney(t.grossMargin)} tone="brand" />
            <StatCard label="Refunded" value={fmtMoney(t.refundedAmount)} hint={`${fmtInt(t.refundedCount)} transaction(s)`} />
            <StatCard label="Cancelled" value={fmtInt(t.cancelledCount)} />
          </div>
        )}
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Sales</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {sales.isLoading ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : <SalesTable rows={sales.data?.rows ?? []} />}
            {sales.data?.pagination?.totalPages > 1 && (
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= sales.data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Margin ledger</CardTitle><p className="text-xs text-muted-foreground">{earn.data?.note}</p></CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            {(earn.data?.ledger ?? []).length === 0 ? <EmptyBlock title="No ledger entries yet" body="Entries appear when your customers' payments succeed." /> : (
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Type</th><th className="py-2 pr-3 font-medium">Description</th><th className="py-2 pr-3 font-medium">Available</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
                <tbody>{earn.data.ledger.map((l: any) => (
                  <tr key={l.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 text-xs">{fmtDate(l.createdAt, true)}</td>
                    <td className="py-2 pr-3 capitalize">{l.entryType}</td>
                    <td className="py-2 pr-3 text-xs">{l.description}</td>
                    <td className="py-2 pr-3 text-xs">{l.entryType === "earning" ? fmtDate(l.availableAt) : "—"}</td>
                    <td className={`py-2 text-right tabular-nums ${Number(l.amount) < 0 ? "text-red-600" : ""}`}>{fmtMoney(Number(l.amount))}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export function ResellerTransactionsPage() {
  const [f, setF] = useState<SalesFilterState>({ range: "all" });
  const { data: me } = useResellerMe();
  const plans = useCatalogPlans();
  const incomplete = f.range === "custom" && (!f.from || !f.to);
  const { data, isLoading, isError, error } = useQuery<any>({ queryKey: ["/api/reseller/transactions", f], queryFn: () => getJson(`/api/reseller/transactions${salesQuery(f, { pageSize: 100 })}`), enabled: !incomplete && !!me?.permissions?.viewTransactions });
  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Invoices & Transactions" subtitle="Customer invoices raised through your account" />
      <main className="space-y-4 p-4 sm:p-6">
        {me && !me.permissions.viewTransactions ? <ErrorBlock error={new Error("Transaction history is not enabled for your account.")} /> : (
          <>
            <SalesFilters value={f} onChange={setF} plans={plans} />
            <Card className="border-border shadow-none">
              <CardContent className="overflow-x-auto p-4">
                {isLoading ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : isError ? <ErrorBlock error={error} /> : (data?.rows ?? []).length === 0 ? <EmptyBlock title="No invoices" /> : (
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Invoice</th><th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Customer</th><th className="py-2 pr-3 font-medium">Plan</th><th className="py-2 pr-3 font-medium">Status</th><th className="py-2 pr-3 font-medium">Payment ref.</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
                    <tbody>{data.rows.map((r: any) => (
                      <tr key={r.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs">HCR-{String(r.transactionId ?? r.id).slice(0, 8).toUpperCase()}</td>
                        <td className="py-2 pr-3 text-xs">{fmtDate(r.createdAt)}</td>
                        <td className="py-2 pr-3">{r.customer}</td>
                        <td className="py-2 pr-3">{r.planName} <span className="text-xs capitalize text-muted-foreground">{r.saleType}</span></td>
                        <td className="py-2 pr-3"><StatusPill status={r.paymentStatus} /></td>
                        <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">{r.paymentReference ?? "—"}</td>
                        <td className="py-2 text-right tabular-nums">{fmtMoney(r.sellingPrice, r.currency)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

export function ResellerPricingPage() {
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/reseller/catalog"], queryFn: () => getJson("/api/reseller/catalog") });
  const { data: me } = useResellerMe();
  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Pricing & Plans" subtitle="Plans HoverChat has authorised for you. Wholesale costs are set by HoverChat." />
      <main className="space-y-4 p-4 sm:p-6">
        {isLoading ? <SkeletonGrid /> : data.length === 0 ? <EmptyBlock title="No plans authorised yet" body="Contact HoverChat to enable plans for your account." /> : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map((p) => (
              <Card key={p.pricingId} className="border-border shadow-none">
                <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">{p.planName}</CardTitle><p className="text-xs capitalize text-muted-foreground">{p.billingCycle} · pricing v{p.version}</p></CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span>{MODEL_LABEL[p.pricingModel]}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Your cost / commission</span><span>{describePricing(p)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Suggested retail</span><span className="font-semibold">{fmtMoney(p.suggestedRetailPrice)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Allowed range</span><span>{fmtMoney(p.minSellingPrice)}{p.maxSellingPrice !== null ? ` – ${fmtMoney(p.maxSellingPrice)}` : " +"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Margin at SRP</span><span className="font-semibold text-primary">{fmtMoney(p.pricingModel === "wholesale" ? p.suggestedRetailPrice - p.wholesalePrice : p.pricingModel === "commission_percent" ? (p.suggestedRetailPrice * p.commissionPercent) / 100 : p.fixedCommission)}</span></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{me?.permissions?.setSellingPrice ? "You can choose any selling price inside the allowed range." : "Your account sells at the suggested retail price."} Existing subscriptions keep the price agreed at sale time. You sell HoverChat subscriptions only — WhatsApp messaging is billed by Meta directly to each customer.</p>
      </main>
    </div>
  );
}

export function ResellerProfilePage() {
  const { data: me, isLoading } = useResellerMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [f, setF] = useState<any>(null);
  const v = f ?? (me ? { contactPerson: me.contactPerson, mobile: me.mobile, companyName: me.companyName ?? "", address: me.address ?? "" } : null);
  const save = async () => {
    try {
      await send("PATCH", "/api/reseller/me", v);
      qc.invalidateQueries({ queryKey: ["/api/reseller/me"] });
      toast({ title: "Profile saved" });
    } catch (e: any) { toast({ title: "Could not save", description: e.message, variant: "destructive" }); }
  };
  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Profile & Settings" subtitle="Your reseller details" />
      <main className="grid max-w-5xl grid-cols-1 gap-4 p-4 sm:p-6 lg:grid-cols-2">
        {isLoading || !v ? <SkeletonGrid n={2} /> : (
          <>
            <Card className="border-border shadow-none">
              <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Contact details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Business name</Label><Input className="mt-1" value={me.businessName} readOnly /></div>
                <div><Label>Login email</Label><Input className="mt-1" value={me.email} readOnly /></div>
                <div><Label htmlFor="pf-cp">Contact person</Label><Input id="pf-cp" className="mt-1" value={v.contactPerson} onChange={(e) => setF({ ...v, contactPerson: e.target.value })} /></div>
                <div><Label htmlFor="pf-mb">Mobile</Label><Input id="pf-mb" className="mt-1" value={v.mobile} onChange={(e) => setF({ ...v, mobile: e.target.value })} /></div>
                <div><Label htmlFor="pf-co">Company name</Label><Input id="pf-co" className="mt-1" value={v.companyName} onChange={(e) => setF({ ...v, companyName: e.target.value })} /></div>
                <div><Label htmlFor="pf-ad">Address</Label><Input id="pf-ad" className="mt-1" value={v.address} onChange={(e) => setF({ ...v, address: e.target.value })} /></div>
                <Button onClick={save}>Save</Button>
              </CardContent>
            </Card>
            <Card className="border-border shadow-none">
              <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Agreement (set by HoverChat)</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Reseller code</span><span className="font-mono">{me.resellerCode}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusPill status={me.status} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Customer limit</span><span>{me.maxCustomers}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valid until</span><span>{me.validUntil ? fmtDate(me.validUntil) : "No expiry"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Activation</span><span>{me.activationPolicy === "immediate" ? "Immediately on sale" : "After customer payment"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Refund policy</span><span className="capitalize">{me.refundPolicy} margin reversal</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payout hold</span><span>{me.payoutHoldDays} days</span></div>
                <div className="pt-2">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Enabled features</p>
                  <ul className="space-y-1">{Object.entries(me.permissionLabels as Record<string, string>).map(([k, label]) => (
                    <li key={k} className="flex justify-between text-xs"><span>{label}</span><span className={me.permissions[k] ? "text-emerald-700" : "text-muted-foreground"}>{me.permissions[k] ? "Enabled" : "Off"}</span></li>
                  ))}</ul>
                </div>
                <p className="pt-2 text-xs text-muted-foreground">To change your password, sign out and use “Forgot password”.</p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
