/**
 * Subscription & Billing — two independent sections:
 *  A. HoverChat subscription (what the customer pays HoverChat)
 *  B. Meta WhatsApp usage (what Meta bills the customer directly — estimate)
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Calendar, CheckCheck, CreditCard, IndianRupee, MessageSquare, Receipt, XCircle } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import BillingSubscriptionPage from "@/components/billing-subscription-page";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { payWithRazorpay } from "@/components/reseller/shared";
import { useToast } from "@/hooks/use-toast";

/** Customers onboarded by a reseller pay their invoice here (HoverChat Razorpay checkout). */
function ResellerInvoiceBanner() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery<any>({ queryKey: ["/api/billing/reseller-invoice"], queryFn: () => getJson("/api/billing/reseller-invoice") });
  if (!data?.reseller && !data?.openInvoice) return null;
  const inv = data.openInvoice;
  const pay = async () => {
    setBusy(true);
    try {
      await payWithRazorpay({
        orderUrl: `/api/billing/reseller-invoice/${inv.saleId}/order`,
        verifyUrl: `/api/billing/reseller-invoice/${inv.saleId}/verify`,
        description: `${inv.planName} (${inv.billingCycle} × ${inv.cycles})`,
        onDone: (r) => { setBusy(false); toast({ title: r.settled ? "Payment received — subscription updated" : "Payment recorded, awaiting verification" }); qc.invalidateQueries(); },
        onError: (m) => { setBusy(false); toast({ title: "Payment not completed", description: m, variant: "destructive" }); },
      });
    } catch (e: any) { setBusy(false); toast({ title: "Payment unavailable", description: e.message, variant: "destructive" }); }
  };
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.05] p-4">
      {data.reseller && <p className="text-sm text-muted-foreground">Your HoverChat partner: <strong className="text-foreground">{data.reseller.resellerName}</strong></p>}
      {inv ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{inv.saleType === "renewal" ? "Renewal" : "Subscription"} invoice: <strong>{inv.planName}</strong> · {fmtMoney(inv.amount, inv.currency)} · {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}</p>
          <Button size="sm" onClick={pay} disabled={busy}>{busy ? "Opening checkout…" : `Pay ${fmtMoney(inv.amount, inv.currency)}`}</Button>
        </div>
      ) : <p className="mt-1 text-xs text-muted-foreground">No invoice due.</p>}
    </div>
  );
}
import {
  CATEGORY_COLORS, CATEGORY_LABEL, EmptyBlock, ErrorBlock, ExternalButton, HealthBadge, MetaBillingNotice,
  SkeletonGrid, StatCard, fmtDate, fmtInt, fmtMoney, getJson,
} from "@/components/meta-billing/shared";

const SUB_STATUS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-muted text-muted-foreground border-border",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
};

