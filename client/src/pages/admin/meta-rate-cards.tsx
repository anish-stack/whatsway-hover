/**
 * Super admin — Meta rate card management with effective dates and history.
 * Editing a rate never reprices messages already delivered.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Power } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { KNOWN_COUNTRIES, META_CATEGORIES } from "@shared/meta-billing";
import { EmptyBlock, ErrorBlock, fmtDate, getJson } from "@/components/meta-billing/shared";

interface Tier { fromVolume: string; rate: string }
interface FormState {
  id?: string;
  countryCode: string; countryName: string; category: string; rate: string; currency: string;
  freeMonthlyAllowance: string; tiers: Tier[]; effectiveFrom: string; effectiveTo: string;
  isActive: boolean; pricingSource: string; pricingVersion: string; notes: string;
}
const EMPTY: FormState = {
  countryCode: "IN", countryName: "", category: "marketing", rate: "", currency: "INR", freeMonthlyAllowance: "",
  tiers: [], effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: "", isActive: true,
  pricingSource: "Meta WhatsApp rate card", pricingVersion: "", notes: "",
};

function toDateInput(d?: string | null) { return d ? new Date(d).toISOString().slice(0, 10) : ""; }

function isCurrent(r: any) {
  const now = Date.now();
  return r.isActive && new Date(r.effectiveFrom).getTime() <= now && (!r.effectiveTo || new Date(r.effectiveTo).getTime() > now);
}

export default function MetaRateCardsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [country, setCountry] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError, error } = useQuery<any[]>({
    queryKey: ["/api/admin/meta-rate-cards"],
    queryFn: () => getJson("/api/admin/meta-rate-cards?includeInactive=true"),
  });
  const rows = useMemo(() => (data ?? []).filter((r) => country === "all" || r.countryCode === country), [data, country]);
  const countriesInUse = useMemo(() => [...new Set((data ?? []).map((r) => r.countryCode))].sort(), [data]);

  const edit = (r?: any) => {
    setForm(r ? {
      id: r.id, countryCode: r.countryCode, countryName: r.countryName ?? "", category: r.category, rate: String(Number(r.rate)),
      currency: r.currency, freeMonthlyAllowance: r.freeMonthlyAllowance?.toString() ?? "",
      tiers: (r.volumeTiers ?? []).map((t: any) => ({ fromVolume: String(t.fromVolume), rate: String(t.rate) })),
      effectiveFrom: toDateInput(r.effectiveFrom), effectiveTo: toDateInput(r.effectiveTo), isActive: r.isActive,
      pricingSource: r.pricingSource ?? "", pricingVersion: r.pricingVersion ?? "", notes: r.notes ?? "",
    } : EMPTY);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        countryCode: form.countryCode, countryName: form.countryName || null, category: form.category,
        rate: Number(form.rate), currency: form.currency,
        freeMonthlyAllowance: form.freeMonthlyAllowance === "" ? null : Number(form.freeMonthlyAllowance),
        volumeTiers: form.tiers.filter((t) => t.fromVolume && t.rate).map((t) => ({ fromVolume: Number(t.fromVolume), rate: Number(t.rate) })),
        effectiveFrom: new Date(`${form.effectiveFrom}T00:00:00Z`).toISOString(),
        effectiveTo: form.effectiveTo ? new Date(`${form.effectiveTo}T00:00:00Z`).toISOString() : null,
        isActive: form.isActive, pricingSource: form.pricingSource || null, pricingVersion: form.pricingVersion || null, notes: form.notes || null,
      };
      if (!form.rate || Number.isNaN(body.rate)) throw new Error("Enter a rate");
      if (form.id) await apiRequest("PUT", `/api/admin/meta-rate-cards/${form.id}`, body);
      else await apiRequest("POST", "/api/admin/meta-rate-cards", body);
      toast({ title: form.id ? "Rate updated" : "Rate added", description: "Applies to messages delivered from the effective date. History is not repriced." });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/meta-rate-cards"] });
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: any) => {
    try {
      await apiRequest("PATCH", `/api/admin/meta-rate-cards/${r.id}/active`, { isActive: !r.isActive });
      qc.invalidateQueries({ queryKey: ["/api/admin/meta-rate-cards"] });
    } catch (e: any) {
      toast({ title: "Could not update", description: e.message, variant: "destructive" });
    }
  };

  const tierAllowed = ["utility", "authentication", "authentication_international"].includes(form.category);

  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Meta Rate Card" subtitle="Per-country, per-category Meta rates used for usage estimates" />
      <main className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-56">
            <Label className="text-xs text-muted-foreground">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All countries</SelectItem>
                {countriesInUse.map((c) => <SelectItem key={c} value={c}>{c === "*" ? "Other (*)" : c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => edit()}><Plus className="mr-2 h-4 w-4" />Add rate</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Rates are reference values — validate against Meta's official rate card. Each delivered message stores the rate and pricing version valid at delivery, so changes here only affect future deliveries. Use country "*" for the "Other" region fallback.
        </p>

        <Card className="border-border shadow-none">
          <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Rates & history</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            {isLoading ? <div className="h-40 animate-pulse rounded-lg bg-muted" /> : isError ? <ErrorBlock error={error} /> : rows.length === 0 ? <EmptyBlock title="No rates configured" /> : (
              <table className="w-full min-w-[900px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Country</th><th className="py-2 pr-3 font-medium">Category</th>
                  <th className="py-2 pr-3 text-right font-medium">Rate</th><th className="py-2 pr-3 font-medium">Free / tiers</th>
                  <th className="py-2 pr-3 font-medium">Effective</th><th className="py-2 pr-3 font-medium">Version · source</th>
                  <th className="py-2 pr-3 font-medium">Status</th><th className="py-2 font-medium" /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={`border-b border-border/60 last:border-0 ${r.isActive ? "" : "opacity-60"}`}>
                      <td className="py-2 pr-3">{r.countryCode === "*" ? "Other" : r.countryName || r.countryCode} <span className="text-xs text-muted-foreground">{r.countryCode}</span></td>
                      <td className="py-2 pr-3 capitalize">{r.category.replace(/_/g, " ")}</td>
                      <td className="py-2 pr-3 text-right font-mono tabular-nums">{Number(r.rate).toFixed(4)} {r.currency}</td>
                      <td className="py-2 pr-3 text-xs">
                        {r.freeMonthlyAllowance ? `${r.freeMonthlyAllowance}/number/month free` : ""}
                        {(r.volumeTiers ?? []).length ? `${r.freeMonthlyAllowance ? " · " : ""}${r.volumeTiers.length} tier(s)` : ""}
                        {!r.freeMonthlyAllowance && !(r.volumeTiers ?? []).length ? "—" : ""}
                      </td>
                      <td className="py-2 pr-3 text-xs">{fmtDate(r.effectiveFrom)} → {r.effectiveTo ? fmtDate(r.effectiveTo) : "open"}</td>
                      <td className="py-2 pr-3 text-xs"><span className="font-mono">{r.pricingVersion ?? "—"}</span><br /><span className="text-muted-foreground">{r.pricingSource ?? ""}</span></td>
                      <td className="py-2 pr-3">
                        {isCurrent(r)
                          ? <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Current</span>
                          : r.isActive
                            ? <span className="inline-flex whitespace-nowrap rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{new Date(r.effectiveFrom).getTime() > Date.now() ? "Scheduled" : "Ended"}</span>
                            : <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Inactive</span>}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" aria-label="Edit rate" onClick={() => edit(r)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" aria-label={r.isActive ? "Deactivate rate" : "Activate rate"} onClick={() => toggle(r)}><Power className="h-4 w-4" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{form.id ? "Edit rate" : "Add rate"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Country</Label>
              <Select value={form.countryCode} onValueChange={(v) => setForm({ ...form, countryCode: v, countryName: v === "*" ? "Other" : KNOWN_COUNTRIES.find((c) => c.iso === v)?.name ?? "" })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="*">Other (*)</SelectItem>
                  {KNOWN_COUNTRIES.map((c) => <SelectItem key={c.iso} value={c.iso}>{c.name} ({c.iso})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{META_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="rc-rate">Rate per delivered message</Label><Input id="rc-rate" type="number" step="0.0001" min={0} className="mt-1" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
            <div><Label htmlFor="rc-cur">Currency</Label><Input id="rc-cur" className="mt-1" maxLength={8} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
            <div><Label htmlFor="rc-from">Effective from</Label><Input id="rc-from" type="date" className="mt-1" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
            <div><Label htmlFor="rc-to">Effective to (optional)</Label><Input id="rc-to" type="date" className="mt-1" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} /></div>
            {form.category === "service" && (
              <div className="col-span-2"><Label htmlFor="rc-free">Free messages per phone number per month</Label>
                <Input id="rc-free" type="number" min={0} className="mt-1" value={form.freeMonthlyAllowance} onChange={(e) => setForm({ ...form, freeMonthlyAllowance: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">Used by the calculator. Recorded usage follows Meta's own billable flag.</p></div>
            )}
            {tierAllowed && (
              <div className="col-span-2 space-y-2">
                <Label>Volume tiers (monthly billable volume → rate)</Label>
                {form.tiers.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <Input type="number" min={1} placeholder="From volume" value={t.fromVolume} onChange={(e) => setForm({ ...form, tiers: form.tiers.map((x, j) => j === i ? { ...x, fromVolume: e.target.value } : x) })} />
                    <Input type="number" step="0.0001" min={0} placeholder="Rate" value={t.rate} onChange={(e) => setForm({ ...form, tiers: form.tiers.map((x, j) => j === i ? { ...x, rate: e.target.value } : x) })} />
                    <Button variant="ghost" onClick={() => setForm({ ...form, tiers: form.tiers.filter((_, j) => j !== i) })}>Remove</Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setForm({ ...form, tiers: [...form.tiers, { fromVolume: "", rate: "" }] })}>Add tier</Button>
              </div>
            )}
            <div><Label htmlFor="rc-ver">Pricing version</Label><Input id="rc-ver" className="mt-1" placeholder="meta-2026-01-IN" value={form.pricingVersion} onChange={(e) => setForm({ ...form, pricingVersion: e.target.value })} /></div>
            <div><Label htmlFor="rc-src">Source</Label><Input id="rc-src" className="mt-1" value={form.pricingSource} onChange={(e) => setForm({ ...form, pricingSource: e.target.value })} /></div>
            <div className="col-span-2"><Label htmlFor="rc-notes">Notes</Label><Textarea id="rc-notes" className="mt-1" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="col-span-2 flex items-center gap-2"><Switch id="rc-active" checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /><Label htmlFor="rc-active">Active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save rate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
