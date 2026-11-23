/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * Original Author: BTPL Engineering Team
 * Website: https://hoverbusinessservices.com
 * Contact: info@hovermedia.in
 * ============================================================
 */

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCheck,
  Edit,
  ExternalLink,
  Eye,
  FileText,
  LogIn,
  LogOut,
  Megaphone,
  MessageSquare,
  PlusCircle,
  Send,
  ShieldCheck,
  Upload,
  Users,
  Workflow,
  XCircle,
  ShoppingBag,
  Plug,
  Sparkles,
  Zap,
} from "lucide-react";
import Header from "@/components/layout/header";
import { Loading } from "@/components/ui/loading";
import { MessageChart, MESSAGE_SERIES } from "@/components/charts/message-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";
import AdminStats from "@/components/AdminStats";
import ResellerSummaryCard from "@/components/reseller/ResellerSummaryCard";
import MetaBillCard from "@/components/dashboard/MetaBillCard";
import type { DashboardStarApiDataType } from "./types/type";

const nf = (n: number | undefined | null) => (n ?? 0).toLocaleString("en-IN");
const pct = (a: number, b: number) => (b > 0 ? Math.min((a / b) * 100, 100) : 0);

function Kpi({ icon, tone, label, value, foot }: {
  icon: ReactNode; tone: string; label: string; value: ReactNode; foot?: ReactNode;
}) {
  return (
    <Card className="rounded-2xl transition-shadow hover:shadow-[0_14px_34px_-24px_rgba(22,18,46,0.55)]">
      <CardContent className="flex h-full flex-col gap-2 p-4 sm:gap-3 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
          <span className={`rounded-xl p-2 ${tone}`}>{icon}</span>
        </div>
        <div className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold tracking-[-0.03em] text-foreground tabular-nums">
          {value}
        </div>
        {foot && <div className="mt-auto text-xs text-muted-foreground">{foot}</div>}
      </CardContent>
    </Card>
  );
}

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

