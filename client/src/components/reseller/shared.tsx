/**
 * Shared reseller UI: status pills, money, Razorpay checkout loader,
 * sales table, filters.
 */
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { EmptyBlock, fmtDate, fmtMoney } from "@/components/meta-billing/shared";

export { fmtDate, fmtMoney };

export async function send<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await apiRequest(method, url, body);
  const json = await res.json();
  return (json?.data ?? json) as T;
}

const PILL: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  current: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  awaiting_payment: "bg-amber-50 text-amber-800 border-amber-200",
  upcoming: "bg-sky-50 text-sky-700 border-sky-200",
  pending_activation: "bg-amber-50 text-amber-800 border-amber-200",
  pending_verification: "bg-orange-50 text-orange-800 border-orange-200",
  suspended: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  refunded: "bg-violet-50 text-violet-700 border-violet-200",
  partially_refunded: "bg-violet-50 text-violet-700 border-violet-200",
  inactive: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted text-muted-foreground border-border",
  ended: "bg-muted text-muted-foreground border-border",
};

export function StatusPill({ status, className }: { status?: string | null; className?: string }) {
  const s = status || "none";
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize", PILL[s] ?? "bg-muted text-muted-foreground border-border", className)}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

export const MODEL_LABEL: Record<string, string> = {
  wholesale: "Wholesale price",
  commission_percent: "Commission %",
  fixed_commission: "Fixed commission",
};

export function describePricing(p: any) {
  if (p.pricingModel === "wholesale") return `Wholesale ${fmtMoney(p.wholesalePrice)}`;
  if (p.pricingModel === "commission_percent") return `${Number(p.commissionPercent)}% commission`;
  return `${fmtMoney(p.fixedCommission)} commission`;
}

let rzpLoading: Promise<void> | null = null;
export function loadRazorpay(): Promise<void> {
  if ((window as any).Razorpay) return Promise.resolve();
  if (!rzpLoading) {
    rzpLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve();
      s.onerror = () => { rzpLoading = null; reject(new Error("Could not load Razorpay checkout")); };
      document.body.appendChild(s);
    });
  }
  return rzpLoading;
}

/**
 * Open Razorpay checkout for a reseller invoice. `orderUrl` returns
 * {orderId,keyId,amountPaise,currency}; `verifyUrl` receives the handler payload.
 */
export async function payWithRazorpay(opts: {
  orderUrl: string; verifyUrl: string; description: string; prefillEmail?: string | null;
  onDone: (r: { settled: boolean; status: string }) => void; onError: (msg: string) => void;
}) {
  await loadRazorpay();
  const order = await send<any>("POST", opts.orderUrl);
  const rzp = new (window as any).Razorpay({
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amountPaise,
    currency: order.currency,
    name: "HoverChat",
    description: opts.description,
    prefill: opts.prefillEmail ? { email: opts.prefillEmail } : undefined,
    theme: { color: "#08a957" },
    handler: async (resp: any) => {
      try {
        const r = await send<any>("POST", opts.verifyUrl, resp);
        opts.onDone(r);
      } catch (e: any) {
        opts.onError(e.message || "Payment verification failed. If money was deducted, it will be confirmed automatically.");
      }
    },
  });
  rzp.on("payment.failed", (r: any) => opts.onError(r?.error?.description || "Payment failed"));
  rzp.open();
}

