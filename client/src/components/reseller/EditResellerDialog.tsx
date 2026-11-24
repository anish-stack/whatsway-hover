/** Super admin — edit an existing reseller's profile, limits, policies and permissions. */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getJson } from "@/components/meta-billing/shared";
import { MODEL_LABEL, send } from "@/components/reseller/shared";
import { emptyPricing, PricingFields, pricingPayload, type PricingDraft } from "@/components/reseller/PricingFields";

/** A plan row in the dialog: existing (key locked) or new; `removed` = stop selling it on save. */
type PlanRow = { key: string; id?: string; draft: PricingDraft; original?: string; removed?: boolean; planName?: string };
const str = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
const rowFromApi = (r: any): PlanRow => {
  const draft: PricingDraft = {
    planId: r.planId, billingCycle: r.billingCycle, pricingModel: r.pricingModel, wholesalePrice: str(r.wholesalePrice),
    commissionPercent: str(r.commissionPercent), fixedCommission: str(r.fixedCommission), suggestedRetailPrice: str(r.suggestedRetailPrice),
    minSellingPrice: str(r.minSellingPrice), maxSellingPrice: str(r.maxSellingPrice), currency: r.currency || "INR",
  };
  return { key: r.id, id: r.id, draft, original: JSON.stringify(pricingPayload(draft)), planName: r.planName };
};
const cycleLabel = (c: string) => (c === "annual" ? "Yearly" : "Monthly");

type Form = {
  businessName: string; contactPerson: string; email: string; mobile: string; companyName: string; address: string;
  maxCustomers: string; validUntil: string; payoutHoldDays: string; activationPolicy: string; refundPolicy: string;
  defaultPricingModel: string; notes: string;
};

const toForm = (p: any): Form => ({
  businessName: p.businessName ?? "", contactPerson: p.contactPerson ?? "", email: p.email ?? "", mobile: p.mobile ?? "",
  companyName: p.companyName ?? "", address: p.address ?? "", maxCustomers: String(p.maxCustomers ?? ""),
  validUntil: p.validUntil ? new Date(p.validUntil).toISOString().slice(0, 10) : "", payoutHoldDays: String(p.payoutHoldDays ?? 7),
  activationPolicy: p.activationPolicy ?? "on_payment", refundPolicy: p.refundPolicy ?? "proportional",
  defaultPricingModel: p.defaultPricingModel ?? "wholesale", notes: p.notes ?? "",
});