function Trend({ cur, prev, suffix }: { cur: number; prev: number; suffix: string }) {
  if (!prev && !cur) return <span>No activity yet</span>;
  const change = prev === 0 ? 100 : ((cur - prev) / prev) * 100;
  const up = change >= 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center font-medium ${up ? "text-emerald-600" : "text-red-600"}`}>
        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {Math.abs(change).toFixed(1)}%
      </span>
      {suffix}
    </span>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isSuper = user?.role === "superadmin";
  const [timeRange, setTimeRange] = useState<number>(30);

  const { data: activeChannel } = useQuery<any>({
    queryKey: ["/api/channels/active"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/channels/active");
      if (!response.ok) return null;
      return await response.json();
    },
  });

  const { data: activityLogs = [], isLoading: logsLoading } = useQuery<any[]>({
    queryKey: ["/api/team/activity-logs"],
    queryFn: async () => (await apiRequest("GET", "/api/team/activity-logs")).json(),
    enabled: isSuper,
  });

  const { data: stats, isLoading: statsLoading } = useDashboardStats(activeChannel?.id);

  const { data: messageAnalytics, isLoading: analyticsLoading } = useQuery<any>({
    queryKey: ["/api/analytics/messages", activeChannel?.id, timeRange],
    queryFn: async () => {
      const params = new URLSearchParams({
        days: timeRange.toString(),
        ...(!isSuper && activeChannel?.id && { channelId: activeChannel.id }),
      });
      return (await apiRequest("GET", `/api/analytics/messages?${params}`)).json();
    },
    enabled: isSuper ? true : !!activeChannel?.id,
  });

  if (statsLoading) {
    return (
      <div className="flex-1 dots-bg">
        <Header title={t("dashboard.title")} subtitle={t("dashboard.loadingData")} />
        <div className="p-6"><Loading size="lg" text={t("dashboard.loadingDashboard")} /></div>
      </div>
    );
  }

  const chartData =
    messageAnalytics?.dailyStats?.map((stat: any) => ({
      date: new Date(stat.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      sent: stat.totalSent || 0,
      delivered: stat.delivered || 0,
      read: stat.read || 0,
      failed: stat.failed || 0,
    })) || [];

  const chartCard = (
    <Card className="min-w-0 overflow-hidden rounded-2xl">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base sm:text-base">
            <span className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/40"><BarChart3 className="h-4 w-4" /></span>
            {t("dashboard.messageAnalytics")}
          </CardTitle>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {[
              { value: 1, label: t("dashboard.today") },
              { value: 7, label: t("dashboard.7Days") },
              { value: 30, label: t("dashboard.30Days") },
              { value: 90, label: t("dashboard.3Months") },
            ].map((r) => (
              <button
                key={r.value}
                onClick={() => setTimeRange(r.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${timeRange === r.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-2">
          {MESSAGE_SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {t(s.labelKey)}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {analyticsLoading ? <Loading text={t("common.loading")} /> : <MessageChart data={chartData} />}
      </CardContent>
    </Card>
  );

  // ─────────────────────────── Super admin ───────────────────────────
  if (isSuper) {
    const activityMeta = (action: string) => {
      switch (action) {
        case "login": return { icon: <LogIn className="h-4 w-4 text-emerald-600" />, color: "bg-emerald-50", label: t("dashboard.activity.login") };
        case "logout": return { icon: <LogOut className="h-4 w-4 text-muted-foreground" />, color: "bg-muted", label: t("dashboard.activity.logout") };
        case "user_created": return { icon: <PlusCircle className="h-4 w-4 text-blue-600" />, color: "bg-blue-50", label: t("dashboard.activity.user_created") };
        case "user_updated": return { icon: <Edit className="h-4 w-4 text-amber-600" />, color: "bg-amber-50", label: t("dashboard.activity.user_updated") };
        default: return { icon: <Activity className="h-4 w-4 text-[var(--brand)]" />, color: "bg-[var(--brand-100)]", label: t("dashboard.activity.default") };
      }
    };
    return (
      <div className="flex-1 dots-bg min-h-screen">
        <Header title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />
        <main className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
          <AdminStats />
          <ResellerSummaryCard compact />
          <MetaBillCard />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">{chartCard}</div>
            <Card className="rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base sm:text-base"><Activity className="h-4 w-4" /> {t("dashboard.recentActivities")}</CardTitle>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <p className="text-sm text-muted-foreground">{t("dashboard.loadingActivities")}</p>
                ) : activityLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("dashboard.noRecentActivities")}</p>
                ) : (
                  <ul className="divide-y">
                    {[...activityLogs]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .slice(0, 6)
                      .map((log) => {
                        const m = activityMeta(log.action);
                        return (
                          <li key={log.id} className="flex items-start gap-3 py-3 first:pt-0">
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.color}`}>{m.icon}</span>
                            <div className="min-w-0">
                              <p className="truncate text-sm text-foreground">{m.label} {t("dashboard.by")} {log.userName}</p>
                              <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}</p>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                )}
                <Button variant="ghost" className="mt-2 w-full text-[var(--brand)]" onClick={() => setLocation("/team")}>
                  {t("dashboard.viewAllActivities")} <ExternalLink className="ml-1 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // ─────────────────────────── Customer / team ───────────────────────────
  const s: DashboardStarApiDataType = stats || ({} as any);
  const outbound = s.totalMessages || 0;
  const deliveryRate = pct(s.messagesDelivered || 0, outbound);
  const readRate = pct(s.messagesRead || 0, outbound);
  const health = activeChannel?.healthDetails || {};
  const connected = activeChannel?.isActive === true;

  const tierLimitMap: Record<string, number> = { TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000, TIER_10K: 10000, TIER_100K: 100000 };
  const tierKey: string | undefined = health.messaging_limit;
  const unlimited = tierKey === "UNLIMITED" || tierKey === "TIER_UNLIMITED";
  const dailyLimit = tierKey && tierLimitMap[tierKey] ? tierLimitMap[tierKey] : null;
  const todaySent = s.todayMessages || 0;
  const quality = String(health.quality_rating || "").toUpperCase();
  const qualityTone = quality === "GREEN" ? "text-emerald-600 bg-emerald-50" : quality === "YELLOW" ? "text-amber-700 bg-amber-50" : quality === "RED" ? "text-red-600 bg-red-50" : "text-muted-foreground bg-muted";

  const maskedPhone = activeChannel?.phoneNumber
    ? String(activeChannel.phoneNumber).slice(0, -4).replace(/\d/g, "•") + String(activeChannel.phoneNumber).slice(-4)
    : "";

  const actions = [
    { icon: Megaphone, label: t("dashboard.newCampaign"), sub: "Send to many contacts", href: "/campaigns", tone: "bg-orange-50 text-orange-600" },
    { icon: Upload, label: t("dashboard.importContacts"), sub: t("dashboard.uploadCSV"), href: "/contacts", tone: "bg-blue-50 text-blue-600" },
    { icon: FileText, label: t("dashboard.newTemplate"), sub: t("dashboard.createMessageTemplate"), href: "/templates", tone: "bg-emerald-50 text-emerald-600" },
    { icon: BookOpen, label: "Template Library", sub: "Pre-approved by Meta", href: "/template-library", tone: "bg-teal-50 text-teal-600" },
    { icon: Zap, label: t("dashboard.buildFlow"), sub: t("dashboard.createAutomation"), href: "/automation", tone: "bg-[var(--brand-100)] text-[var(--brand)]" },
    { icon: Workflow, label: "WhatsApp Flows", sub: "Forms inside chat", href: "/whatsapp-flows", tone: "bg-violet-50 text-violet-600" },
    { icon: ShoppingBag, label: "WhatsApp Store", sub: "Sell inside the chat", href: "/store", tone: "bg-sky-50 text-sky-600" },
    { icon: Plug, label: "Integrations", sub: "Shopify, Sheets, CRM", href: "/app-integrations", tone: "bg-slate-100 text-slate-700" },
    { icon: Sparkles, label: "Template with AI", sub: "Describe, AI writes it", href: "/templates", tone: "bg-fuchsia-50 text-fuchsia-600" },
  ];

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        action={{ label: t("dashboard.newCampaign"), onClick: () => setLocation("/campaigns") }}
      />

      <main className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Account strip */}
        <Card className="overflow-hidden rounded-2xl border-0 bg-gradient-to-r from-[var(--brand)] to-[color-mix(in_srgb,var(--brand)_70%,#0b3d2e)] text-white">
          <CardContent className="flex flex-col gap-5 p-5 sm:p-6 sm:pt-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                <MessageSquare className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-white/80">Hi {user?.firstName || user?.username || "there"} 👋</p>
                <p className="truncate text-lg font-semibold">
                  {activeChannel ? `${activeChannel.name} · ${maskedPhone}` : t("dashboard.noChannelSelected")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-300" : "bg-red-300"}`} />
                {connected ? t("dashboard.connected") : activeChannel ? t("dashboard.warning") : t("dashboard.noChannel")}
              </span>
              {quality && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                  <ShieldCheck className="h-3.5 w-3.5" /> Quality: {quality}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                Today {nf(todaySent)} / {unlimited ? t("dashboard.unlimited") : dailyLimit ? nf(dailyLimit) : t("dashboard.unconfirmed")}
              </span>
              <Button size="sm" variant="secondary" className="ml-1 bg-white text-[var(--brand)] hover:bg-white/90" onClick={() => setLocation("/account-health")}>
                Account health <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 lg:gap-6">
          <Kpi
            label={t("dashboard.dashboardStates.Total_Contacts")}
            value={nf(s.totalContacts)}
            icon={<Users className="h-5 w-5" />}
            tone="bg-blue-50 text-blue-600 dark:bg-blue-950/40"
            foot={<Trend cur={s.weekContacts || 0} prev={s.lastWeekContacts || 0} suffix={t("dashboard.vsLastWeek")} />}
          />
          <Kpi
            label={t("dashboard.totalMessagesSent")}
            value={nf(s.messagesSent || outbound)}
            icon={<Send className="h-5 w-5" />}
            tone="bg-orange-50 text-orange-600 dark:bg-orange-950/40"
            foot={<Trend cur={s.thisMonthMessages || 0} prev={s.lastMonthMessages || 0} suffix={t("dashboard.vsLastMonth")} />}
          />
          <Kpi
            label={t("dashboard.deliveryRate")}
            value={`${deliveryRate.toFixed(1)}%`}
            icon={<CheckCheck className="h-5 w-5" />}
            tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40"
            foot={
              <div className="space-y-1.5">
                <Meter value={deliveryRate} color="#1baf7a" />
                <span>{nf(s.messagesDelivered)} {t("dashboard.of")} {nf(outbound)} · <span className="text-red-600">{nf(s.messagesFailed)} {t("dashboard.failed").toLowerCase()}</span></span>
              </div>
            }
          />
          <Kpi
            label={t("dashboard.readRate")}
            value={`${readRate.toFixed(1)}%`}
            icon={<Eye className="h-5 w-5" />}
            tone="bg-violet-50 text-violet-600 dark:bg-violet-950/40"
            foot={
              <div className="space-y-1.5">
                <Meter value={readRate} color="#6250d6" />
                <span>{nf(s.messagesRead)} {t("dashboard.of")} {nf(outbound)} {t("dashboard.messages")}</span>
              </div>
            }
          />
        </div>

        {/* Meta bill + side summary */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2"><MetaBillCard /></div>
          <Card className="rounded-2xl">
            <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">At a glance</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                { label: t("dashboard.campaigns"), value: s.totalCampaigns, icon: Megaphone, tone: "bg-pink-50 text-pink-600 dark:bg-pink-950/40", href: "/campaigns" },
                { label: t("dashboard.templates"), value: s.totalTemplates, icon: FileText, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40", href: "/templates" },
                { label: t("dashboard.today"), value: todaySent, icon: MessageSquare, tone: "bg-amber-50 text-amber-600 dark:bg-amber-950/40", href: "/inbox" },
                { label: t("dashboard.failed"), value: s.messagesFailed, icon: XCircle, tone: "bg-red-50 text-red-600 dark:bg-red-950/40", href: "/analytics" },
              ].map((m) => (
                <button key={m.label} onClick={() => setLocation(m.href)} className="flex flex-col gap-3 rounded-xl border bg-background p-4 text-left transition-colors hover:border-[var(--brand)]/40">
                  <span className={`w-fit rounded-lg p-2 ${m.tone}`}><m.icon className="h-4 w-4" /></span>
                  <span>
                    <span className="block text-2xl font-bold tabular-nums text-foreground">{nf(m.value)}</span>
                    <span className="block text-xs text-muted-foreground">{m.label}</span>
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Chart */}
        {chartCard}

        {/* Quick actions + connection */}
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          <Card className="rounded-2xl xl:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">{t("dashboard.quickActions")}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {actions.map((a) => (
                  <button
                    key={a.href}
                    onClick={() => setLocation(a.href)}
                    className="group flex items-center gap-3 rounded-xl border bg-background p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--brand)]/40 hover:shadow-sm"
                  >
                    <span className={`rounded-lg p-2.5 ${a.tone}`}><a.icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{a.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{a.sub}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="pb-2"><CardTitle className="text-base sm:text-base">{t("dashboard.apiStatusConnection")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Row label={t("dashboard.whatsAppCloudAPI")} value={
                <span className={`inline-flex items-center gap-1.5 font-medium ${connected ? "text-emerald-600" : "text-red-600"}`}>
                  <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 pulse-gentle" : "bg-red-500"}`} />
                  {connected ? t("dashboard.connected") : activeChannel ? t("dashboard.warning") : t("dashboard.noChannel")}
                </span>
              } />
              <Row label="Quality rating" value={<span className={`rounded-md px-2 py-0.5 text-xs font-medium ${qualityTone}`}>{quality || "N/A"}</span>} />
              <Row label="Display name" value={<span className="text-sm font-medium">{health.name_status || "N/A"}</span>} />
              <div className="rounded-xl bg-muted/60 p-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("dashboard.dailyMessageLimit")}</span>
                  <span className="font-medium tabular-nums">
                    {nf(todaySent)} / {unlimited ? t("dashboard.unlimited") : dailyLimit ? nf(dailyLimit) : t("dashboard.unconfirmed")}
                  </span>
                </div>
                {dailyLimit != null && <Meter value={pct(todaySent, dailyLimit)} color="#eda100" />}
                {!dailyLimit && !unlimited && <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.runChannelHealthCheck")}</p>}
              </div>
              {activeChannel?.lastHealthCheck && (
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.lastChecked")} {formatDistanceToNow(new Date(activeChannel.lastHealthCheck), { addSuffix: true })}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-3 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </div>
  );
}
