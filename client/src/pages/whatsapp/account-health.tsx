/**
 * WhatsApp Account Health — business, WABA, phone number, templates.
 * Payment setup, business verification, display-name review and template
 * approval are shown as separate processes. Calling/SIP issues are listed
 * apart and never presented as messaging blocks.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, FileText, PhoneCall, RefreshCw, Smartphone, Wallet } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  EmptyBlock, ErrorBlock, ExternalButton, HealthBadge, IssueRow, fmtDate, getJson,
} from "@/components/meta-billing/shared";

function Field({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const pretty = (v?: string | null) => (v ? v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null);

const BILLING_LABEL: Record<string, string> = {
  ok: "Payment method detected",
  attention: "Payment method needs attention",
  not_detected: "No payment method detected via API",
  unknown: "Not readable via API — check Meta Business Manager",
};

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ChannelHealth({ h }: { h: any }) {
  const tc = h.templateCounts ?? {};
  return (
    <Card className="border-border shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0 pb-3">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base sm:text-base">{h.channelName || h.verifiedName || h.phoneNumber}</CardTitle>
          <p className="text-xs text-muted-foreground">{h.phoneNumber} · checked {fmtDate(h.checkedAt, true)}</p>
        </div>
        <HealthBadge status={h.overallStatus} className="text-sm" />
      </CardHeader>
      <CardContent className="space-y-4">
        {(h.issues ?? []).length > 0 ? (
          <div className="space-y-2">{h.issues.map((i: any, idx: number) => <IssueRow key={idx} issue={i} />)}</div>
        ) : h.overallStatus === "healthy" ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">No issues reported by Meta for this number.</p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Section icon={Building2} title="Business">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Business name" value={h.businessName} />
              <Field label="Business ID" value={h.businessId} mono />
              <Field label="Verification" value={pretty(h.businessVerificationStatus)} />
              <Field label="Restrictions" value={(h.issues ?? []).filter((i: any) => i.scope === "business").map((i: any) => i.title).join(", ") || "None reported"} />
            </dl>
            <div className="mt-3"><ExternalButton href={h.links?.businessVerification}>Security Centre</ExternalButton></div>
          </Section>

          <Section icon={Wallet} title="WhatsApp Business Account">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="WABA ID" value={h.wabaId} mono />
              <Field label="Name" value={h.wabaName} />
              <Field label="Account status" value={pretty(h.wabaReviewStatus)} />
              <Field label="Account mode" value={pretty(h.accountMode)} />
              <Field label="Messaging availability" value={pretty(h.messagingAvailability)} />
              <Field label="Billing (Meta)" value={BILLING_LABEL[h.billingStatus ?? "unknown"]} />
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <ExternalButton href={h.links?.billing}>Meta billing</ExternalButton>
              <ExternalButton href={h.links?.whatsappManager}>WhatsApp Manager</ExternalButton>
            </div>
          </Section>

          <Section icon={Smartphone} title="Phone number">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Number" value={h.phoneNumber} />
              <Field label="Verified display name" value={h.verifiedName} />
              <Field label="Display name review" value={pretty(h.nameStatus)} />
              <Field label="Quality rating" value={pretty(h.qualityRating)} />
              <Field label="Messaging limit" value={h.messagingLimit?.replace("TIER_", "").replace("_", " ")} />
              <Field label="Registration" value={pretty(h.phoneStatus)} />
              <Field label="Code verification" value={pretty(h.codeVerificationStatus)} />
              <Field label="Phone number ID" value={h.phoneNumberId} mono />
            </dl>
          </Section>

          <Section icon={FileText} title="Templates">
            <div className="grid grid-cols-5 gap-2 text-center">
              {(["approved", "pending", "rejected", "disabled", "paused"] as const).map((k) => (
                <div key={k} className="rounded-lg bg-muted/50 p-2">
                  <p className="text-lg font-semibold tabular-nums text-foreground">{tc[k] ?? 0}</p>
                  <p className="text-[11px] capitalize text-muted-foreground">{k}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {(h.callingIssues ?? []).length > 0 && (
          <Section icon={PhoneCall} title="Calling (separate from messaging)">
            <div className="space-y-2">{h.callingIssues.map((i: any, idx: number) => <IssueRow key={idx} issue={i} />)}</div>
          </Section>
        )}
        {h.lastError && <p className="text-xs text-muted-foreground">Meta API note: {h.lastError}</p>}
      </CardContent>
    </Card>
  );
}

export default function AccountHealthPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, isError, error } = useQuery<any[]>({
    queryKey: ["/api/whatsapp/account-health"],
    queryFn: () => getJson("/api/whatsapp/account-health"),
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await getJson("/api/whatsapp/account-health?refresh=1");
      qc.setQueryData(["/api/whatsapp/account-health"], fresh);
      toast({ title: "Health refreshed from Meta" });
    } catch (e: any) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Account Health" subtitle="Meta verification, limits, quality and restrictions for your WhatsApp numbers" />
      <main className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Payment setup, business verification, display-name review and template approval are separate Meta processes. A missing payment method does not by itself block verification or reviews.
          </p>
          <Button onClick={refresh} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Checking Meta…" : "Refresh from Meta"}
          </Button>
        </div>
        {isLoading ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        ) : isError ? (
          <ErrorBlock error={error} />
        ) : (data ?? []).length === 0 ? (
          <EmptyBlock title="No WhatsApp account connected" body="Connect a number through Embedded Signup to see its health." />
        ) : (
          data!.map((h) => <ChannelHealth key={h.channelId} h={h} />)
        )}
      </main>
    </div>
  );
}