export default function EditResellerDialog({ resellerId, open, onOpenChange }: { resellerId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const detail = useQuery<any>({ queryKey: ["/api/admin/resellers/detail", resellerId], queryFn: () => getJson(`/api/admin/resellers/${resellerId}`), enabled: open && !!resellerId });
  const { data: opts } = useQuery<any>({ queryKey: ["/api/admin/resellers/options"], queryFn: () => getJson("/api/admin/resellers/options"), enabled: open });
  const [f, setF] = useState<Form | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const pricingQ = useQuery<any[]>({ queryKey: ["/api/admin/resellers/pricing", resellerId, false], queryFn: () => getJson(`/api/admin/resellers/${resellerId}/pricing`), enabled: open && !!resellerId });
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const overrides = (pricingQ.data || []).filter((r) => r.customerUserId).length;
  useEffect(() => {
    if (open && pricingQ.data) setRows(pricingQ.data.filter((r) => !r.customerUserId).map(rowFromApi));
    if (!open) setRows(null);
  }, [open, pricingQ.data]);
  const setRow = (key: string, patch: Partial<PlanRow>) => setRows((rs) => (rs || []).map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // fresh form every time the dialog opens for a reseller
  useEffect(() => {
    if (open && detail.data) { setF(toForm(detail.data)); setPerms(detail.data.permissions ?? {}); }
    if (!open) setF(null);
  }, [open, detail.data]);

  const p = detail.data;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => (x ? { ...x, [k]: e.target.value } : x));
  const emailChanged = !!(f && p && f.email.trim().toLowerCase() !== String(p.email).toLowerCase());

  const planLabel = (r: PlanRow) => `${r.planName || opts?.plans?.find((x: any) => x.id === r.draft.planId)?.name || "Plan"} (${cycleLabel(r.draft.billingCycle)})`;

  const save = async () => {
    if (!f || !resellerId) return;
    // same plan + cycle twice would overwrite each other
    const live = (rows || []).filter((r) => !r.removed && r.draft.planId);
    const keys = live.map((r) => `${r.draft.planId}:${r.draft.billingCycle}`);
    const dup = keys.find((k, i) => keys.indexOf(k) !== i);
    if (dup) { toast({ title: "Same plan added twice", description: "Each plan + billing cycle can be listed only once.", variant: "destructive" }); return; }
    setBusy(true);
    let step = "details";
    try {
      await send("PATCH", `/api/admin/resellers/${resellerId}`, {
        ...f, email: f.email.trim().toLowerCase(), maxCustomers: Number(f.maxCustomers), payoutHoldDays: Number(f.payoutHoldDays),
        validUntil: f.validUntil || null, companyName: f.companyName || null, address: f.address || null, notes: f.notes || null, permissions: perms,
      });
      let changed = 0;
      for (const r of rows || []) {
        if (r.removed && r.id) { step = planLabel(r); await send("DELETE", `/api/admin/resellers/${resellerId}/pricing/${r.id}`); changed++; continue; }
        if (r.removed || !r.draft.planId) continue;
        const body = pricingPayload(r.draft);
        if (r.original && JSON.stringify(body) === r.original) continue; // untouched
        step = planLabel(r);
        await send("PUT", `/api/admin/resellers/${resellerId}/pricing`, body);
        changed++;
      }
      toast({
        title: "Reseller updated",
        description: [changed ? `${changed} plan${changed > 1 ? "s" : ""} updated (new version; past sales keep their price).` : "", emailChanged && p?.status === "pending_activation" ? "Login email changed — use “Resend invite”." : ""].filter(Boolean).join(" ") || undefined,
      });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/resellers") });
      onOpenChange(false);
    } catch (e: any) {
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/resellers") });
      toast({ title: step === "details" ? "Could not save" : `Couldn't save ${step}`, description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit reseller{p ? ` · ${p.businessName}` : ""}</DialogTitle>
          <DialogDescription>{p ? <>Code <span className="font-mono">{p.resellerCode}</span>. Changes apply immediately and are recorded in the audit log.</> : "Loading…"}</DialogDescription>
        </DialogHeader>
        {!f ? (
          <div className="flex justify-center py-12">{detail.isError ? <p className="text-sm text-destructive">{(detail.error as Error).message}</p> : <Loader2 className="h-5 w-5 animate-spin" />}</div>
        ) : (
          <div className="space-y-5">
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label htmlFor="e-bn">Business / reseller name</Label><Input id="e-bn" className="mt-1" value={f.businessName} onChange={set("businessName")} /></div>
              <div><Label htmlFor="e-cp">Contact person</Label><Input id="e-cp" className="mt-1" value={f.contactPerson} onChange={set("contactPerson")} /></div>
              <div>
                <Label htmlFor="e-em">Email (login)</Label><Input id="e-em" type="email" className="mt-1" value={f.email} onChange={set("email")} />
                {emailChanged && <p className="mt-1 text-xs text-amber-700">The reseller will sign in with this new email.</p>}
              </div>
              <div><Label htmlFor="e-mb">Mobile</Label><Input id="e-mb" className="mt-1" value={f.mobile} onChange={set("mobile")} /></div>
              <div><Label htmlFor="e-co">Company name (optional)</Label><Input id="e-co" className="mt-1" value={f.companyName} onChange={set("companyName")} /></div>
              <div><Label htmlFor="e-ad">Address (optional)</Label><Input id="e-ad" className="mt-1" value={f.address} onChange={set("address")} /></div>
            </section>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="e-mx">Max customers</Label><Input id="e-mx" type="number" min={1} className="mt-1" value={f.maxCustomers} onChange={set("maxCustomers")} />
                {p?.customerCount !== undefined && <p className="mt-1 text-xs text-muted-foreground">Currently {p.customerCount}</p>}
              </div>
              <div><Label htmlFor="e-vu">Valid until (optional)</Label><Input id="e-vu" type="date" className="mt-1" value={f.validUntil} onChange={set("validUntil")} /></div>
              <div><Label htmlFor="e-ph">Payout hold (days)</Label><Input id="e-ph" type="number" min={0} max={120} className="mt-1" value={f.payoutHoldDays} onChange={set("payoutHoldDays")} /></div>
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
                <Select value={f.defaultPricingModel} onValueChange={(v) => setF({ ...f, defaultPricingModel: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(MODEL_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Plans & pricing</p>
                <Link href={`/admin/resellers/${resellerId}?tab=pricing`} onClick={() => onOpenChange(false)} className="text-xs text-primary hover:underline">Version history →</Link>
              </div>
              {!rows ? <div className="h-24 animate-pulse rounded-xl bg-muted" /> : (
                <div className="space-y-3">
                  {rows.length === 0 && <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">No plans yet — the reseller can't sell until you add one.</p>}
                  {rows.map((r) => (
                    <div key={r.key} className={`rounded-xl border p-3 ${r.removed ? "border-red-200 bg-red-50/50" : "border-border"}`}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{r.id ? planLabel(r) : "New plan"}{r.id && !r.removed && r.original !== JSON.stringify(pricingPayload(r.draft)) && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-normal text-sky-700">changed</span>}</p>
                        {r.removed ? (
                          <Button size="sm" variant="ghost" onClick={() => setRow(r.key, { removed: false })}><RotateCcw className="mr-1 h-3.5 w-3.5" />Undo</Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => (r.id ? setRow(r.key, { removed: true }) : setRows((rs) => (rs || []).filter((x) => x.key !== r.key)))}><Trash2 className="mr-1 h-3.5 w-3.5" />{r.id ? "Stop selling" : "Remove"}</Button>
                        )}
                      </div>
                      {r.removed
                        ? <p className="text-xs text-red-700">The reseller won't be able to sell this plan after you save. Existing customers keep their price.</p>
                        : <PricingFields value={r.draft} onChange={(d) => setRow(r.key, { draft: d })} plans={opts?.plans ?? []} lockKey={!!r.id} />}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...(rs || []), { key: `new-${Date.now()}`, draft: emptyPricing(f.defaultPricingModel) }])}><Plus className="mr-1 h-4 w-4" />Add plan</Button>
                  <p className="text-xs text-muted-foreground">Price changes create a new version: past sales keep the price they were sold at; renewals use the new one.{overrides ? ` ${overrides} customer-specific override${overrides > 1 ? "s are" : " is"} managed in the Pricing tab.` : ""}</p>
                </div>
              )}
            </section>
            <section>
              <p className="mb-2 text-sm font-semibold">Permissions</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries((opts?.permissionLabels ?? {}) as Record<string, string>).map(([k, label]) => (
                  <label key={k} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    {label}<Switch checked={!!perms[k]} onCheckedChange={(v) => setPerms({ ...perms, [k]: v })} />
                  </label>
                ))}
              </div>
            </section>
            <div><Label htmlFor="e-nt">Notes (internal)</Label><Textarea id="e-nt" rows={2} className="mt-1" value={f.notes} onChange={set("notes")} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={save} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
