/** Plan pricing row editor shared by Create reseller, Edit reseller and the Pricing tab. */
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtMoney, MODEL_LABEL } from "@/components/reseller/shared";

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
  const uid = useId();
  const set = (k: keyof PricingDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const srp = Number(value.suggestedRetailPrice || 0);
  const margin = value.pricingModel === "wholesale" ? srp - Number(value.wholesalePrice || 0) : value.pricingModel === "commission_percent" ? (srp * Number(value.commissionPercent || 0)) / 100 : Number(value.fixedCommission || 0);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 sm:col-span-1">
        <Label id={`${uid}-plan`}>Plan</Label>
        <Select value={value.planId} onValueChange={(v) => onChange({ ...value, planId: v })} disabled={lockKey}>
          <SelectTrigger className="mt-1" aria-labelledby={`${uid}-plan`}><SelectValue placeholder="Select plan" /></SelectTrigger>
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
      {value.pricingModel === "wholesale" && <div><Label htmlFor={`${uid}-wholesalePrice`}>Wholesale price</Label><Input id={`${uid}-wholesalePrice`} type="number" step="0.01" className="mt-1" value={value.wholesalePrice} onChange={set("wholesalePrice")} /></div>}
      {value.pricingModel === "commission_percent" && <div><Label htmlFor={`${uid}-commissionPercent`}>Commission %</Label><Input id={`${uid}-commissionPercent`} type="number" step="0.01" className="mt-1" value={value.commissionPercent} onChange={set("commissionPercent")} /></div>}
      {value.pricingModel === "fixed_commission" && <div><Label htmlFor={`${uid}-fixedCommission`}>Fixed commission / cycle</Label><Input id={`${uid}-fixedCommission`} type="number" step="0.01" className="mt-1" value={value.fixedCommission} onChange={set("fixedCommission")} /></div>}
      <div><Label htmlFor={`${uid}-suggestedRetailPrice`}>Suggested retail price</Label><Input id={`${uid}-suggestedRetailPrice`} type="number" step="0.01" className="mt-1" value={value.suggestedRetailPrice} onChange={set("suggestedRetailPrice")} /></div>
      <div><Label htmlFor={`${uid}-minSellingPrice`}>Minimum selling price</Label><Input id={`${uid}-minSellingPrice`} type="number" step="0.01" className="mt-1" value={value.minSellingPrice} onChange={set("minSellingPrice")} /></div>
      <div><Label htmlFor={`${uid}-maxSellingPrice`}>Maximum selling price (optional)</Label><Input id={`${uid}-maxSellingPrice`} type="number" step="0.01" className="mt-1" value={value.maxSellingPrice} onChange={set("maxSellingPrice")} /></div>
      {srp > 0 && <p className="col-span-2 rounded-lg bg-muted/50 p-2 text-xs">Reseller margin at SRP: <strong>{fmtMoney(margin)}</strong> · HoverChat keeps <strong>{fmtMoney(srp - margin)}</strong></p>}
    </div>
  );
}