const BILLING_SETUP: Record<string, { label: string; cls: string }> = {
  ok: { label: "Payment method detected", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  attention: { label: "Needs attention", cls: "bg-red-50 text-red-700 border-red-200" },
  not_detected: { label: "Not detected via API", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  unknown: { label: "Check in Meta", cls: "bg-muted text-muted-foreground border-border" },
};

function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${cls}`}>{children}</span>;
}

export default function BillingOverviewPage() {
  const overview = useQuery<any>({ queryKey: ["/api/billing/overview"], queryFn: () => getJson("/api/billing/overview") });
  const sub = useQuery<any>({ queryKey: ["/api/billing/subscription"], queryFn: () => getJson("/api/billing/subscription") });

  const s = sub.data?.subscription;
  const usage = overview.data?.metaUsage;
  const accounts: any[] = overview.data?.metaAccounts ?? [];
  const currency = usage?.estimatedCost?.currency || "INR";

  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Subscription & Billing" subtitle="Your HoverChat plan and your Meta WhatsApp usage, kept separate" />
      <main className="space-y-8 p-4 sm:p-6">
        {/* ── A. HoverChat subscription ─────────────────────── */}
        <section aria-labelledby="sec-sub" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="sec-sub" className="text-lg font-semibold text-foreground">HoverChat subscription</h2>
              <p className="text-sm text-muted-foreground">Billed by HoverChat. Independent of your Meta account billing status.</p>
            </div>
            <Link href="/plans"><Button variant="outline" size="sm">Change plan</Button></Link>
          </div>

          <ResellerInvoiceBanner />

          {sub.isLoading ? <SkeletonGrid /> : sub.isError ? <ErrorBlock error={sub.error} /> : !s ? (
            <EmptyBlock title="No active subscription" body={`HoverChat is ₹${sub.data?.defaultPrice ?? 999}/month. Choose a plan to start sending.`} />
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Plan" value={<span className="text-lg leading-snug">{s.planName}</span>} hint={s.priceLabel ?? undefined} icon={CreditCard} tone="brand" />
              <StatCard label="Status" value={<Pill cls={SUB_STATUS[s.status] ?? SUB_STATUS.cancelled}>{s.status}</Pill>} hint={s.autoRenew ? "Auto-renew on" : "Auto-renew off"} />
              <StatCard label="Started" value={<span className="text-base">{fmtDate(s.startDate)}</span>} icon={Calendar} />
              <StatCard label={s.renewalDate ? "Renews on" : "Expires on"} value={<span className="text-base">{fmtDate(s.renewalDate ?? s.expiryDate)}</span>} icon={Calendar}
                hint={s.renewalDate ? `Expiry ${fmtDate(s.expiryDate)}` : undefined} />
            </div>
          )}

          {/* Existing plan cards incl. cancel flow — reused, not duplicated */}
          <div className="overflow-hidden rounded-xl border border-border">
            <BillingSubscriptionPage embedded />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="border-border shadow-none">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base sm:text-base"><Receipt className="h-4 w-4 text-primary" />Payment history</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto pt-0">
                {(sub.data?.payments ?? []).length === 0 ? <EmptyBlock title="No payments yet" /> : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Plan</th>
                      <th className="py-2 pr-3 font-medium">Status</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
                    <tbody>
                      {sub.data.payments.slice(0, 12).map((p: any) => (
                        <tr key={p.id} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-3">{fmtDate(p.paidAt ?? p.createdAt)}</td>
                          <td className="py-2 pr-3">{p.planName ?? "—"} <span className="text-xs text-muted-foreground">· {p.billingCycle}</span></td>
                          <td className="py-2 pr-3"><Badge variant="outline" className="capitalize">{p.status}</Badge></td>
                          <td className="py-2 text-right tabular-nums">{fmtMoney(p.amount, p.currency || "INR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
            <Card className="border-border shadow-none">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base sm:text-base"><Receipt className="h-4 w-4 text-primary" />Invoices</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto pt-0">
                {(sub.data?.invoices ?? []).length === 0 ? <EmptyBlock title="No invoices yet" body="Invoices appear after a successful subscription payment." /> : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Invoice</th><th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Via</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
                    <tbody>
                      {sub.data.invoices.slice(0, 12).map((i: any) => (
                        <tr key={i.id} className="border-b border-border/60 last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">{i.number}</td>
                          <td className="py-2 pr-3">{fmtDate(i.date)}</td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">{i.provider ?? "—"}</td>
                          <td className="py-2 text-right tabular-nums">{fmtMoney(i.amount, i.currency || "INR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── B. Meta WhatsApp usage ─────────────────────────── */}
        <section aria-labelledby="sec-meta" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="sec-meta" className="text-lg font-semibold text-foreground">Meta WhatsApp usage</h2>
              <p className="text-sm text-muted-foreground">{usage ? `${usage.period.label} · ${fmtDate(usage.period.from)} onwards` : "This month"}</p>
            </div>
            <div className="flex gap-2">
              <Link href="/whatsapp-usage"><Button variant="outline" size="sm">Detailed usage</Button></Link>
              <Link href="/cost-calculator"><Button variant="outline" size="sm">Cost calculator</Button></Link>
            </div>
          </div>
          <MetaBillingNotice />

          {overview.isLoading ? <SkeletonGrid n={8} /> : overview.isError ? <ErrorBlock error={overview.error} /> : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Total sent" value={fmtInt(usage?.totals.total)} icon={MessageSquare} />
                <StatCard label="Delivered" value={fmtInt(usage?.totals.delivered)} icon={CheckCheck} tone="brand" hint={`${usage?.totals.deliveryRate ?? 0}% delivery rate`} />
                <StatCard label="Failed" value={fmtInt(usage?.totals.failed)} icon={XCircle} tone={usage?.totals.failed ? "danger" : "default"} />
                <StatCard label="Estimated Meta cost" value={usage?.estimatedCost?.amount === null ? "Multiple currencies" : fmtMoney(usage?.estimatedCost?.amount ?? 0, currency)} icon={IndianRupee} tone="brand" hint="Excl. taxes · final amount on your Meta invoice" />
                {(["marketing", "utility", "authentication", "service"] as const).map((k) => (
                  <StatCard key={k} label={CATEGORY_LABEL[k]}
                    value={<span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[k] }} />{fmtInt(usage?.categories?.[k])}</span>} />
                ))}
              </div>

              <Card className="border-border shadow-none">
                <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">Connected WhatsApp Business Accounts</CardTitle></CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {accounts.length === 0 ? <EmptyBlock title="No WhatsApp account connected" body="Connect through Embedded Signup, then add a payment method in Meta Business Manager." /> : accounts.map((a) => {
                    const b = BILLING_SETUP[a.billingStatus] ?? BILLING_SETUP.unknown;
                    return (
                      <div key={a.wabaId ?? a.phoneNumbers[0]?.channelId} className="rounded-xl border border-border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{a.wabaName || a.businessName || "WhatsApp Business Account"}</p>
                            <p className="font-mono text-xs text-muted-foreground">WABA {a.wabaId ?? "—"}{a.businessId ? ` · Business ${a.businessId}` : ""}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">Meta billing setup:</span>
                            <Pill cls={b.cls}>{b.label}</Pill>
                            <ExternalButton href={a.billingUrl} variant="primary">Open Meta billing</ExternalButton>
                          </div>
                        </div>
                        <ul className="mt-3 divide-y divide-border/60">
                          {a.phoneNumbers.map((p: any) => (
                            <li key={p.channelId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                              <span>{p.name} <span className="text-muted-foreground">· {p.phoneNumber}</span></span>
                              <HealthBadge status={p.overallStatus} />
                            </li>
                          ))}
                        </ul>
                        {a.billingStatus === "unknown" && (
                          <p className="mt-2 text-xs text-muted-foreground">Meta does not expose payment details to HoverChat for this account. Confirm the payment method in Meta Business Manager. HoverChat never stores card details.</p>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
