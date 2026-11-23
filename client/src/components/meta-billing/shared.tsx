/**
 * Shared UI pieces for Subscription & Billing, WhatsApp Usage,
 * Account Health, Cost Calculator and the super-admin Meta screens.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { META_DIRECT_BILLING_NOTICE, ESTIMATE_DISCLAIMER } from "@shared/meta-billing";

export async function getJson<T = any>(url: string): Promise<T> {
  const res = await apiRequest("GET", url);
  const json = await res.json();
  return (json?.data ?? json) as T;
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== "all") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function fmtInt(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString("en-IN");
}

export function fmtMoney(n: number | null | undefined, currency = "INR", digits = 2) {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${currency} ${v.toFixed(digits)}`;
  }
}

export function fmtDate(d: string | Date | null | undefined, withTime = false) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-IN", withTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
}

/** Categorical slots in fixed order (identity follows the category, never rank). */
export const CATEGORY_COLORS: Record<string, string> = {
  marketing: "#2a78d6",
  utility: "#eb6834",
  authentication: "#1baf7a",
  service: "#eda100",
};
export const CATEGORY_LABEL: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utility",
  authentication: "Authentication",
  service: "Service",
};

export function StatCard({
  label, value, hint, icon: Icon, tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "brand" | "danger";
}) {
  return (
    <Card className="border-border shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {Icon && (
            <span className={cn(
              "rounded-lg p-1.5",
              tone === "brand" ? "bg-primary/10 text-primary" : tone === "danger" ? "bg-red-50 text-red-600" : "bg-muted text-muted-foreground",
            )}>
              <Icon className="h-4 w-4" />
            </span>
          )}
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

const HEALTH_META: Record<string, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  healthy: { label: "Healthy", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  action_required: { label: "Action Required", cls: "bg-amber-50 text-amber-800 border-amber-200", Icon: AlertTriangle },
  restricted: { label: "Restricted", cls: "bg-orange-50 text-orange-800 border-orange-200", Icon: ShieldAlert },
  blocked: { label: "Messaging Blocked", cls: "bg-red-50 text-red-700 border-red-200", Icon: AlertOctagon },
  unknown: { label: "Not checked", cls: "bg-muted text-muted-foreground border-border", Icon: HelpCircle },
};

export function HealthBadge({ status, className }: { status?: string | null; className?: string }) {
  const m = HEALTH_META[status || "unknown"] ?? HEALTH_META.unknown;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", m.cls, className)}>
      <m.Icon className="h-3.5 w-3.5" />
      {m.label}
    </span>
  );
}

const SEVERITY_META: Record<string, { cls: string; Icon: React.ComponentType<{ className?: string }>; label: string }> = {
  blocked: { cls: "border-red-200 bg-red-50", Icon: AlertOctagon, label: "Blocking" },
  restricted: { cls: "border-orange-200 bg-orange-50", Icon: ShieldAlert, label: "Restricted" },
  warning: { cls: "border-amber-200 bg-amber-50", Icon: AlertTriangle, label: "Action required" },
  info: { cls: "border-border bg-muted/40", Icon: Info, label: "Info" },
};

export function IssueRow({ issue }: { issue: any }) {
  const m = SEVERITY_META[issue.severity] ?? SEVERITY_META.info;
  return (
    <div className={cn("rounded-xl border p-3", m.cls)}>
      <div className="flex flex-wrap items-center gap-2">
        <m.Icon className="h-4 w-4 shrink-0 text-foreground/70" />
        <span className="text-sm font-semibold text-foreground">{issue.title}</span>
        {issue.code && <Badge variant="outline" className="font-mono text-[11px]">Error {issue.code}</Badge>}
        <Badge variant="outline" className="text-[11px] capitalize">{String(issue.category || "").replace(/_/g, " ")}</Badge>
        <span className="ml-auto text-[11px] font-medium text-muted-foreground">{m.label}{issue.affectsMessaging === false ? " · does not block messaging" : ""}</span>
      </div>
      {issue.description && <p className="mt-1.5 text-sm text-muted-foreground">{issue.description}</p>}
      {issue.action && <p className="mt-1 text-sm text-foreground"><span className="font-medium">What to do: </span>{issue.action}</p>}
    </div>
  );
}