export const SALE_RANGES = [
  { value: "today", label: "Today" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

export interface SalesFilterState { range: string; from?: string; to?: string; planId?: string; paymentStatus?: string; saleType?: string }

export function SalesFilters({ value, onChange, plans }: { value: SalesFilterState; onChange: (v: SalesFilterState) => void; plans?: { id: string; name: string }[] }) {
  const sel = (label: string, v: string | undefined, set: (v: string) => void, options: { value: string; label: string }[]) => (
    <div className="min-w-[150px]">
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <Select value={v || "all"} onValueChange={set}>
        <SelectTrigger className="h-9 bg-background" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-3">
      {sel("Period", value.range, (v) => onChange({ ...value, range: v }), SALE_RANGES)}
      {value.range === "custom" && (
        <>
          <div><label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground" htmlFor="sf-from">From</label><Input id="sf-from" type="date" className="h-9" value={value.from ?? ""} onChange={(e) => onChange({ ...value, from: e.target.value })} /></div>
          <div><label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground" htmlFor="sf-to">To</label><Input id="sf-to" type="date" className="h-9" value={value.to ?? ""} onChange={(e) => onChange({ ...value, to: e.target.value })} /></div>
        </>
      )}
      {plans && sel("Plan", value.planId, (v) => onChange({ ...value, planId: v === "all" ? undefined : v }), [{ value: "all", label: "All plans" }, ...plans.map((p) => ({ value: p.id, label: p.name }))])}
      {sel("Payment", value.paymentStatus, (v) => onChange({ ...value, paymentStatus: v === "all" ? undefined : v }), [
        { value: "all", label: "All statuses" }, { value: "paid", label: "Paid" }, { value: "pending", label: "Pending" },
        { value: "pending_verification", label: "Needs verification" }, { value: "refunded", label: "Refunded" },
        { value: "partially_refunded", label: "Partially refunded" }, { value: "cancelled", label: "Cancelled" },
      ])}
      {sel("Type", value.saleType, (v) => onChange({ ...value, saleType: v === "all" ? undefined : v }), [{ value: "all", label: "New & renewals" }, { value: "new", label: "New" }, { value: "renewal", label: "Renewal" }])}
    </div>
  );
}

export function salesQuery(f: SalesFilterState, extra: Record<string, any> = {}) {
  const p = new URLSearchParams();
  const all = { range: f.range, from: f.range === "custom" ? f.from : undefined, to: f.range === "custom" ? f.to : undefined, planId: f.planId, paymentStatus: f.paymentStatus, saleType: f.saleType, ...extra };
  for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return `?${p.toString()}`;
}

export function SalesTable({ rows, showReseller, actions }: { rows: any[]; showReseller?: boolean; actions?: (r: any) => React.ReactNode }) {
  if (!rows.length) return <EmptyBlock title="No sales in this period" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Sale date</th>
            {showReseller && <th className="py-2 pr-3 font-medium">Reseller</th>}
            <th className="py-2 pr-3 font-medium">Customer</th>
            <th className="py-2 pr-3 font-medium">Plan · duration</th>
            <th className="py-2 pr-3 text-right font-medium">Selling price</th>
            <th className="py-2 pr-3 text-right font-medium">Wholesale / commission</th>
            <th className="py-2 pr-3 text-right font-medium">Gross margin</th>
            <th className="py-2 pr-3 font-medium">Payment</th>
            <th className="py-2 pr-3 font-medium">Period</th>
            {actions && <th className="py-2 font-medium" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/60 align-top last:border-0">
              <td className="py-2 pr-3 text-xs">{fmtDate(r.createdAt)}<br /><Badge variant="outline" className="mt-1 text-[10px] capitalize">{r.saleType}</Badge></td>
              {showReseller && <td className="py-2 pr-3 text-xs">{r.resellerName}<br /><span className="font-mono text-muted-foreground">{r.resellerCode}</span></td>}
              <td className="py-2 pr-3">{r.customer}<br /><span className="text-xs text-muted-foreground">{r.customerEmail}</span></td>
              <td className="py-2 pr-3">{r.planName}<br /><span className="text-xs capitalize text-muted-foreground">{r.billingCycle} × {r.cycles}</span></td>
              <td className="py-2 pr-3 text-right tabular-nums">{fmtMoney(r.sellingPrice, r.currency)}{r.refundedAmount > 0 && <div className="text-xs text-violet-700">−{fmtMoney(r.refundedAmount, r.currency)} refunded</div>}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-xs">{r.wholesaleCost !== null ? fmtMoney(r.wholesaleCost, r.currency) : r.commissionAmount !== null ? `${fmtMoney(r.commissionAmount, r.currency)} comm.` : "—"}<div className="text-muted-foreground">{MODEL_LABEL[r.pricingModel]} v{r.pricingVersion ?? "—"}</div></td>
              <td className="py-2 pr-3 text-right font-medium tabular-nums">{fmtMoney(r.resellerEarning, r.currency)}{r.paymentStatus !== "paid" && r.paymentStatus !== "partially_refunded" && <div className="text-[11px] font-normal text-muted-foreground">{["pending", "pending_verification"].includes(r.paymentStatus) ? "not earned yet" : "not earned"}</div>}</td>
              <td className="py-2 pr-3"><StatusPill status={r.paymentStatus} />{r.paidAt && <div className="mt-1 text-[11px] text-muted-foreground">{fmtDate(r.paidAt)}</div>}</td>
              <td className="py-2 pr-3 text-xs">{fmtDate(r.periodStart)} → {fmtDate(r.periodEnd)}<div><StatusPill status={r.renewalStatus} className="mt-1 text-[10px]" /></div></td>
              {actions && <td className="py-2 text-right">{actions(r)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
