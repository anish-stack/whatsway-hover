/** Super admin — reseller detail: profile, configuration, pricing, customers, sales, earnings, audit. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Ban, CheckCircle2, KeyRound, MoreHorizontal, Pencil, Plus } from "lucide-react";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { EmptyBlock, ErrorBlock, StatCard, getJson } from "@/components/meta-billing/shared";
import { describePricing, fmtDate, fmtMoney, MODEL_LABEL, SalesFilters, type SalesFilterState, salesQuery, SalesTable, send, StatusPill } from "@/components/reseller/shared";
import { emptyPricing, PricingFields, pricingPayload, type PricingDraft } from "./resellers";

function useAct() {
  const { toast } = useToast();
  const qc = useQueryClient();
  return async (fn: () => Promise<any>, ok: string) => {
    try {
      const r = await fn();
      toast({ title: ok });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/resellers") });
      return r;
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
      return null;
    }
  };
}

function ConfigTab({ p }: { p: any }) {
  const act = useAct();
  const { data: opts } = useQuery<any>({ queryKey: ["/api/admin/resellers/options"], queryFn: () => getJson("/api/admin/resellers/options") });
  const [f, setF] = useState(() => ({
    businessName: p.businessName, contactPerson: p.contactPerson, email: p.email, mobile: p.mobile, companyName: p.companyName ?? "", address: p.address ?? "",
    maxCustomers: String(p.maxCustomers), activationPolicy: p.activationPolicy, refundPolicy: p.refundPolicy, payoutHoldDays: String(p.payoutHoldDays),
    validUntil: p.validUntil ? new Date(p.validUntil).toISOString().slice(0, 10) : "", notes: p.notes ?? "", defaultPricingModel: p.defaultPricingModel,
  }));
  const [perms, setPerms] = useState<Record<string, boolean>>(p.permissions);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => act(() => send("PATCH", `/api/admin/resellers/${p.id}`, {
    ...f, maxCustomers: Number(f.maxCustomers), payoutHoldDays: Number(f.payoutHoldDays), validUntil: f.validUntil || null,
    companyName: f.companyName || null, address: f.address || null, notes: f.notes || null, permissions: perms,
  }), "Reseller updated");
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="border-border shadow-none">
        <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Profile</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>Business name</Label><Input className="mt-1" value={f.businessName} onChange={set("businessName")} /></div>
          <div><Label>Contact person</Label><Input className="mt-1" value={f.contactPerson} onChange={set("contactPerson")} /></div>
          <div><Label>Email (login)</Label><Input className="mt-1" value={f.email} onChange={set("email")} /></div>
          <div><Label>Mobile</Label><Input className="mt-1" value={f.mobile} onChange={set("mobile")} /></div>
          <div><Label>Company</Label><Input className="mt-1" value={f.companyName} onChange={set("companyName")} /></div>
          <div><Label>Address</Label><Input className="mt-1" value={f.address} onChange={set("address")} /></div>
          <div className="sm:col-span-2"><Label>Notes</Label><Textarea rows={2} className="mt-1" value={f.notes} onChange={set("notes")} /></div>
        </CardContent>
      </Card>
      <Card className="border-border shadow-none">
        <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><Label>Max customers</Label><Input type="number" className="mt-1" value={f.maxCustomers} onChange={set("maxCustomers")} /></div>
            <div><Label>Valid until</Label><Input type="date" className="mt-1" value={f.validUntil} onChange={set("validUntil")} /></div>
            <div><Label>Payout hold (days)</Label><Input type="number" className="mt-1" value={f.payoutHoldDays} onChange={set("payoutHoldDays")} /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>Activation</Label>
              <Select value={f.activationPolicy} onValueChange={(v) => setF({ ...f, activationPolicy: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="on_payment">After verified payment</SelectItem><SelectItem value="immediate">Immediately (unpaid until paid)</SelectItem></SelectContent></Select></div>
            <div><Label>Refund margin policy</Label>
              <Select value={f.refundPolicy} onValueChange={(v) => setF({ ...f, refundPolicy: v })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="proportional">Reverse proportionally</SelectItem><SelectItem value="full">Reverse fully</SelectItem><SelectItem value="none">Do not reverse</SelectItem></SelectContent></Select></div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries((opts?.permissionLabels ?? {}) as Record<string, string>).map(([k, label]) => (
              <label key={k} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">{label}<Switch checked={!!perms[k]} onCheckedChange={(v) => setPerms({ ...perms, [k]: v })} /></label>
            ))}
          </div>
          <Button onClick={save}>Save changes</Button>
          <p className="text-xs text-muted-foreground">All changes are recorded in the audit log.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function PricingTab({ id }: { id: string }) {
  const act = useAct();
  const [history, setHistory] = useState(false);
  const { data: opts } = useQuery<any>({ queryKey: ["/api/admin/resellers/options"], queryFn: () => getJson("/api/admin/resellers/options") });
  const { data = [], isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/resellers/pricing", id, history], queryFn: () => getJson(`/api/admin/resellers/${id}/pricing${history ? "?history=1" : ""}`) });
  const [edit, setEdit] = useState<{ draft: PricingDraft; lock: boolean } | null>(null);
  const openEdit = (r?: any) => setEdit(r ? {
    lock: true,
    draft: { planId: r.planId, billingCycle: r.billingCycle, pricingModel: r.pricingModel, wholesalePrice: r.wholesalePrice ?? "", commissionPercent: r.commissionPercent ?? "", fixedCommission: r.fixedCommission ?? "",
      suggestedRetailPrice: r.suggestedRetailPrice, minSellingPrice: r.minSellingPrice, maxSellingPrice: r.maxSellingPrice ?? "", currency: r.currency, ...(r.customerUserId ? { customerUserId: r.customerUserId } : {}) } as any,
  } : { lock: false, draft: emptyPricing() });
  return (
    <Card className="border-border shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base sm:text-base">Plan pricing</CardTitle>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={history} onCheckedChange={setHistory} />Show history</label>
          <Button size="sm" onClick={() => openEdit()}><Plus className="mr-1 h-4 w-4" />Add plan pricing</Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        {isLoading ? <div className="h-32 animate-pulse rounded-lg bg-muted" /> : data.length === 0 ? <EmptyBlock title="No plans authorised" body="The reseller cannot sell until at least one plan has pricing." /> : (
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Plan</th><th className="py-2 pr-3 font-medium">Scope</th><th className="py-2 pr-3 font-medium">Model</th><th className="py-2 pr-3 text-right font-medium">SRP</th><th className="py-2 pr-3 text-right font-medium">Min – max</th><th className="py-2 pr-3 font-medium">Version</th><th className="py-2 font-medium" /></tr></thead>
            <tbody>{data.map((r) => (
              <tr key={r.id} className={`border-b border-border/60 last:border-0 ${r.isActive ? "" : "opacity-60"}`}>
                <td className="py-2 pr-3">{r.planName} <span className="text-xs capitalize text-muted-foreground">{r.billingCycle}</span></td>
                <td className="py-2 pr-3 text-xs">{r.customerUserId ? "Customer override" : "Default"}</td>
                <td className="py-2 pr-3 text-xs">{MODEL_LABEL[r.pricingModel]}<div className="text-muted-foreground">{describePricing(r)}</div></td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmtMoney(r.suggestedRetailPrice)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-xs">{fmtMoney(r.minSellingPrice)} – {r.maxSellingPrice ? fmtMoney(r.maxSellingPrice) : "∞"}</td>
                <td className="py-2 pr-3 text-xs">v{r.version} {r.isActive ? <StatusPill status="active" className="ml-1" /> : <StatusPill status="ended" className="ml-1" />}<div className="text-muted-foreground">{fmtDate(r.createdAt)}</div></td>
                <td className="py-2 text-right">{r.isActive && (
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" aria-label="Edit pricing" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label="Deactivate pricing" onClick={() => { if (confirm("Stop this reseller selling this plan? Existing subscriptions keep their price.")) act(() => send("DELETE", `/api/admin/resellers/${id}/pricing/${r.id}`), "Pricing deactivated"); }}><Ban className="h-4 w-4" /></Button>
                  </div>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Edits create a new version. Sales already made keep the pricing frozen at sale time; renewals use the active version.</p>
      </CardContent>
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{edit?.lock ? "Update pricing (new version)" : "Add plan pricing"}</DialogTitle></DialogHeader>
          {edit && <PricingFields value={edit.draft} onChange={(d) => setEdit({ ...edit, draft: d })} plans={opts?.plans ?? []} lockKey={edit.lock} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={async () => { const r = await act(() => send("PUT", `/api/admin/resellers/${id}/pricing`, pricingPayload(edit!.draft)), "Pricing saved"); if (r) setEdit(null); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CustomersTab({ id }: { id: string }) {
  const act = useAct();
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/resellers/customers", id], queryFn: () => getJson(`/api/admin/resellers/${id}/customers?pageSize=100`) });
  const { data: all } = useQuery<any>({ queryKey: ["/api/admin/resellers", "", "active", 1], queryFn: () => getJson(`/api/admin/resellers?status=active&pageSize=100`) });
  const [transfer, setTransfer] = useState<{ customerId: string; name: string } | null>(null);
  const [to, setTo] = useState<string>("");
  const [reason, setReason] = useState("");
  return (
    <Card className="border-border shadow-none">
      <CardContent className="overflow-x-auto p-0">
        {isLoading ? <div className="m-4 h-32 animate-pulse rounded-lg bg-muted" /> : (data?.rows ?? []).length === 0 ? <div className="p-4"><EmptyBlock title="No customers" /></div> : (
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Customer</th><th className="py-2 pr-3 font-medium">Account</th><th className="py-2 pr-3 font-medium">Subscription</th><th className="py-2 pr-3 font-medium">Ends</th><th className="py-2 pr-3 font-medium">Source</th><th className="py-2 pr-4 font-medium" /></tr></thead>
            <tbody>{data.rows.map((c: any) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2">{c.businessName || c.firstName}<div className="text-xs text-muted-foreground">{c.email} · {c.mobile}</div></td>
                <td className="py-2 pr-3"><StatusPill status={c.invitePending ? "pending_activation" : c.status} /></td>
                <td className="py-2 pr-3">{c.subscription?.planName ?? "—"} <StatusPill status={c.subscription?.status ?? "none"} className="ml-1" /></td>
                <td className="py-2 pr-3 text-xs">{fmtDate(c.subscription?.endDate)}</td>
                <td className="py-2 pr-3 text-xs capitalize">{String(c.source).replace(/_/g, " ")}</td>
                <td className="py-2 pr-4 text-right"><Button size="sm" variant="outline" onClick={() => { setTransfer({ customerId: c.id, name: c.businessName || c.email }); setTo(""); setReason(""); }}>Transfer</Button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </CardContent>
      <Dialog open={!!transfer} onOpenChange={(v) => !v && setTransfer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Transfer {transfer?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Past sales and earnings stay with the current reseller. Open unpaid invoices are cancelled. Future renewals belong to the new owner.</p>
            <div><Label>New owner</Label>
              <Select value={to} onValueChange={setTo}><SelectTrigger className="mt-1"><SelectValue placeholder="Select reseller" /></SelectTrigger>
                <SelectContent><SelectItem value="__direct">Make direct HoverChat customer</SelectItem>{(all?.rows ?? []).filter((r: any) => r.id !== id).map((r: any) => <SelectItem key={r.id} value={r.id}>{r.businessName} ({r.resellerCode})</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="tr-r">Reason (audited)</Label><Textarea id="tr-r" rows={2} className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransfer(null)}>Cancel</Button>
            <Button disabled={!to || reason.trim().length < 3} onClick={async () => { const r = await act(() => send("POST", `/api/admin/resellers/customers/${transfer!.customerId}/transfer`, { toResellerId: to === "__direct" ? null : to, reason }), "Ownership transferred"); if (r) setTransfer(null); }}>Transfer ownership</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SalesTab({ id }: { id: string }) {
  const act = useAct();
  const [f, setF] = useState<SalesFilterState>({ range: "all" });
  const incomplete = f.range === "custom" && (!f.from || !f.to);
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/resellers/sales", id, f], queryFn: () => getJson(`/api/admin/resellers/${id}/sales${salesQuery(f, { pageSize: 100 })}`), enabled: !incomplete });
  const [dlg, setDlg] = useState<{ kind: "paid" | "refund"; sale: any } | null>(null);
  const [ref, setRef] = useState("");
  const [amt, setAmt] = useState("");
  const t = data?.totals;
  return (
    <div className="space-y-4">
      <SalesFilters value={f} onChange={setF} />
      {t && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Paid sales" value={fmtMoney(t.paidSales)} hint={`${t.paidCount} paid`} />
          <StatCard label="Pending" value={fmtMoney(t.pendingAmount)} hint={`${t.pendingCount} open`} />
          <StatCard label="Reseller margin" value={fmtMoney(t.grossMargin)} />
          <StatCard label="HoverChat share" value={fmtMoney(t.platformRevenue)} tone="brand" />
          <StatCard label="Refunded" value={fmtMoney(t.refundedAmount)} hint={`${t.refundedCount} · ${t.cancelledCount} cancelled`} />
        </div>
      )}
      <Card className="border-border shadow-none"><CardContent className="p-4">
        {isLoading ? <div className="h-32 animate-pulse rounded-lg bg-muted" /> : (
          <SalesTable rows={data?.rows ?? []} actions={(r) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Sale actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {["pending", "pending_verification"].includes(r.paymentStatus) && <>
                  <DropdownMenuItem onClick={() => { setDlg({ kind: "paid", sale: r }); setRef(""); }}>Mark paid (verified manually)</DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => { const x = await act(() => send("POST", `/api/admin/resellers/sales/${r.id}/pay-link`), "New pay link created"); if (x?.payUrl) navigator.clipboard?.writeText(x.payUrl); }}>Copy new pay link</DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600" onClick={() => { if (confirm("Cancel this unpaid sale?")) act(() => send("POST", `/api/admin/resellers/sales/${r.id}/cancel`, {}), "Sale cancelled"); }}>Cancel sale</DropdownMenuItem>
                </>}
                {["paid", "partially_refunded"].includes(r.paymentStatus) && <DropdownMenuItem onClick={() => { setDlg({ kind: "refund", sale: r }); setRef(""); setAmt(String(r.sellingPrice - r.refundedAmount)); }}>Record refund</DropdownMenuItem>}
                {!["pending", "pending_verification", "paid", "partially_refunded"].includes(r.paymentStatus) && <DropdownMenuItem disabled>No actions</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          )} />
        )}
      </CardContent></Card>
      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{dlg?.kind === "paid" ? "Mark sale as paid" : "Record refund"}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            {dlg?.kind === "paid" ? <p className="text-muted-foreground">Only use after confirming {fmtMoney(dlg.sale.sellingPrice)} reached HoverChat's account (e.g. bank transfer). This activates the subscription and records the reseller margin.</p>
              : <p className="text-muted-foreground">Record a refund already issued in Razorpay or by bank. Margin is reversed per the reseller's refund policy. Razorpay refunds are also picked up automatically by webhook.</p>}
            {dlg?.kind === "refund" && <div><Label htmlFor="rf-a">Refund amount</Label><Input id="rf-a" type="number" step="0.01" className="mt-1" value={amt} onChange={(e) => setAmt(e.target.value)} /></div>}
            <div><Label htmlFor="rf-r">Reference (UTR / refund id)</Label><Input id="rf-r" className="mt-1" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button disabled={ref.trim().length < 3} onClick={async () => {
              const r = dlg!.kind === "paid"
                ? await act(() => send("POST", `/api/admin/resellers/sales/${dlg!.sale.id}/mark-paid`, { reference: ref }), "Marked paid")
                : await act(() => send("POST", `/api/admin/resellers/sales/${dlg!.sale.id}/refund`, { amount: Number(amt), reference: ref }), "Refund recorded");
              if (r) setDlg(null);
            }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EarningsTab({ id }: { id: string }) {
  const act = useAct();
  const { data } = useQuery<any>({ queryKey: ["/api/admin/resellers/earnings", id], queryFn: () => getJson(`/api/admin/resellers/${id}/earnings`) });
  const [dlg, setDlg] = useState<"payout" | "adjustment" | null>(null);
  const [f, setF] = useState({ amount: "", reference: "", note: "" });
  const b = data?.balances;
  return (
    <div className="space-y-4">
      {b && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Gross margin" value={fmtMoney(b.grossMargin)} />
          <StatCard label="On hold" value={fmtMoney(b.onHold)} />
          <StatCard label="Withdrawable" value={fmtMoney(b.withdrawable)} tone="brand" />
          <StatCard label="Paid out" value={fmtMoney(b.paidOut)} />
          <StatCard label="Reversals / adj." value={`${fmtMoney(b.reversed)} / ${fmtMoney(b.adjustments)}`} />
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={() => { setDlg("payout"); setF({ amount: "", reference: "", note: "" }); }}>Record payout</Button>
        <Button variant="outline" onClick={() => { setDlg("adjustment"); setF({ amount: "", reference: "", note: "" }); }}>Manual adjustment</Button>
      </div>
      <Card className="border-border shadow-none"><CardContent className="overflow-x-auto p-4">
        {(data?.ledger ?? []).length === 0 ? <EmptyBlock title="No ledger entries" /> : (
          <table className="w-full min-w-[700px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Type</th><th className="py-2 pr-3 font-medium">Description</th><th className="py-2 pr-3 font-medium">Reference</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
            <tbody>{data.ledger.map((l: any) => (
              <tr key={l.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 text-xs">{fmtDate(l.createdAt, true)}</td><td className="py-2 pr-3 capitalize">{l.entryType}</td>
                <td className="py-2 pr-3 text-xs">{l.description}{l.planName ? ` · ${l.planName}` : ""}</td>
                <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">{l.reference}</td>
                <td className={`py-2 text-right tabular-nums ${Number(l.amount) < 0 ? "text-red-600" : ""}`}>{fmtMoney(Number(l.amount))}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Ledger rows are append-only (enforced in the database). Corrections are new adjustment rows.</p>
      </CardContent></Card>
      <Dialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{dlg === "payout" ? "Record payout to reseller" : "Manual ledger adjustment"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label htmlFor="ld-a">Amount {dlg === "adjustment" ? "(negative to deduct)" : ""}</Label><Input id="ld-a" type="number" step="0.01" className="mt-1" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />{dlg === "payout" && b && <p className="mt-1 text-xs text-muted-foreground">Withdrawable: {fmtMoney(b.withdrawable)}</p>}</div>
            <div><Label htmlFor="ld-r">Reference (UTR / unique id)</Label><Input id="ld-r" className="mt-1" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
            <div><Label htmlFor="ld-n">{dlg === "payout" ? "Note" : "Reason"}</Label><Input id="ld-n" className="mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button onClick={async () => {
              const r = dlg === "payout"
                ? await act(() => send("POST", `/api/admin/resellers/${id}/payouts`, { amount: Number(f.amount), reference: f.reference, note: f.note }), "Payout recorded")
                : await act(() => send("POST", `/api/admin/resellers/${id}/adjustments`, { amount: Number(f.amount), reference: f.reference, reason: f.note }), "Adjustment recorded");
              if (r) setDlg(null);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditTab({ id }: { id: string }) {
  const { data = [] } = useQuery<any[]>({ queryKey: ["/api/admin/resellers/audit", id], queryFn: () => getJson(`/api/admin/resellers/${id}/audit`) });
  return (
    <Card className="border-border shadow-none"><CardContent className="overflow-x-auto p-4">
      {data.length === 0 ? <EmptyBlock title="No activity yet" /> : (
        <table className="w-full min-w-[700px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">When</th><th className="py-2 pr-3 font-medium">Action</th><th className="py-2 pr-3 font-medium">By</th><th className="py-2 font-medium">Details</th></tr></thead>
          <tbody>{data.map((a) => (
            <tr key={a.id} className="border-b border-border/60 align-top last:border-0">
              <td className="py-2 pr-3 text-xs">{fmtDate(a.createdAt, true)}</td>
              <td className="py-2 pr-3 font-mono text-xs">{a.action}</td>
              <td className="py-2 pr-3 text-xs">{a.actorEmail ?? a.actorRole}</td>
              <td className="py-2 text-[11px] text-muted-foreground"><code className="break-all">{a.after ? JSON.stringify(a.after).slice(0, 220) : ""}</code></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </CardContent></Card>
  );
}

export default function AdminResellerDetailPage() {
  const [, params] = useRoute("/admin/resellers/:id");
  const id = params?.id ?? "";
  const act = useAct();
  const { data: p, isLoading, isError, error } = useQuery<any>({ queryKey: ["/api/admin/resellers/detail", id], queryFn: () => getJson(`/api/admin/resellers/${id}`), enabled: !!id });
  const [reason, setReason] = useState("");
  const [suspendOpen, setSuspendOpen] = useState(false);
  if (isLoading) return <div className="flex-1 p-6"><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  if (isError) return <div className="flex-1 p-6"><ErrorBlock error={error} /></div>;
  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title={p.businessName} subtitle={`${p.resellerCode} · ${p.email}`} />
      <main className="space-y-4 p-4 sm:p-6">
        <Link href="/admin/resellers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />All resellers</Link>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={p.status} className="text-sm" />
          {p.suspendedReason && <span className="text-xs text-muted-foreground">Reason: {p.suspendedReason}</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            {p.status === "active" && <Button variant="outline" size="sm" className="text-red-600" onClick={() => { setReason(""); setSuspendOpen(true); }}><Ban className="mr-1 h-4 w-4" />Suspend</Button>}
            {p.status === "active" && <Button variant="outline" size="sm" onClick={() => act(() => send("POST", `/api/admin/resellers/${id}/status`, { status: "inactive" }), "Deactivated")}>Deactivate</Button>}
            {["suspended", "inactive"].includes(p.status) && <Button size="sm" onClick={() => act(() => send("POST", `/api/admin/resellers/${id}/status`, { status: "active" }), "Reseller activated")}><CheckCircle2 className="mr-1 h-4 w-4" />Activate / resume</Button>}
            {p.status !== "archived" && <Button variant="outline" size="sm" onClick={async () => { const r = await act(() => send("POST", `/api/admin/resellers/${id}/reset-password`), p.status === "pending_activation" ? "Invitation re-sent" : "Password reset link sent"); if (r?.link) navigator.clipboard?.writeText(r.link); }}><KeyRound className="mr-1 h-4 w-4" />{p.status === "pending_activation" ? "Resend invite" : "Send password reset"}</Button>}
            {p.status !== "archived" && <Button variant="ghost" size="sm" onClick={() => { if (confirm("Archive this reseller? Login is disabled; customers keep access and stay linked until you transfer them.")) act(() => send("POST", `/api/admin/resellers/${id}/archive`), "Archived"); }}>Archive</Button>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Gross margin" value={fmtMoney(p.balances.grossMargin)} />
          <StatCard label="Withdrawable" value={fmtMoney(p.balances.withdrawable)} tone="brand" />
          <StatCard label="Customer limit" value={p.maxCustomers} />
          <StatCard label="Valid until" value={<span className="text-base">{p.validUntil ? fmtDate(p.validUntil) : "No expiry"}</span>} />
        </div>
        <Tabs defaultValue="sales">
          <TabsList className="flex-wrap">
            {["sales", "customers", "pricing", "earnings", "configuration", "audit"].map((t) => <TabsTrigger key={t} value={t} className="capitalize">{t === "audit" ? "Activity & audit" : t}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="sales" className="mt-4"><SalesTab id={id} /></TabsContent>
          <TabsContent value="customers" className="mt-4"><CustomersTab id={id} /></TabsContent>
          <TabsContent value="pricing" className="mt-4"><PricingTab id={id} /></TabsContent>
          <TabsContent value="earnings" className="mt-4"><EarningsTab id={id} /></TabsContent>
          <TabsContent value="configuration" className="mt-4"><ConfigTab p={p} /></TabsContent>
          <TabsContent value="audit" className="mt-4"><AuditTab id={id} /></TabsContent>
        </Tabs>
      </main>
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Suspend reseller</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">The reseller is signed out of the portal immediately and cannot sell. Their customers keep using HoverChat normally.</p>
          <div><Label htmlFor="sp-r">Reason (shown to reseller)</Label><Textarea id="sp-r" rows={2} className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={async () => { const r = await act(() => send("POST", `/api/admin/resellers/${id}/status`, { status: "suspended", reason }), "Reseller suspended"); if (r) setSuspendOpen(false); }}>Suspend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
