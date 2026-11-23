/**
 * Super admin — customers, subscriptions, connected WABAs/numbers and Meta
 * account health. No payment-card data is ever available here.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { EmptyBlock, ErrorBlock, HealthBadge, fmtDate, getJson, qs } from "@/components/meta-billing/shared";

const pretty = (v?: string | null) => (v ? v.replace(/_/g, " ").toLowerCase() : "—");

export default function AdminWhatsAppAccountsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [health, setHealth] = useState("all");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const key = ["/api/admin/whatsapp/accounts", q, health, page];
  const { data, isLoading, isError, error } = useQuery<any>({
    queryKey: key,
    queryFn: () => getJson(`/api/admin/whatsapp/accounts${qs({ search: q, health, page, pageSize: 20 })}`),
  });

  const refresh = async (channelId: string) => {
    setBusy(channelId);
    try {
      await apiRequest("POST", `/api/admin/whatsapp/accounts/${channelId}/refresh-health`);
      await qc.invalidateQueries({ queryKey: ["/api/admin/whatsapp/accounts"] });
    } catch (e: any) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Customer WhatsApp Accounts" subtitle="Subscriptions, connected WABAs and Meta account health" />
      <main className="space-y-4 p-4 sm:p-6">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setQ(search); setPage(1); }}>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Search customers" placeholder="Search name or email" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={health} onValueChange={(v) => { setHealth(v); setPage(1); }}>
            <SelectTrigger className="w-48" aria-label="Health filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All health states</SelectItem>
              <SelectItem value="healthy">Healthy</SelectItem>
              <SelectItem value="action_required">Action Required</SelectItem>
              <SelectItem value="restricted">Restricted</SelectItem>
              <SelectItem value="blocked">Messaging Blocked</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit">Search</Button>
        </form>

        {isLoading ? <div className="h-64 animate-pulse rounded-xl bg-muted" /> : isError ? <ErrorBlock error={error} /> : (data?.rows ?? []).length === 0 ? <EmptyBlock title="No customers found" /> : (
          <div className="space-y-3">
            {data.rows.map((c: any) => (
              <Card key={c.id} className="border-border shadow-none">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{[c.firstName, c.lastName].filter(Boolean).join(" ") || c.username}</p>
                      <p className="text-xs text-muted-foreground">{c.email} · joined {fmtDate(c.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {c.subscription ? (
                        <>
                          <Badge variant="outline">{c.subscription.planName ?? "Plan"}</Badge>
                          <Badge variant="outline" className="capitalize">{c.subscription.status}</Badge>
                          <span className="text-muted-foreground">{c.subscription.renewalDate ? `renews ${fmtDate(c.subscription.renewalDate)}` : `ends ${fmtDate(c.subscription.endDate)}`}</span>
                        </>
                      ) : <Badge variant="outline">No subscription</Badge>}
                      <span className="text-muted-foreground">· {c.wabaCount} WABA · {c.channels.length} number(s)</span>
                    </div>
                  </div>
                  {c.channels.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Number</th><th className="py-2 pr-3 font-medium">Health</th>
                          <th className="py-2 pr-3 font-medium">Business verif.</th><th className="py-2 pr-3 font-medium">WABA status</th>
                          <th className="py-2 pr-3 font-medium">Phone</th><th className="py-2 pr-3 font-medium">Display name</th>
                          <th className="py-2 pr-3 font-medium">Quality · limit</th><th className="py-2 pr-3 font-medium">Top issue</th><th /></tr></thead>
                        <tbody>
                          {c.channels.map((ch: any) => (
                            <tr key={ch.id} className="border-b border-border/60 last:border-0 align-top">
                              <td className="py-2 pr-3">{ch.name}<br /><span className="text-xs text-muted-foreground">{ch.phoneNumber} · WABA {ch.wabaId ?? "—"}</span></td>
                              <td className="py-2 pr-3"><HealthBadge status={ch.health?.overallStatus} /><br /><span className="text-[11px] text-muted-foreground">{ch.health?.checkedAt ? fmtDate(ch.health.checkedAt, true) : "never checked"}</span></td>
                              <td className="py-2 pr-3 capitalize">{pretty(ch.health?.businessVerificationStatus)}</td>
                              <td className="py-2 pr-3 capitalize">{pretty(ch.health?.wabaReviewStatus)}</td>
                              <td className="py-2 pr-3 capitalize">{pretty(ch.health?.phoneStatus)}</td>
                              <td className="py-2 pr-3 capitalize">{pretty(ch.health?.nameStatus)}</td>
                              <td className="py-2 pr-3 capitalize">{pretty(ch.health?.qualityRating)} · {ch.health?.messagingLimit?.replace("TIER_", "") ?? "—"}</td>
                              <td className="py-2 pr-3 text-xs">{ch.health?.topIssue ? <>{ch.health.topIssue.title}{ch.health.topIssue.code ? <span className="ml-1 font-mono text-muted-foreground">#{ch.health.topIssue.code}</span> : null}</> : "—"}</td>
                              <td className="py-2 text-right">
                                <Button size="sm" variant="ghost" disabled={busy === ch.id} onClick={() => refresh(ch.id)} aria-label="Refresh health">
                                  <RefreshCw className={`h-4 w-4 ${busy === ch.id ? "animate-spin" : ""}`} />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Page {data.pagination.page} of {Math.max(1, data.pagination.totalPages)} · {data.pagination.total} customers</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
