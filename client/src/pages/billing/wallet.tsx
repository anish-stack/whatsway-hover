import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet as WalletIcon,
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Receipt,
  RefreshCw,
} from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/ui/loading";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface WalletBalance {
  balance: number;
  reserved: number;
  creditLimit: number;
  available: number;
  currency: string;
  isBlocked: boolean;
  lowBalanceThreshold: number;
  isLow: boolean;
}

interface LedgerRow {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  currency: string;
  category: string | null;
  source: string | null;
  quantity: number | null;
  description: string | null;
  createdAt: string;
}

const QUICK_AMOUNTS = [500, 1000, 2500, 5000];

function money(value: number | string, currency = "INR") {
  const n = Number(value || 0);
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function WalletPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<string>("1000");
  const [provider, setProvider] = useState<"razorpay" | "stripe">("razorpay");
  const [busy, setBusy] = useState(false);

  const { data: balance, isLoading } = useQuery<WalletBalance>({
    queryKey: ["/api/billing/wallet"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/billing/wallet");
      const json = await res.json();
      return json.data;
    },
  });

  const { data: ledger } = useQuery<{ rows: LedgerRow[]; total: number }>({
    queryKey: ["/api/billing/wallet/transactions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/billing/wallet/transactions?limit=50");
      return res.json();
    },
  });

  const { data: usage } = useQuery<any>({
    queryKey: ["/api/billing/usage", "monthly"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/billing/usage?period=monthly");
      const json = await res.json();
      return json.data;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/billing/wallet"] });
    queryClient.invalidateQueries({ queryKey: ["/api/billing/wallet/transactions"] });
  };

  const startTopup = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast({
        title: "Enter an amount",
        description: "Top-up amount must be greater than zero.",
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/billing/wallet/topup", {
        provider,
        amount: value,
        currency: balance?.currency,
      });
      const json = await res.json();

      if (provider === "stripe") {
        // hosted checkout — leave the app and come back via the return URL
        window.location.href = json.data.checkoutUrl;
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });

      const rzp = new window.Razorpay({
        key: json.data.keyId,
        order_id: json.data.orderId,
        amount: Math.round(json.data.amount * 100),
        currency: json.data.currency,
        name: "Message credit",
        description: `Top-up of ${money(json.data.amount, json.data.currency)}`,
        handler: async (response: any) => {
          try {
            const verify = await apiRequest("POST", "/api/billing/wallet/topup/verify", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            await verify.json();
            toast({
              title: "Wallet topped up",
              description: `${money(json.data.amount, json.data.currency)} added.`,
            });
            refresh();
          } catch (error: any) {
            toast({
              title: "Verification failed",
              description: error.message,
              variant: "destructive",
            });
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });
      rzp.open();
    } catch (error: any) {
      setBusy(false);
      toast({
        title: "Top-up could not be started",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Wallet" subtitle="Message credit and billing" />
        <div className="p-6">
          <Loading />
        </div>
      </>
    );
  }

  const currency = balance?.currency || "INR";

  return (
    <>
      <Header title="Wallet" subtitle="Message credit and billing" />

      <div className="space-y-6 p-4 sm:p-6">
        {balance?.isBlocked && (
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--bad)] bg-[var(--bad-soft)] p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--bad)]" />
            <div>
              <p className="font-semibold text-[var(--bad)]">Wallet blocked</p>
              <p className="text-sm text-muted-foreground">
                Sending is paused on this account. Contact support to unblock it.
              </p>
            </div>
          </div>
        )}

        {!balance?.isBlocked && balance?.isLow && (
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--warn)] bg-[var(--warn-soft)] p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn)]" />
            <div>
              <p className="font-semibold text-[var(--warn)]">Low balance</p>
              <p className="text-sm text-muted-foreground">
                You are at or below {money(balance.lowBalanceThreshold, currency)}. Top up
                to avoid sends being rejected.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <WalletIcon className="h-4 w-4 text-primary" />
                Available balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="stat-figure">{money(balance?.balance ?? 0, currency)}</div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit limit</span>
                  <span>{money(balance?.creditLimit ?? 0, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Spendable</span>
                  <span className="font-semibold">
                    {money(balance?.available ?? 0, currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Low-balance alert at</span>
                  <span>{money(balance?.lowBalanceThreshold ?? 0, currency)}</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full gap-2"
                onClick={refresh}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Add credit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((value) => (
                  <button
                    key={value}
                    onClick={() => setAmount(String(value))}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                      amount === String(value)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {money(value, currency)}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setProvider("razorpay")}
                    className={`rounded-xl border px-4 text-sm font-semibold transition-colors ${
                      provider === "razorpay"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    Razorpay
                  </button>
                  <button
                    onClick={() => setProvider("stripe")}
                    className={`rounded-xl border px-4 text-sm font-semibold transition-colors ${
                      provider === "stripe"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    Stripe
                  </button>
                </div>
              </div>

              <Button className="mt-4 w-full gap-2" onClick={startTopup} disabled={busy}>
                {busy ? "Opening checkout…" : `Pay ${money(Number(amount) || 0, currency)}`}
              </Button>

              <p className="mt-3 text-xs text-muted-foreground">
                Credit is added only after the payment is confirmed by the gateway.
              </p>
            </CardContent>
          </Card>
        </div>

        {usage && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">This month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <div className="stat-figure">{usage.totals?.sent ?? 0}</div>
                  <div className="stat-label">Sent</div>
                </div>
                <div>
                  <div className="stat-figure">{usage.totals?.failed ?? 0}</div>
                  <div className="stat-label">Failed</div>
                </div>
                <div>
                  <div className="stat-figure">{money(usage.totals?.cost ?? 0, currency)}</div>
                  <div className="stat-label">Spent</div>
                </div>
                <div>
                  <div className="stat-figure">{usage.period}</div>
                  <div className="stat-label">Period</div>
                </div>
              </div>

              {!!usage.breakdown?.length && (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 font-medium">Category</th>
                        <th className="py-2 font-medium">Source</th>
                        <th className="py-2 text-right font-medium">Sent</th>
                        <th className="py-2 text-right font-medium">Failed</th>
                        <th className="py-2 text-right font-medium">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.breakdown.map((row: any, i: number) => (
                        <tr key={i} className="border-b border-border/60">
                          <td className="py-2 capitalize">{row.category}</td>
                          <td className="py-2 capitalize text-muted-foreground">
                            {row.source}
                          </td>
                          <td className="py-2 text-right">{row.sent}</td>
                          <td className="py-2 text-right">{row.failed}</td>
                          <td className="py-2 text-right">{money(row.cost, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-primary" />
              Ledger
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!ledger?.rows?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No wallet activity yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 font-medium">When</th>
                      <th className="py-2 font-medium">Detail</th>
                      <th className="py-2 font-medium">Type</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                      <th className="py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.rows.map((row) => {
                      const isOut = row.type === "debit";
                      return (
                        <tr key={row.id} className="border-b border-border/60">
                          <td className="py-2.5 whitespace-nowrap text-muted-foreground">
                            {new Date(row.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2.5">
                            <div>{row.description || "—"}</div>
                            {row.category && (
                              <div className="text-xs capitalize text-muted-foreground">
                                {row.category}
                                {row.source ? ` · ${row.source}` : ""}
                                {row.quantity && row.quantity > 1 ? ` · ×${row.quantity}` : ""}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5">
                            <Badge variant={isOut ? "destructive" : "success"}>
                              {isOut ? (
                                <ArrowUpRight className="h-3 w-3" />
                              ) : (
                                <ArrowDownRight className="h-3 w-3" />
                              )}
                              {row.type}
                            </Badge>
                          </td>
                          <td
                            className={`py-2.5 text-right font-semibold ${
                              isOut ? "text-[var(--bad)]" : "text-[var(--ok)]"
                            }`}
                          >
                            {isOut ? "−" : "+"}
                            {money(row.amount, row.currency)}
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">
                            {money(row.balanceAfter, row.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
