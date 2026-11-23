/**
 * Public pay link: /pay/:token. Customer pays the reseller invoice on
 * HoverChat's own Razorpay checkout. Activation happens only after the
 * server verifies the Razorpay signature (and the webhook confirms).
 */
import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { CheckCircle2, MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtMoney, payWithRazorpay, send, StatusPill } from "@/components/reseller/shared";

export default function PayPage() {
  const [, params] = useRoute("/pay/:token");
  const token = params?.token ?? "";
  const [inv, setInv] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    send("GET", `/api/public/reseller-pay/${encodeURIComponent(token)}`).then(setInv).catch((e) => setError(e.message));
  }, [token]);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      await payWithRazorpay({
        orderUrl: `/api/public/reseller-pay/${encodeURIComponent(token)}/order`,
        verifyUrl: `/api/public/reseller-pay/${encodeURIComponent(token)}/verify`,
        description: `${inv.planName} (${inv.billingCycle} × ${inv.cycles})`,
        onDone: (r) => { setResult(r); setBusy(false); },
        onError: (m) => { setError(m); setBusy(false); },
      });
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const payable = inv && ["pending", "pending_verification"].includes(inv.status);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--brand-50,#eafbf2)] p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="rounded-xl bg-primary p-2 text-primary-foreground"><MessageSquare className="h-5 w-5" /></span>
          <span className="text-lg font-semibold">HoverChat</span>
        </div>
        {!inv && !error && <div className="h-40 animate-pulse rounded-xl bg-muted" />}
        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {result?.settled || inv?.status === "paid" ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="text-xl font-semibold">Payment received</h1>
            <p className="text-sm text-muted-foreground">Your subscription is active. Sign in to connect your WhatsApp Business number.</p>
            <Link href="/login"><Button className="w-full">Sign in</Button></Link>
          </div>
        ) : result && !result.settled ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Payment recorded but needs verification by HoverChat. You'll get an email once it is confirmed.</p>
        ) : inv && (
          <>
            <h1 className="text-xl font-semibold">{inv.saleType === "renewal" ? "Renewal invoice" : "Subscription invoice"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">From {inv.resellerName} · for {inv.customerName}{inv.email ? ` (${inv.email})` : ""}</p>
            <dl className="mt-5 space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Plan</dt><dd>{inv.planName}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Billing</dt><dd className="capitalize">{inv.billingCycle} × {inv.cycles}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Period</dt><dd>{fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd><StatusPill status={inv.status} /></dd></div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{fmtMoney(inv.amount, inv.currency)}</dd></div>
            </dl>
            {payable ? (
              <Button className="mt-5 w-full" size="lg" onClick={pay} disabled={busy}>{busy ? "Opening checkout…" : `Pay ${fmtMoney(inv.amount, inv.currency)}`}</Button>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">This invoice is {String(inv.status).replace(/_/g, " ")} and cannot be paid.</p>
            )}
            <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Payment is processed by Razorpay for HoverChat. WhatsApp messaging charges are billed separately by Meta to your WhatsApp Business Account.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
