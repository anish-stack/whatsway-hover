/** Super admin — Reseller Management: list, analytics, create reseller. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Copy, ExternalLink, MoreHorizontal, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { EmptyBlock, ErrorBlock, getJson } from "@/components/meta-billing/shared";
import { fmtDate, fmtMoney, MODEL_LABEL, send, StatusPill } from "@/components/reseller/shared";
import ResellerSummaryCard from "@/components/reseller/ResellerSummaryCard";
import EditResellerDialog from "@/components/reseller/EditResellerDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface PricingDraft {
  planId: string; billingCycle: string; pricingModel: string; wholesalePrice: string; commissionPercent: string;
  fixedCommission: string; suggestedRetailPrice: string; minSellingPrice: string; maxSellingPrice: string; currency: string;
}
export const emptyPricing = (model = "wholesale"): PricingDraft => ({
  planId: "", billingCycle: "monthly", pricingModel: model, wholesalePrice: "", commissionPercent: "", fixedCommission: "",
  suggestedRetailPrice: "", minSellingPrice: "", maxSellingPrice: "", currency: "INR",
});
export function pricingPayload(p: PricingDraft) {
  const n = (v: string) => (v === "" ? null : Number(v));
  return { ...p, wholesalePrice: n(p.wholesalePrice), commissionPercent: n(p.commissionPercent), fixedCommission: n(p.fixedCommission), suggestedRetailPrice: Number(p.suggestedRetailPrice), minSellingPrice: Number(p.minSellingPrice), maxSellingPrice: n(p.maxSellingPrice) };
}

export function PricingFields({ value, onChange, plans, lockKey }: { value: PricingDraft; onChange: (v: PricingDraft) => void; plans: any[]; lockKey?: boolean }) {
  const set = (k: keyof PricingDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const srp = Number(value.suggestedRetailPrice || 0);
  const margin = value.pricingModel === "wholesale" ? srp - Number(value.wholesalePrice || 0) : value.pricingModel === "commission_percent" ? (srp * Number(value.commissionPercent || 0)) / 100 : Number(value.fixedCommission || 0);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 sm:col-span-1">
        <Label>Plan</Label>
        <Select value={value.planId} onValueChange={(v) => onChange({ ...value, planId: v })} disabled={lockKey}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Select plan" /></SelectTrigger>
          <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (list ₹{Number(p.monthlyPrice)}/mo)</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <Label>Billing cycle</Label>
        <Select value={value.billingCycle} onValueChange={(v) => onChange({ ...value, billingCycle: v })} disabled={lockKey}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="annual">Yearly</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="col-span-2">
        <Label>Pricing model</Label>
        <Select value={value.pricingModel} onValueChange={(v) => onChange({ ...value, pricingModel: v })}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(MODEL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {value.pricingModel === "wholesale" && <div><Label>Wholesale price</Label><Input type="number" step="0.01" className="mt-1" value={value.wholesalePrice} onChange={set("wholesalePrice")} /></div>}
      {value.pricingModel === "commission_percent" && <div><Label>Commission %</Label><Input type="number" step="0.01" className="mt-1" value={value.commissionPercent} onChange={set("commissionPercent")} /></div>}
      {value.pricingModel === "fixed_commission" && <div><Label>Fixed commission / cycle</Label><Input type="number" step="0.01" className="mt-1" value={value.fixedCommission} onChange={set("fixedCommission")} /></div>}
      <div><Label>Suggested retail price</Label><Input type="number" step="0.01" className="mt-1" value={value.suggestedRetailPrice} onChange={set("suggestedRetailPrice")} /></div>
      <div><Label>Minimum selling price</Label><Input type="number" step="0.01" className="mt-1" value={value.minSellingPrice} onChange={set("minSellingPrice")} /></div>
      <div><Label>Maximum selling price (optional)</Label><Input type="number" step="0.01" className="mt-1" value={value.maxSellingPrice} onChange={set("maxSellingPrice")} /></div>
      {srp > 0 && <p className="col-span-2 rounded-lg bg-muted/50 p-2 text-xs">Reseller margin at SRP: <strong>{fmtMoney(margin)}</strong> · HoverChat keeps <strong>{fmtMoney(srp - margin)}</strong></p>}
    </div>
  );
}

function CreateResellerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: opts } = useQuery<any>({ queryKey: ["/api/admin/resellers/options"], queryFn: () => getJson("/api/admin/resellers/options"), enabled: open });
  const [f, setF] = useState({ businessName: "", contactPerson: "", email: "", mobile: "", companyName: "", address: "", maxCustomers: "100", activationPolicy: "on_payment", refundPolicy: "proportional", payoutHoldDays: "7", validUntil: "", notes: "", defaultPricingModel: "wholesale" });
  const [perms, setPerms] = useState<Record<string, boolean> | null>(null);
  const [pricing, setPricing] = useState<PricingDraft[]>([emptyPricing()]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const P = perms ?? opts?.defaultPermissions ?? {};
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setBusy(true);
    try {
      const out = await send<any>("POST", "/api/admin/resellers", {
        ...f, maxCustomers: Number(f.maxCustomers), payoutHoldDays: Number(f.payoutHoldDays), validUntil: f.validUntil || null,
        companyName: f.companyName || null, address: f.address || null, notes: f.notes || null, permissions: P,
        pricing: pricing.filter((p) => p.planId).map(pricingPayload), sendInvite: true,
      });
      setResult(out);
      qc.invalidateQueries({ queryKey: ["/api/admin/resellers"] });
    } catch (e: any) {
      toast({ title: "Could not create reseller", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setResult(null); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{result ? "Reseller created" : "Create reseller"}</DialogTitle></DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            <p>Reseller code <strong className="font-mono">{result.profile.resellerCode}</strong>. An activation email was sent to {result.profile.email}. The account becomes active once they set a password.</p>
            {result.inviteUrl && (
              <div className="flex gap-2"><Input readOnly value={result.inviteUrl} aria-label="Invitation link" /><Button variant="outline" onClick={() => navigator.clipboard?.writeText(result.inviteUrl)}><Copy className="h-4 w-4" /></Button></div>
            )}
            <p className="text-xs text-muted-foreground">Share this one-time link only with the reseller if the email does not arrive. It expires in 72 hours.</p>
            <DialogFooter><Button onClick={() => setLocation(`/admin/resellers/${result.profile.id}`)}>Open reseller</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label htmlFor="r-bn">Business / reseller name</Label><Input id="r-bn" className="mt-1" value={f.businessName} onChange={set("businessName")} /></div>
              <div><Label htmlFor="r-cp">Contact person</Label><Input id="r-cp" className="mt-1" value={f.contactPerson} onChange={set("contactPerson")} /></div>
              <div><Label htmlFor="r-em">Email (login)</Label><Input id="r-em" type="email" className="mt-1" value={f.email} onChange={set("email")} /></div>
              <div><Label htmlFor="r-mb">Mobile</Label><Input id="r-mb" className="mt-1" value={f.mobile} onChange={set("mobile")} /></div>
              <div><Label htmlFor="r-co">Company name (optional)</Label><Input id="r-co" className="mt-1" value={f.companyName} onChange={set("companyName")} /></div>
              <div><Label htmlFor="r-ad">Address (optional)</Label><Input id="r-ad" className="mt-1" value={f.address} onChange={set("address")} /></div>
            </section>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><Label htmlFor="r-mx">Max customers</Label><Input id="r-mx" type="number" min={1} className="mt-1" value={f.maxCustomers} onChange={set("maxCustomers")} /></div>
              <div><Label htmlFor="r-vu">Valid until (optional)</Label><Input id="r-vu" type="date" className="mt-1" value={f.validUntil} onChange={set("validUntil")} /></div>
              <div><Label htmlFor="r-ph">Payout hold (days)</Label><Input id="r-ph" type="number" min={0} className="mt-1" value={f.payoutHoldDays} onChange={set("payoutHoldDays")} /></div>
              <div>
                <Label>Subscription activation</Label>
                <Select value={f.activationPolicy} onValueChange={(v) => setF({ ...f, activationPolicy: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="on_payment">After verified payment</SelectItem><SelectItem value="immediate">Immediately (unpaid until paid)</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Refund margin policy</Label>
                <Select value={f.refundPolicy} onValueChange={(v) => setF({ ...f, refundPolicy: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="proportional">Reverse proportionally</SelectItem><SelectItem value="full">Reverse fully</SelectItem><SelectItem value="none">Do not reverse</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Default pricing model</Label>
                <Select value={f.defaultPricingModel} onValueChange={(v) => { setF({ ...f, defaultPricingModel: v }); setPricing((ps) => ps.map((p) => ({ ...p, pricingModel: v }))); }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(MODEL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </section>
            <section>
              <p className="mb-2 text-sm font-semibold">Assigned plans & pricing</p>
              <div className="space-y-3">
                {pricing.map((p, i) => (
                  <div key={i} className="rounded-xl border border-border p-3">
                    <PricingFields value={p} onChange={(v) => setPricing(pricing.map((x, j) => (j === i ? v : x)))} plans={opts?.plans ?? []} />
                    {pricing.length > 1 && <Button variant="ghost" size="sm" className="mt-2 text-red-600" onClick={() => setPricing(pricing.filter((_, j) => j !== i))}><Trash2 className="mr-1 h-4 w-4" />Remove</Button>}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setPricing([...pricing, emptyPricing(f.defaultPricingModel)])}><Plus className="mr-1 h-4 w-4" />Add plan</Button>
              </div>
            </section>
            <section>
              <p className="mb-2 text-sm font-semibold">Permissions</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries((opts?.permissionLabels ?? {}) as Record<string, string>).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    {label}<Switch checked={!!P[k]} onCheckedChange={(v) => setPerms({ ...P, [k]: v })} />
                  </label>
                ))}
              </div>
            </section>
            <div><Label htmlFor="r-nt">Notes</Label><Textarea id="r-nt" rows={2} className="mt-1" value={f.notes} onChange={set("notes")} /></div>
            <p className="text-xs text-muted-foreground">No password is set here. The reseller receives a one-time activation link and chooses their own password.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create & send invitation"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminResellersPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: ["/api/admin/resellers", q, status, page],
    queryFn: () => getJson(`/api/admin/resellers?search=${encodeURIComponent(q)}&status=${status === "all" ? "" : status}&page=${page}`),
  });
  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Reseller Management" subtitle="Partners who sell HoverChat subscriptions to their own customers" />
      <main className="space-y-4 p-4 sm:p-6">
        <ResellerSummaryCard />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setQ(search); setPage(1); }}>
            <div className="relative w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Search resellers" className="pl-9" placeholder="Name, email or code" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-48" aria-label="Status filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All (not archived)</SelectItem>
                {["active", "pending_activation", "suspended", "inactive", "archived"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit">Search</Button>
          </form>
          <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Create reseller</Button>
        </div>
        <Card className="border-border shadow-none">
          <CardContent className="overflow-x-auto p-0">
            {isLoading ? <div className="m-4 h-40 animate-pulse rounded-lg bg-muted" /> : isError ? <div className="p-4"><ErrorBlock error={error} /></div> : data.rows.length === 0 ? <div className="p-4"><EmptyBlock title="No resellers" /></div> : (
              <table className="w-full min-w-[900px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Reseller</th><th className="py-2 pr-3 font-medium">Status</th><th className="py-2 pr-3 font-medium">Customers</th>
                  <th className="py-2 pr-3 text-right font-medium">Revenue</th><th className="py-2 pr-3 text-right font-medium">Gross margin</th><th className="py-2 pr-3 font-medium">Activation</th><th className="py-2 pr-3 font-medium">Valid until</th><th className="py-2 pr-4 text-right font-medium"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{data.rows.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2"><Link href={`/admin/resellers/${r.id}`} className="font-medium hover:text-primary">{r.businessName}</Link><div className="text-xs text-muted-foreground"><span className="font-mono">{r.resellerCode}</span> · {r.email}</div></td>
                    <td className="py-2 pr-3"><StatusPill status={r.status} /></td>
                    <td className="py-2 pr-3 tabular-nums">{r.customers} / {r.maxCustomers}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtMoney(r.revenue)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtMoney(r.grossMargin)}</td>
                    <td className="py-2 pr-3 text-xs">{r.activationPolicy === "immediate" ? "Immediate" : "After payment"}</td>
                    <td className="py-2 pr-3 text-xs">{r.validUntil ? fmtDate(r.validUntil) : "—"}</td>
                    <td className="py-2 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.status !== "archived" && <Button size="sm" variant="ghost" onClick={() => setEditId(r.id)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`More actions for ${r.businessName}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setLocation(`/admin/resellers/${r.id}`)}><ExternalLink className="mr-2 h-4 w-4" />Open</DropdownMenuItem>
                            {r.status !== "archived" && <DropdownMenuItem onClick={() => setEditId(r.id)}><Pencil className="mr-2 h-4 w-4" />Edit details</DropdownMenuItem>}
                            <DropdownMenuItem onClick={() => setLocation(`/admin/resellers/${r.id}?tab=pricing`)}><Tags className="mr-2 h-4 w-4" />Plans & pricing</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </CardContent>
        </Card>
        {data?.pagination?.totalPages > 1 && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </main>
      <CreateResellerDialog open={open} onOpenChange={setOpen} />
      <EditResellerDialog resellerId={editId} open={!!editId} onOpenChange={(v) => !v && setEditId(null)} />
    </div>
  );
}