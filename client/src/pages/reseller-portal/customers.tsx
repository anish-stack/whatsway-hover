/** Reseller portal — customers: list, add, detail (renew, remind, edit). */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, Copy, Mail, RefreshCw, Search, UserPlus } from "lucide-react";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { EmptyBlock, ErrorBlock, getJson } from "@/components/meta-billing/shared";
import { describePricing, fmtDate, fmtMoney, SalesTable, send, StatusPill } from "@/components/reseller/shared";
import { addCycles } from "@shared/reseller-pricing";
import { useResellerMe } from "./dashboard";

function copy(text: string, toast: any) {
  navigator.clipboard?.writeText(text).then(() => toast({ title: "Link copied" })).catch(() => {});
}

export function ResellerCustomersPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data: me } = useResellerMe();
  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["/api/reseller/customers", q, page],
    queryFn: () => getJson(`/api/reseller/customers?search=${encodeURIComponent(q)}&page=${page}`),
  });
  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="My Customers" subtitle="Customers you onboarded. Each one uses the standard HoverChat product." />
      <main className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form className="relative w-full max-w-sm" onSubmit={(e) => { e.preventDefault(); setQ(search); setPage(1); }}>
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Search customers" className="pl-9" placeholder="Search name, business, email, mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
          </form>
          {me?.permissions?.createCustomers && <Link href="/reseller/customers/new"><Button><UserPlus className="mr-2 h-4 w-4" />Add customer</Button></Link>}
        </div>
        <Card className="border-border shadow-none">
          <CardContent className="overflow-x-auto p-0">
            {isLoading ? <div className="m-4 h-40 animate-pulse rounded-lg bg-muted" /> : isError ? <div className="p-4"><ErrorBlock error={error} /></div> : (data?.rows ?? []).length === 0 ? <div className="p-4"><EmptyBlock title="No customers yet" body="Add your first customer to start selling HoverChat." /></div> : (
              <table className="w-full min-w-[860px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Customer</th><th className="py-2 pr-3 font-medium">Account</th>
                  <th className="py-2 pr-3 font-medium">Plan</th><th className="py-2 pr-3 font-medium">Subscription</th>
                  <th className="py-2 pr-3 font-medium">Renews / ends</th><th className="py-2 pr-4 font-medium">Open invoice</th></tr></thead>
                <tbody>
                  {data.rows.map((c: any) => (
                    <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2"><Link href={`/reseller/customers/${c.id}`} className="font-medium text-foreground hover:text-primary">{c.businessName || c.firstName}</Link><div className="text-xs text-muted-foreground">{c.email} · {c.mobile}</div></td>
                      <td className="py-2 pr-3"><StatusPill status={c.invitePending ? "pending_activation" : c.status} /></td>
                      <td className="py-2 pr-3">{c.subscription?.planName ?? "—"}<div className="text-xs capitalize text-muted-foreground">{c.subscription?.billingCycle}</div></td>
                      <td className="py-2 pr-3"><StatusPill status={c.subscription?.status ?? "none"} /></td>
                      <td className="py-2 pr-3 text-xs">{fmtDate(c.subscription?.endDate)}</td>
                      <td className="py-2 pr-4">{c.openInvoice ? <span className="text-xs">{fmtMoney(c.openInvoice.amount)} <StatusPill status={c.openInvoice.status} className="ml-1" /></span> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </main>
    </div>
  );
}

/** Plan + price picker shared by new customer and renewal forms. */
function PlanPricePicker({ catalog, value, onChange, canSetPrice }: {
  catalog: any[]; canSetPrice: boolean;
  value: { pricingId?: string; unit?: string; cycles: string };
  onChange: (v: { pricingId?: string; unit?: string; cycles: string }) => void;
}) {
  const row = catalog.find((c) => c.pricingId === value.pricingId);
  const unit = Number(value.unit || row?.suggestedRetailPrice || 0);
  const cycles = Math.max(1, Number(value.cycles) || 1);
  const total = unit * cycles;
  let margin = 0;
  if (row) {
    if (row.pricingModel === "wholesale") margin = (unit - row.wholesalePrice) * cycles;
    else if (row.pricingModel === "commission_percent") margin = (total * row.commissionPercent) / 100;
    else margin = row.fixedCommission * cycles;
  }
  const outOfRange = row && (unit < row.minSellingPrice || (row.maxSellingPrice !== null && unit > row.maxSellingPrice));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label>Plan & billing</Label>
        <Select value={value.pricingId} onValueChange={(v) => { const r = catalog.find((c) => c.pricingId === v); onChange({ ...value, pricingId: v, unit: r ? String(r.suggestedRetailPrice) : "" }); }}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Select an authorised plan" /></SelectTrigger>
          <SelectContent>
            {catalog.map((c) => <SelectItem key={c.pricingId} value={c.pricingId}>{c.planName} · {c.billingCycle} · SRP {fmtMoney(c.suggestedRetailPrice)}</SelectItem>)}
          </SelectContent>
        </Select>
        {catalog.length === 0 && <p className="mt-1 text-xs text-amber-700">No plans are authorised for your account yet. Contact HoverChat.</p>}
      </div>
      <div>
        <Label htmlFor="pp-unit">Selling price per {row?.billingCycle === "annual" ? "year" : "month"}</Label>
        <Input id="pp-unit" type="number" step="0.01" className="mt-1" disabled={!row || !canSetPrice} value={value.unit ?? ""} onChange={(e) => onChange({ ...value, unit: e.target.value })} />
        {row && <p className={`mt-1 text-xs ${outOfRange ? "text-red-600" : "text-muted-foreground"}`}>Allowed {fmtMoney(row.minSellingPrice)}{row.maxSellingPrice !== null ? ` – ${fmtMoney(row.maxSellingPrice)}` : " or more"} · {describePricing(row)}{!canSetPrice ? " · fixed at SRP" : ""}</p>}
      </div>
      <div>
        <Label htmlFor="pp-cycles">Duration ({row?.billingCycle === "annual" ? "years" : "months"})</Label>
        <Input id="pp-cycles" type="number" min={1} max={36} className="mt-1" value={value.cycles} onChange={(e) => onChange({ ...value, cycles: e.target.value })} />
      </div>
      {row && (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-3 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Customer pays</span><span className="text-right font-semibold tabular-nums">{fmtMoney(total)}</span>
          <span className="text-muted-foreground">Your gross margin (once paid)</span><span className="text-right font-semibold tabular-nums text-primary">{fmtMoney(Math.max(0, margin))}</span>
        </div>
      )}
    </div>
  );
}

export function ResellerAddCustomerPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: me } = useResellerMe();
  const { data: catalog = [] } = useQuery<any[]>({ queryKey: ["/api/reseller/catalog"], queryFn: () => getJson("/api/reseller/catalog") });
  const [f, setF] = useState({ firstName: "", lastName: "", businessName: "", email: "", mobile: "", startDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [pp, setPp] = useState<{ pricingId?: string; unit?: string; cycles: string }>({ cycles: "1" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const idem = useMemo(() => `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, []);
  const row = catalog.find((c) => c.pricingId === pp.pricingId);
  const expiry = row ? addCycles(new Date(`${f.startDate}T00:00:00Z`), row.billingCycle, Math.max(1, Number(pp.cycles) || 1)) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!row) return toast({ title: "Select a plan", variant: "destructive" });
    setBusy(true);
    try {
      const out = await send<any>("POST", "/api/reseller/customers", {
        ...f, planId: row.planId, billingCycle: row.billingCycle, cycles: Number(pp.cycles) || 1,
        unitSellingPrice: pp.unit ? Number(pp.unit) : undefined, startDate: f.startDate, idempotencyKey: idem, sendInvite: true,
      });
      setDone(out);
      qc.invalidateQueries({ queryKey: ["/api/reseller/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/reseller/dashboard"] });
    } catch (err: any) {
      toast({ title: "Could not create customer", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Add Customer" subtitle="Creates a normal HoverChat customer account linked permanently to you" />
      <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <Link href="/reseller/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to customers</Link>
        {done ? (
          <Card className="border-border shadow-none">
            <CardHeader><CardTitle className="text-base sm:text-base">Customer created</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>We emailed the customer an account invitation and the invoice. Payment status: <StatusPill status={done.sale.paymentStatus} />. {done.sale.activationPolicy === "immediate" ? "Subscription is active now; it stays unpaid until the customer pays." : "Subscription activates automatically once the customer pays."}</p>
              {done.payUrl && <div className="flex gap-2"><Input readOnly value={done.payUrl} aria-label="Payment link" /><Button type="button" variant="outline" onClick={() => copy(done.payUrl, toast)}><Copy className="h-4 w-4" /></Button></div>}
              <p className="text-xs text-muted-foreground">Share the payment link with your customer. Payment goes to HoverChat's Razorpay checkout; your margin is recorded when it succeeds.</p>
              <div className="flex gap-2">
                <Button onClick={() => setLocation(`/reseller/customers/${done.customerUserId}`)}>Open customer</Button>
                <Button variant="outline" onClick={() => window.location.reload()}>Add another</Button>
              </div>
            </CardContent>
          </Card>
        ) : !me?.permissions?.createCustomers ? (
          <ErrorBlock error={new Error("Adding customers is not enabled for your account.")} />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Card className="border-border shadow-none">
              <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Customer</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><Label htmlFor="c-fn">First name</Label><Input id="c-fn" required className="mt-1" value={f.firstName} onChange={set("firstName")} /></div>
                <div><Label htmlFor="c-ln">Last name</Label><Input id="c-ln" className="mt-1" value={f.lastName} onChange={set("lastName")} /></div>
                <div className="sm:col-span-2"><Label htmlFor="c-bn">Business name</Label><Input id="c-bn" required className="mt-1" value={f.businessName} onChange={set("businessName")} /></div>
                <div><Label htmlFor="c-em">Email (login)</Label><Input id="c-em" type="email" required className="mt-1" value={f.email} onChange={set("email")} /></div>
                <div><Label htmlFor="c-mb">Mobile</Label><Input id="c-mb" required className="mt-1" placeholder="+91 98xxxxxxxx" value={f.mobile} onChange={set("mobile")} /></div>
                <p className="text-xs text-muted-foreground sm:col-span-2">The customer gets an email to set their own password. You never see or set customer passwords.</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-none">
              <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Subscription</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <PlanPricePicker catalog={catalog} value={pp} onChange={setPp} canSetPrice={!!me?.permissions?.setSellingPrice} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div><Label htmlFor="c-sd">Start date</Label><Input id="c-sd" type="date" className="mt-1" min={new Date().toISOString().slice(0, 10)} value={f.startDate} onChange={set("startDate")} /></div>
                  <div><Label>Expiry date</Label><Input className="mt-1" readOnly value={expiry ? expiry.toISOString().slice(0, 10) : ""} aria-label="Expiry date" /></div>
                </div>
                <div className="rounded-lg border border-border p-3 text-sm">
                  <span className="text-muted-foreground">Payment status: </span><StatusPill status="pending" />
                  <span className="ml-2 text-xs text-muted-foreground">Set automatically to paid only after the customer pays on HoverChat checkout.</span>
                </div>
                <div><Label htmlFor="c-nt">Notes (internal)</Label><Textarea id="c-nt" rows={2} className="mt-1" value={f.notes} onChange={set("notes")} /></div>
              </CardContent>
            </Card>
            <Button type="submit" disabled={busy || !row} className="w-full sm:w-auto">{busy ? "Creating…" : "Create customer & send invite"}</Button>
          </form>
        )}
      </main>
    </div>
  );
}

export function ResellerCustomerDetailPage() {
  const [, params] = useRoute("/reseller/customers/:id");
  const id = params?.id ?? "";
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: me } = useResellerMe();
  const { data, isLoading, isError, error } = useQuery<any>({ queryKey: ["/api/reseller/customers", id], queryFn: () => getJson(`/api/reseller/customers/${id}`), enabled: !!id });
  const { data: catalog = [] } = useQuery<any[]>({ queryKey: ["/api/reseller/catalog"], queryFn: () => getJson("/api/reseller/catalog") });
  const [renewOpen, setRenewOpen] = useState(false);
  const [pp, setPp] = useState<{ pricingId?: string; unit?: string; cycles: string }>({ cycles: "1" });
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/reseller/customers"] });

  const act = async (key: string, fn: () => Promise<any>, success: string) => {
    setBusy(key);
    try { const r = await fn(); toast({ title: success }); refresh(); return r; }
    catch (e: any) { toast({ title: "Action failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  };

  if (isLoading) return <div className="flex-1 p-6"><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  if (isError) return <div className="flex-1 p-6"><ErrorBlock error={error} /></div>;
  const c = data.customer;
  const open = data.sales.find((s: any) => ["pending", "pending_verification"].includes(s.paymentStatus));
  const current = data.subscriptions.find((s: any) => s.status === "active") ?? data.subscriptions[0];

  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title={c.businessName || c.firstName} subtitle={`${c.email} · ${c.mobile ?? ""}`} />
      <main className="space-y-4 p-4 sm:p-6">
        <Link href="/reseller/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to customers</Link>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border-border shadow-none">
            <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Account</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusPill status={c.isEmailVerified ? c.status : "pending_activation"} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Customer since</span><span>{fmtDate(c.attributedAt)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Last login</span><span>{fmtDate(c.lastLogin, true)}</span></div>
              {!c.isEmailVerified && <Button size="sm" variant="outline" disabled={busy === "inv"} onClick={() => act("inv", () => send("POST", `/api/reseller/customers/${id}/resend-invite`), "Invitation re-sent")}><Mail className="mr-2 h-4 w-4" />Resend invitation</Button>}
              {me?.permissions?.suspendCustomers && (
                <Button size="sm" variant="outline" disabled={busy === "st"} onClick={() => act("st", () => send("POST", `/api/reseller/customers/${id}/status`, { status: c.status === "active" ? "inactive" : "active" }), "Status updated")}>
                  {c.status === "active" ? "Deactivate account" : "Activate account"}
                </Button>
              )}
            </CardContent>
          </Card>
          <Card className="border-border shadow-none">
            <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Subscription</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {current ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span>{current.planName} · <span className="capitalize">{current.billingCycle}</span></span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusPill status={current.status === "active" && new Date(current.endDate) < new Date() ? "expired" : current.status} /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Period</span><span>{fmtDate(current.startDate)} – {fmtDate(current.endDate)}</span></div>
                </>
              ) : <p className="text-muted-foreground">No subscription.</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                {me?.permissions?.renewSubscriptions && !open && <Button size="sm" onClick={() => { setPp({ cycles: "1", pricingId: catalog.find((x) => x.planId === current?.planId && x.billingCycle === current?.billingCycle)?.pricingId }); setRenewOpen(true); }}><RefreshCw className="mr-2 h-4 w-4" />Renew</Button>}
                {me?.permissions?.sendReminders && <Button size="sm" variant="outline" disabled={busy === "rem"} onClick={async () => { const r = await act("rem", () => send("POST", `/api/reseller/customers/${id}/reminder`), "Reminder sent"); if (r?.payUrl) setLink(r.payUrl); }}><Mail className="mr-2 h-4 w-4" />Send reminder</Button>}
              </div>
            </CardContent>
          </Card>
          <Card className="border-border shadow-none">
            <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Open invoice</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {open ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">{open.planName}</span><span className="font-semibold">{fmtMoney(open.sellingPrice)}</span></div>
                  <StatusPill status={open.paymentStatus} />
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" disabled={busy === "link"} onClick={async () => { const r = await act("link", () => send("POST", `/api/reseller/sales/${open.id}/pay-link`), "New payment link created"); if (r?.payUrl) setLink(r.payUrl); }}>Get payment link</Button>
                    <Button size="sm" variant="ghost" className="text-red-600" disabled={busy === "cx"} onClick={() => { if (confirm("Cancel this unpaid invoice? Any access granted before payment is removed.")) act("cx", () => send("POST", `/api/reseller/sales/${open.id}/cancel`, {}), "Invoice cancelled"); }}>Cancel invoice</Button>
                  </div>
                  {link && <div className="flex gap-2"><Input readOnly value={link} aria-label="Payment link" /><Button type="button" variant="outline" onClick={() => copy(link, toast)}><Copy className="h-4 w-4" /></Button></div>}
                </>
              ) : <p className="text-muted-foreground">Nothing due.</p>}
            </CardContent>
          </Card>
        </div>
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Sales & renewals</CardTitle></CardHeader>
          <CardContent className="pt-0"><SalesTable rows={data.sales} /></CardContent>
        </Card>
      </main>
      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Renew subscription</DialogTitle></DialogHeader>
          <PlanPricePicker catalog={catalog} value={pp} onChange={setPp} canSetPrice={!!me?.permissions?.setSellingPrice} />
          <p className="text-xs text-muted-foreground">A renewal invoice is emailed to the customer. The period starts when the current one ends{me?.activationPolicy === "immediate" ? " and is applied now" : " and is applied once paid"}.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewOpen(false)}>Cancel</Button>
            <Button disabled={!pp.pricingId || busy === "renew"} onClick={async () => {
              const row = catalog.find((x) => x.pricingId === pp.pricingId);
              const r = await act("renew", () => send("POST", `/api/reseller/customers/${id}/renewals`, { planId: row.planId, billingCycle: row.billingCycle, cycles: Number(pp.cycles) || 1, unitSellingPrice: pp.unit ? Number(pp.unit) : undefined, idempotencyKey: `ren-${id}-${Date.now()}` }), "Renewal invoice created");
              if (r) { setRenewOpen(false); if (r.payUrl) setLink(r.payUrl); }
            }}>Create renewal invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
