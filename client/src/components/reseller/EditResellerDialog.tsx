/** Super admin — edit an existing reseller's profile, limits, policies and permissions. */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
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

  // fresh form every time the dialog opens for a reseller
  useEffect(() => {
    if (open && detail.data) { setF(toForm(detail.data)); setPerms(detail.data.permissions ?? {}); }
    if (!open) setF(null);
  }, [open, detail.data]);

  const p = detail.data;
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => (x ? { ...x, [k]: e.target.value } : x));
  const emailChanged = !!(f && p && f.email.trim().toLowerCase() !== String(p.email).toLowerCase());

  const save = async () => {
    if (!f || !resellerId) return;
    setBusy(true);
    try {
      await send("PATCH", `/api/admin/resellers/${resellerId}`, {
        ...f, email: f.email.trim().toLowerCase(), maxCustomers: Number(f.maxCustomers), payoutHoldDays: Number(f.payoutHoldDays),
        validUntil: f.validUntil || null, companyName: f.companyName || null, address: f.address || null, notes: f.notes || null, permissions: perms,
      });
      toast({ title: "Reseller updated", description: emailChanged && p?.status === "pending_activation" ? "Login email changed — use “Resend invite” so the new address gets the activation link." : undefined });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/resellers") });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
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
            <section className="rounded-xl border border-dashed p-3 text-sm">
              Plans & pricing are edited per plan, with version history.{" "}
              <Link href={`/admin/resellers/${resellerId}?tab=pricing`} onClick={() => onOpenChange(false)} className="font-medium text-primary hover:underline">Manage plans & pricing →</Link>
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