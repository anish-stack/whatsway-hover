import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IndianRupee, Save, Calculator, Users } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/ui/loading";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";

interface RateCard {
  currency: string;
  rates: {
    marketing: number;
    utility: number;
    authentication: number;
    service: number;
  };
  source: "override" | "global" | "default";
  rateId: string | null;
}

const CATEGORY_HELP: Record<string, string> = {
  marketing: "Promotions, offers, re-engagement. The expensive one.",
  utility: "Order updates, alerts, reminders sent on a template.",
  authentication: "OTP and login codes.",
  service: "Replies inside the 24-hour window. Usually free.",
};

const SOURCE_LABEL: Record<string, string> = {
  override: "Custom rate for this account",
  global: "Platform rate card",
  default: "Built-in default (nothing saved yet)",
};

export default function RateCardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";

  const [form, setForm] = useState({
    marketing: "1.50",
    utility: "0.12",
    authentication: "0.16",
    service: "0.00",
    currency: "INR",
  });
  const [overrideUserId, setOverrideUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [quoteQty, setQuoteQty] = useState("1000");
  const [quoteCategory, setQuoteCategory] = useState("marketing");

  // Superadmin edits the universal card; everyone else sees their own.
  const endpoint = isSuperadmin ? "/api/billing/rates/global" : "/api/billing/rates";

  const { data: card, isLoading } = useQuery<RateCard>({
    queryKey: [endpoint],
    queryFn: async () => {
      const res = await apiRequest("GET", endpoint);
      const json = await res.json();
      return json.data;
    },
  });

  useEffect(() => {
    if (card?.rates) {
      setForm({
        marketing: String(card.rates.marketing),
        utility: String(card.rates.utility),
        authentication: String(card.rates.authentication),
        service: String(card.rates.service),
        currency: card.currency,
      });
    }
  }, [card]);

  const { data: quote } = useQuery<any>({
    queryKey: ["/api/billing/quote", quoteCategory, quoteQty],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/billing/quote?category=${quoteCategory}&quantity=${quoteQty || 1}`
      );
      const json = await res.json();
      return json.data;
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/billing/rates", {
        userId: overrideUserId || null,
        currency: form.currency,
        marketing: form.marketing,
        utility: form.utility,
        authentication: form.authentication,
        service: form.service,
      });
      toast({
        title: overrideUserId ? "Client override saved" : "Rate card saved",
        description: overrideUserId
          ? "This client is now billed on their own rates."
          : "Every client without an override now uses these rates.",
      });
      setOverrideUserId("");
      queryClient.invalidateQueries({ queryKey: [endpoint] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/quote"] });
    } catch (error: any) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Message pricing" subtitle="Per-message rates by category" />
        <div className="p-6">
          <Loading />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Message pricing" subtitle="Per-message rates by category" />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(["marketing", "utility", "authentication", "service"] as const).map((key) => (
            <Card key={key}>
              <CardContent className="p-5">
                <p className="text-sm font-semibold capitalize text-foreground">{key}</p>
                <div className="stat-figure mt-2">
                  {card?.currency} {Number(card?.rates?.[key] ?? 0).toFixed(2)}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {CATEGORY_HELP[key]}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-3 text-base">
              <IndianRupee className="h-4 w-4 text-primary" />
              {isSuperadmin ? "Edit rates" : "Your rates"}
              <Badge variant={card?.source === "override" ? "flare" : "secondary"}>
                {SOURCE_LABEL[card?.source || "default"]}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!isSuperadmin ? (
              <p className="text-sm text-muted-foreground">
                These are the rates charged to your account per message sent. Session
                replies inside the 24-hour window are billed at the service rate.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {(["marketing", "utility", "authentication", "service"] as const).map(
                    (key) => (
                      <div key={key}>
                        <label className="mb-1.5 block text-sm font-medium capitalize">
                          {key}
                        </label>
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={form[key]}
                          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        />
                      </div>
                    )
                  )}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Currency</label>
                    <Input
                      value={form.currency}
                      onChange={(e) =>
                        setForm({ ...form, currency: e.target.value.toUpperCase() })
                      }
                      maxLength={3}
                    />
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-border p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4 text-primary" />
                    Save as a client override (optional)
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave blank to update the platform rate card. Enter a user ID to give
                    that one client their own rates instead.
                  </p>
                  <Input
                    className="mt-3"
                    placeholder="User ID (blank = platform rate card)"
                    value={overrideUserId}
                    onChange={(e) => setOverrideUserId(e.target.value)}
                  />
                </div>

                <Button className="mt-4 gap-2" onClick={save} disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving
                    ? "Saving…"
                    : overrideUserId
                    ? "Save client override"
                    : "Save platform rates"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="h-4 w-4 text-primary" />
              What would a send cost?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Category</label>
                <select
                  className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-sm"
                  value={quoteCategory}
                  onChange={(e) => setQuoteCategory(e.target.value)}
                >
                  <option value="marketing">Marketing</option>
                  <option value="utility">Utility</option>
                  <option value="authentication">Authentication</option>
                  <option value="service">Service</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Messages</label>
                <Input
                  type="number"
                  min={1}
                  value={quoteQty}
                  onChange={(e) => setQuoteQty(e.target.value)}
                />
              </div>
              <div className="rounded-xl bg-primary/10 px-5 py-3">
                <div className="text-xs text-muted-foreground">Total</div>
                <div className="text-xl font-bold text-primary">
                  {quote ? `${quote.currency} ${Number(quote.total).toFixed(2)}` : "—"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
