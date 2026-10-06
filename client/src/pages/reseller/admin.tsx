import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, UserPlus, Check, X, IndianRupee } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/ui/loading";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

function money(value: number | string, currency = "INR") {
  return `${currency} ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ResellerAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    userId: "",
    companyName: "",
    contactPhone: "",
    commissionPercent: "10",
    activateNow: true,
  });
  const [attach, setAttach] = useState<{ resellerId: string; customerUserId: string }>({
    resellerId: "",
    customerUserId: "",
  });
  const [busy, setBusy] = useState(false);
  const [openReseller, setOpenReseller] = useState<string | null>(null);
  const [drillTab, setDrillTab] = useState<"sales" | "customers">("sales");

  const { data: resellers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/resellers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/resellers");
      const json = await res.json();
      return json.data || [];
    },
  });

  // Platform oversight: what this partner sold, and who their customers are.
  const { data: sales } = useQuery<any>({
    queryKey: ["/api/resellers", openReseller, "sales"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/resellers/${openReseller}/sales`);
      return res.json();
    },
    enabled: !!openReseller && drillTab === "sales",
  });

  const { data: theirCustomers } = useQuery<any[]>({
    queryKey: ["/api/resellers", openReseller, "customers"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/resellers/${openReseller}/customers/detail`
      );
      const json = await res.json();
      return json.data || [];
    },
    enabled: !!openReseller && drillTab === "customers",
  });

  const { data: payouts } = useQuery<any[]>({
    queryKey: ["/api/resellers/payouts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/resellers/payouts");
      const json = await res.json();
      return json.data || [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/resellers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/resellers/payouts"] });
  };

  const register = async () => {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/resellers", {
        userId: form.userId,
        companyName: form.companyName || undefined,
        contactPhone: form.contactPhone || undefined,
        commissionPercent: Number(form.commissionPercent),
        status: form.activateNow ? "active" : "pending",
      });
      toast({
        title: "Partner registered",
        description: `Commission fixed at ${form.commissionPercent}%.`,
      });
      setForm({ ...form, userId: "", companyName: "", contactPhone: "" });
      refresh();
    } catch (error: any) {
      toast({ title: "Could not register", description: error.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      await apiRequest("PUT", `/api/resellers/${id}`, { status });
      toast({ title: `Partner ${status}` });
      refresh();
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  const setRate = async (id: string, commissionPercent: string) => {
    try {
      await apiRequest("PUT", `/api/resellers/${id}`, {
        commissionPercent: Number(commissionPercent),
      });
      toast({
        title: "Rate updated",
        description: "Existing customers keep the rate they were attached at.",
      });
      refresh();
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  const attachCustomer = async () => {
    try {
      await apiRequest("POST", `/api/resellers/${attach.resellerId}/customers`, {
        customerUserId: attach.customerUserId,
      });
      toast({ title: "Customer attached" });
      setAttach({ resellerId: "", customerUserId: "" });
      refresh();
    } catch (error: any) {
      toast({ title: "Could not attach", description: error.message, variant: "destructive" });
    }
  };

  const settlePayout = async (payoutId: string, status: string) => {
    try {
      await apiRequest("PUT", `/api/resellers/payouts/${payoutId}`, { status });
      toast({ title: `Payout ${status}` });
      refresh();
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <>
        <Header title="Resellers" subtitle="Partners, commissions and payouts" />
        <div className="p-6">
          <Loading />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Resellers" subtitle="Partners, commissions and payouts" />

      <div className="space-y-6 p-4 sm:p-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-primary" />
              Register a partner
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">User ID</label>
                <Input
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  placeholder="Existing account to convert"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Company</label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Phone</label>
                <Input
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Commission %</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.commissionPercent}
                  onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })}
                />
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.activateNow}
                onChange={(e) => setForm({ ...form, activateNow: e.target.checked })}
              />
              Activate immediately
            </label>

            <Button className="mt-4 gap-2" onClick={register} disabled={busy || !form.userId}>
              <Handshake className="h-4 w-4" />
              {busy ? "Registering…" : "Register partner"}
            </Button>

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              The commission percent is snapshotted onto every customer the partner brings
              in, so changing it later never rewrites past earnings.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Partners</CardTitle>
          </CardHeader>
          <CardContent>
            {!resellers?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No partners registered yet.
              </p>
            ) : (
              <div className="space-y-3">
                {resellers.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{r.companyName || "Unnamed partner"}</p>
                        <p className="text-xs text-muted-foreground">
                          Code <span className="font-mono">{r.referralCode}</span> ·{" "}
                          {r.stats?.customers ?? 0} customers
                        </p>
                      </div>
                      <Badge
                        variant={
                          r.status === "active"
                            ? "success"
                            : r.status === "suspended" || r.status === "rejected"
                            ? "destructive"
                            : "warning"
                        }
                      >
                        {r.status}
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <div className="stat-label">Rate</div>
                        <div className="font-semibold">{Number(r.commissionPercent)}%</div>
                      </div>
                      <div>
                        <div className="stat-label">Earned</div>
                        <div className="font-semibold">
                          {money(r.stats?.totalEarned, r.payoutCurrency)}
                        </div>
                      </div>
                      <div>
                        <div className="stat-label">Paid</div>
                        <div className="font-semibold">
                          {money(r.stats?.totalPaid, r.payoutCurrency)}
                        </div>
                      </div>
                      <div>
                        <div className="stat-label">Payable</div>
                        <div className="font-semibold text-primary">
                          {money(r.stats?.payable, r.payoutCurrency)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {r.status !== "active" && (
                        <Button size="sm" onClick={() => setStatus(r.id, "active")}>
                          Activate
                        </Button>
                      )}
                      {r.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus(r.id, "suspended")}
                        >
                          Suspend
                        </Button>
                      )}
                      <div className="flex items-center gap-2">
                        <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          className="h-8 w-24"
                          type="number"
                          defaultValue={Number(r.commissionPercent)}
                          onBlur={(e) => {
                            if (Number(e.target.value) !== Number(r.commissionPercent)) {
                              setRate(r.id, e.target.value);
                            }
                          }}
                        />
                        <span className="text-xs text-muted-foreground">% new customers</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAttach({ ...attach, resellerId: r.id })}
                      >
                        Attach customer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpenReseller(openReseller === r.id ? null : r.id)}
                      >
                        {openReseller === r.id ? "Hide details" : "Sales & customers"}
                      </Button>
                    </div>

                    {openReseller === r.id && (
                      <div className="mt-4 rounded-2xl border border-border p-4">
                        <div className="flex gap-2">
                          {(["sales", "customers"] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => setDrillTab(t)}
                              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                                drillTab === t
                                  ? "bg-primary text-primary-foreground"
                                  : "border border-border text-muted-foreground"
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>

                        {drillTab === "sales" && (
                          <div className="mt-4">
                            {!sales?.rows?.length ? (
                              <p className="py-6 text-center text-sm text-muted-foreground">
                                No sales recorded for this partner yet.
                              </p>
                            ) : (
                              <>
                                <div className="mb-3 grid grid-cols-3 gap-4">
                                  <div>
                                    <div className="stat-label">Gross sold</div>
                                    <div className="font-semibold">
                                      {money(sales.totals.gross, r.payoutCurrency)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="stat-label">Partner commission</div>
                                    <div className="font-semibold text-primary">
                                      {money(sales.totals.commission, r.payoutCurrency)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="stat-label">Platform share</div>
                                    <div className="font-semibold">
                                      {money(sales.totals.platformShare, r.payoutCurrency)}
                                    </div>
                                  </div>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-border text-left text-muted-foreground">
                                        <th className="py-2 font-medium">When</th>
                                        <th className="py-2 font-medium">Customer</th>
                                        <th className="py-2 text-right font-medium">Paid</th>
                                        <th className="py-2 text-right font-medium">
                                          Commission
                                        </th>
                                        <th className="py-2 font-medium">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sales.rows.map((row: any) => (
                                        <tr key={row.id} className="border-b border-border/60">
                                          <td className="py-2 whitespace-nowrap text-muted-foreground">
                                            {new Date(row.createdAt).toLocaleDateString()}
                                          </td>
                                          <td className="py-2">
                                            {row.customerUsername}
                                            <div className="text-xs text-muted-foreground">
                                              {row.customerEmail}
                                            </div>
                                          </td>
                                          <td className="py-2 text-right">
                                            {money(row.baseAmount, row.currency)}
                                          </td>
                                          <td className="py-2 text-right font-semibold text-primary">
                                            {money(row.commissionAmount, row.currency)}
                                          </td>
                                          <td className="py-2">
                                            <Badge
                                              variant={
                                                row.status === "paid" ? "success" : "warning"
                                              }
                                            >
                                              {row.status}
                                            </Badge>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {drillTab === "customers" && (
                          <div className="mt-4">
                            {!theirCustomers?.length ? (
                              <p className="py-6 text-center text-sm text-muted-foreground">
                                This partner has no customers yet.
                              </p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-border text-left text-muted-foreground">
                                      <th className="py-2 font-medium">Customer</th>
                                      <th className="py-2 font-medium">Status</th>
                                      <th className="py-2 text-right font-medium">Balance</th>
                                      <th className="py-2 font-medium">Since</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {theirCustomers.map((c: any) => (
                                      <tr key={c.linkId} className="border-b border-border/60">
                                        <td className="py-2">
                                          {c.username}
                                          <div className="text-xs text-muted-foreground">
                                            {c.email}
                                          </div>
                                        </td>
                                        <td className="py-2">
                                          <Badge
                                            variant={
                                              c.status === "active" ? "success" : "warning"
                                            }
                                          >
                                            {c.status}
                                          </Badge>
                                        </td>
                                        <td className="py-2 text-right font-semibold">
                                          {money(c.balance, c.currency)}
                                        </td>
                                        <td className="py-2 text-muted-foreground">
                                          {c.attachedAt
                                            ? new Date(c.attachedAt).toLocaleDateString()
                                            : "—"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {attach.resellerId === r.id && (
                      <div className="mt-3 flex gap-2">
                        <Input
                          placeholder="Customer user ID"
                          value={attach.customerUserId}
                          onChange={(e) =>
                            setAttach({ ...attach, customerUserId: e.target.value })
                          }
                        />
                        <Button size="sm" onClick={attachCustomer}>
                          Attach
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAttach({ resellerId: "", customerUserId: "" })}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Payout requests</CardTitle>
          </CardHeader>
          <CardContent>
            {!payouts?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No payout requests.
              </p>
            ) : (
              <div className="space-y-2">
                {payouts.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold">{money(p.amount, p.currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleString()}
                        {p.method ? ` · ${p.method}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          p.status === "paid"
                            ? "success"
                            : p.status === "rejected"
                            ? "destructive"
                            : "warning"
                        }
                      >
                        {p.status}
                      </Badge>
                      {p.status === "requested" && (
                        <>
                          <Button
                            size="sm"
                            className="gap-1"
                            onClick={() => settlePayout(p.id, "paid")}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Mark paid
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => settlePayout(p.id, "rejected")}
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