export function MetaBillingNotice({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-3 text-sm", className)}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        <p className="text-foreground">{META_DIRECT_BILLING_NOTICE}</p>
        {!compact && <p className="mt-1 text-xs text-muted-foreground">{ESTIMATE_DISCLAIMER}</p>}
      </div>
    </div>
  );
}

export function ExternalButton({ href, children, variant = "outline" }: { href: string; children: React.ReactNode; variant?: "outline" | "primary" }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border bg-background text-foreground hover:bg-secondary",
      )}
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

export function EmptyBlock({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body && <p className="mt-1 max-w-md text-xs text-muted-foreground">{body}</p>}
    </div>
  );
}

export function ErrorBlock({ error }: { error: unknown }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {(error as Error)?.message || "Something went wrong loading this data."}
    </div>
  );
}

export function SkeletonGrid({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-[92px] animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

// ── Filters ──────────────────────────────────────────────────

export const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom range" },
];

export interface UsageFilterState {
  range: string;
  from?: string;
  to?: string;
  channelId?: string;
  category?: string;
  country?: string;
  campaignId?: string;
}

export function useUsageFilterOptions(enabled = true) {
  return useQuery<any>({
    queryKey: ["/api/whatsapp/usage/filters"],
    queryFn: () => getJson("/api/whatsapp/usage/filters"),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value?: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-[150px] flex-1 sm:flex-none">
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
      <Select value={value || "all"} onValueChange={onChange}>
        <SelectTrigger className="h-9 bg-background" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function UsageFilters({
  value, onChange, showDimensions = true,
}: { value: UsageFilterState; onChange: (v: UsageFilterState) => void; showDimensions?: boolean }) {
  const { data: opts } = useUsageFilterOptions(showDimensions);
  const set = (k: keyof UsageFilterState) => (v: string) => onChange({ ...value, [k]: v === "all" ? undefined : v });
  const campaigns = (opts?.campaigns ?? []).filter((c: any) => !value.channelId || c.channelId === value.channelId);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-3">
      <FilterSelect label="Period" value={value.range} onChange={(v) => onChange({ ...value, range: v })} options={RANGE_OPTIONS} />
      {value.range === "custom" && (
        <>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground" htmlFor="uf-from">From</label>
            <Input id="uf-from" type="date" className="h-9" value={value.from ?? ""} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground" htmlFor="uf-to">To</label>
            <Input id="uf-to" type="date" className="h-9" value={value.to ?? ""} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </div>
        </>
      )}
      {showDimensions && (
        <>
          <FilterSelect label="WhatsApp number" value={value.channelId} onChange={(v) => onChange({ ...value, channelId: v === "all" ? undefined : v, campaignId: undefined })}
            options={[{ value: "all", label: "All numbers" }, ...(opts?.channels ?? []).map((c: any) => ({ value: c.id, label: `${c.name}${c.phoneNumber ? ` · ${c.phoneNumber}` : ""}` }))]} />
          <FilterSelect label="Category" value={value.category} onChange={set("category")}
            options={[{ value: "all", label: "All categories" }, ...Object.entries(CATEGORY_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
          <FilterSelect label="Country" value={value.country} onChange={set("country")}
            options={[{ value: "all", label: "All countries" }, ...(opts?.countries ?? []).map((c: any) => ({ value: c.iso, label: c.name })), { value: "*", label: "Other" }]} />
          <FilterSelect label="Campaign" value={value.campaignId} onChange={set("campaignId")}
            options={[{ value: "all", label: "All campaigns" }, ...campaigns.map((c: any) => ({ value: c.id, label: c.name }))]} />
        </>
      )}
    </div>
  );
}

export function filterQuery(f: UsageFilterState) {
  return {
    range: f.range,
    from: f.range === "custom" ? f.from : undefined,
    to: f.range === "custom" ? f.to : undefined,
    channelId: f.channelId,
    category: f.category,
    country: f.country,
    campaignId: f.campaignId,
  };
}
