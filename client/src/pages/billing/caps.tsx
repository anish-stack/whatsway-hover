import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, Plus, Trash2, Activity } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/ui/loading";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";

interface Cap {
  id: string;
  userId: string | null;
  channelId: string | null;
  period: "daily" | "monthly";
  source: string;
  category: string | null;
  limitCount: number;
  isActive: boolean;
  note: string | null;
}

const SOURCES = ["all", "api", "dashboard", "campaign", "automation"];
const CATEGORIES = ["", "marketing", "utility", "authentication", "service"];

export default function CapsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";

  const [form, setForm] = useState({
    userId: "",
    channelId: "",
    period: "daily" as "daily" | "monthly",
    source: "all",
    category: "",
    limitCount: "1000",
    note: "",
  });
  const [saving, setSaving] = useState(false);

  const { data: caps, isLoading } = useQuery<Cap[]>({
    queryKey: ["/api/billing/caps"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/billing/caps");
      const json = await res.json();
      return json.data || [];
    },
  });

  const { data: usageDaily } = useQuery<any>({
    queryKey: ["/api/billing/usage", "daily"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/billing/usage?period=daily");
      const json = await res.json();
      return json.data;
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/billing/caps", {
        userId: form.userId || null,
        channelId: form.channelId || null,
        period: form.period,
        source: form.source,
        category: form.category || null,
        limitCount: Number(form.limitCount),
        note: form.note || null,
      });
      toast({
        title: "Cap saved",
        description: form.userId
          ? "This client now has their own cap."
          : "Saved as the platform default.",
      });
      setForm({ ...form, userId: "", channelId: "", note: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/caps"] });
    } catch (error: any) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await apiRequest("DELETE", `/api/billing/caps/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/billing/caps"] });
      toast({ title: "Cap removed" });
    } catch (error: any) {
      toast({ title: "Could not remove", description: error.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Sending caps" subtitle="Limit how much can go out" />
        <div className="p-6">
          <Loading />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Sending caps" subtitle="Limit how much can go out" />

      <div className="space-y-6 p-4 sm:p-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Sent today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="stat-figure">{usageDaily?.totals?.sent ?? 0}</div>
                <div className="stat-label">Delivered to Meta</div>
              </div>
              <div>
                <div className="stat-figure">{usageDaily?.totals?.failed ?? 0}</div>
                <div className="stat-label">Failed</div>
              </div>
              <div>
                <div className="stat-figure">
                  {Number(usageDaily?.totals?.cost ?? 0).toFixed(2)}
                </div>
                <div className="stat-label">Spent</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {isSuperadmin && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Add or update a cap
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Period</label>
                  <select
                    className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-sm"
                    value={form.period}
                    onChange={(e) => setForm({ ...form, period: e.target.value as any })}
                  >
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Applies to</label>
                  <select
                    className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-sm"
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                  >
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s === "all" ? "All sources" : s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Category</label>
                  <select
                    className="h-10 w-full rounded-xl border border-input bg-background px-3.5 text-sm"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c || "Every category"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Limit (0 = unlimited)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={form.limitCount}
                    onChange={(e) => setForm({ ...form, limitCount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    User ID (blank = platform default)
                  </label>
                  <Input
                    value={form.userId}
                    onChange={(e) => setForm({ ...form, userId: e.target.value })}
                    placeholder="Leave blank for everyone"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Note</label>
                  <Input
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="Why this cap exists"
                  />
                </div>
              </div>

              <Button className="mt-4 gap-2" onClick={save} disabled={saving}>
                <Gauge className="h-4 w-4" />
                {saving ? "Saving…" : "Save cap"}
              </Button>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                A client cap replaces the platform default of the same shape. Hitting a cap
                returns HTTP 429 on the API and stops campaign rows with
                <code className="mx-1 rounded bg-muted px-1">CAP_EXCEEDED</code>
                instead of retrying them.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Active caps</CardTitle>
          </CardHeader>
          <CardContent>
            {!caps?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No caps configured. Sending is unlimited.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 font-medium">Scope</th>
                      <th className="py-2 font-medium">Period</th>
                      <th className="py-2 font-medium">Source</th>
                      <th className="py-2 font-medium">Category</th>
                      <th className="py-2 text-right font-medium">Limit</th>
                      {isSuperadmin && <th className="py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {caps.map((cap) => (
                      <tr key={cap.id} className="border-b border-border/60">
                        <td className="py-2.5">
                          {cap.userId ? (
                            <Badge variant="flare">Client</Badge>
                          ) : (
                            <Badge variant="secondary">Platform default</Badge>
                          )}
                          {cap.note && (
                            <div className="mt-1 text-xs text-muted-foreground">{cap.note}</div>
                          )}
                        </td>
                        <td className="py-2.5 capitalize">{cap.period}</td>
                        <td className="py-2.5 capitalize text-muted-foreground">
                          {cap.source === "all" ? "All" : cap.source}
                        </td>
                        <td className="py-2.5 capitalize text-muted-foreground">
                          {cap.category || "All"}
                        </td>
                        <td className="py-2.5 text-right font-semibold">
                          {cap.limitCount === 0 ? "Unlimited" : cap.limitCount.toLocaleString()}
                        </td>
                        {isSuperadmin && (
                          <td className="py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(cap.id)}
                              aria-label="Remove cap"
                            >
                              <Trash2 className="h-4 w-4 text-[var(--bad)]" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
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
