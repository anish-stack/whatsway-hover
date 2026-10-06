import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Handshake,
  Users,
  Wallet,
  Copy,
  Check,
  Send,
  UserPlus,
  Plus,
  Minus,
  KeyRound,
  Ban,
  Play,
  X,
  Search,
  LifeBuoy,
  MessageSquare,
} from "lucide-react";
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

const STATUS_VARIANT: Record<string, any> = {
  active: "success",
  inactive: "warning",
  banned: "destructive",
};

export default function ResellerPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<
    "customers" | "support" | "earnings" | "wallet"
  >("customers");
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [creditForm, setCreditForm] = useState({ amount: "", note: "" });
  const [payoutAmount, setPayoutAmount] = useState("");
  const [newCustomer, setNewCustomer] = useState({
    username: "",
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    openingCredit: "",
  });

  const {
    data: overview,
    isLoading,
    isError,
    error,
  } = useQuery<any>({
    queryKey: ["/api/reseller/overview"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/reseller/overview");
      const json = await res.json();
      return json.data;
    },
    retry: false,
  });

  const { data: customers } = useQuery<any[]>({
    queryKey: ["/api/reseller/customers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/reseller/customers");
      const json = await res.json();
      return json.data || [];
    },
    enabled: !!overview,
  });

  const { data: detail } = useQuery<any>({
    queryKey: ["/api/reseller/customers", selected],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reseller/customers/${selected}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!selected,
  });

  const { data: commissions } = useQuery<any>({
    queryKey: ["/api/resellers/me/commissions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/resellers/me/commissions?limit=50");
      return res.json();
    },
    enabled: !!overview && tab === "earnings",
  });

  const { data: payouts } = useQuery<any[]>({
    queryKey: ["/api/resellers/me/payouts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/resellers/me/payouts");
      const json = await res.json();
      return json.data || [];
    },
    enabled: !!overview && tab === "earnings",
  });

  const { data: myLedger } = useQuery<any>({
    queryKey: ["/api/reseller/wallet/transactions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/reseller/wallet/transactions?limit=50");
      return res.json();
    },
    enabled: !!overview && tab === "wallet",
  });

  // Tickets raised by this partner's customers. The server stamps
  // reseller_id on creation, so this list is already scoped.
  const { data: tickets } = useQuery<any>({
    queryKey: ["/api/tickets", "reseller"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/tickets?limit=50");
      return res.json();
    },
    enabled: !!overview && tab === "support",
  });

  const { data: ticketDetail } = useQuery<any>({
    queryKey: ["/api/tickets", openTicket],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/tickets/${openTicket}`);
      return res.json();
    },
    enabled: !!openTicket,
  });

  const sendReply = async () => {
    if (!openTicket || !reply.trim()) return;
    try {
      await apiRequest("POST", `/api/tickets/${openTicket}/messages`, {
        message: reply.trim(),
      });
      setReply("");
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", openTicket] });
      toast({ title: "Reply sent" });
    } catch (err: any) {
      toast({ title: "Could not reply", description: err.message, variant: "destructive" });
    }
  };

  const setTicketStatus = async (status: string) => {
    if (!openTicket) return;
    try {
      await apiRequest("PUT", `/api/tickets/${openTicket}`, { status });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", openTicket] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", "reseller"] });
      toast({ title: `Ticket ${status}` });
    } catch (err: any) {
      toast({ title: "Could not update", description: err.message, variant: "destructive" });
    }
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/reseller/overview"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reseller/customers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reseller/wallet/transactions"] });
  };

  const createCustomer = async () => {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/reseller/customers", {
        ...newCustomer,
        openingCredit: Number(newCustomer.openingCredit) || 0,
      });
      toast({
        title: "Customer created",
        description: "They can log in with the credentials you set.",
      });
      setNewCustomer({
        username: "",
        email: "",
        password: "",
        firstName: "",
        lastName: "",
        openingCredit: "",
      });
      setShowCreate(false);
      refresh();
    } catch (err: any) {
      toast({ title: "Could not create", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const moveCredit = async (direction: "credit" | "reclaim") => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiRequest("POST", `/api/reseller/customers/${selected}/${direction}`, {
        amount: Number(creditForm.amount),
        note: creditForm.note || undefined,
      });
      toast({
        title: direction === "credit" ? "Credit added" : "Credit reclaimed",
        description:
          direction === "credit"
            ? "It came out of your partner wallet."
            : "It went back into your partner wallet.",
      });
      setCreditForm({ amount: "", note: "" });
      refresh();
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/customers", selected] });
    } catch (err: any) {
      toast({ title: "Transfer failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: string) => {
    if (!selected) return;
    try {
      await apiRequest("PUT", `/api/reseller/customers/${selected}/status`, { status });
      toast({ title: `Account ${status}` });
      refresh();
      queryClient.invalidateQueries({ queryKey: ["/api/reseller/customers", selected] });
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  };

  const resetPassword = async () => {
    if (!selected) return;
    const password = window.prompt("New password for this customer (min 8 characters)");
    if (!password) return;
    try {
      await apiRequest("POST", `/api/reseller/customers/${selected}/password`, { password });
      toast({
        title: "Password reset",
        description: "Share the new password with your customer.",
      });
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    }
  };

  const requestPayout = async () => {
    try {
      await apiRequest("POST", "/api/resellers/me/payouts", {
        amount: Number(payoutAmount),
      });
      toast({ title: "Payout requested" });
      setPayoutAmount("");
      queryClient.invalidateQueries({ queryKey: ["/api/resellers/me/payouts"] });
      refresh();
    } catch (err: any) {
      toast({ title: "Request failed", description: err.message, variant: "destructive" });
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(
      `${window.location.origin}/signup?ref=${overview.reseller.referralCode}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <>
        <Header title="Partner panel" subtitle="Your customers, credit and earnings" />
        <div className="p-6">
          <Loading />
        </div>
      </>
    );
  }

  if (isError || !overview) {
    return (
      <>
        <Header title="Partner panel" subtitle="Reseller programme" />
        <div className="p-6">
          <Card>
            <CardContent className="p-10 text-center">
              <Handshake className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Partner panel not available</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                {(error as any)?.message ||
                  "Your account is not registered as a reseller. Ask the platform team to set it up."}
              </p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const wallet = overview.wallet || {};
  const currency = wallet.currency || "INR";
  const filtered = (customers || []).filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (c.username || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <Header title="Partner panel" subtitle="Your customers, credit and earnings" />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="stat-label">Your credit balance</p>
              <div className="stat-figure mt-1 text-primary">
                {money(wallet.balance, currency)}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Credit you give customers comes out of this.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="stat-label">Credit with customers</p>
              <div className="stat-figure mt-1">
                {money(overview.creditIssued?.net, currency)}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Issued {money(overview.creditIssued?.issued, currency)}, reclaimed{" "}
                {money(overview.creditIssued?.reclaimed, currency)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="stat-label">Customers</p>
              <div className="stat-figure mt-1">{overview.customers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="stat-label">Commission rate</p>
              <div className="stat-figure mt-1">{overview.reseller.commissionPercent}%</div>
              <p className="mt-2 text-xs text-muted-foreground">
                Earned {money(overview.reseller.totalEarned, currency)} so far.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <span className="text-sm font-medium">Referral link</span>
            <Input
              readOnly
              className="max-w-md"
              value={`${window.location.origin}/signup?ref=${overview.reseller.referralCode}`}
            />
            <Button variant="outline" size="sm" onClick={copyLink} className="gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Anyone signing up through this is attached to you automatically.
            </span>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {(["customers", "support", "earnings", "wallet"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {t === "wallet" ? "My wallet" : t}
            </button>
          ))}
        </div>

        {tab === "customers" && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Your customers
                  </span>
                  <Button size="sm" className="gap-2" onClick={() => setShowCreate(!showCreate)}>
                    <UserPlus className="h-4 w-4" />
                    New customer
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {showCreate && (
                  <div className="mb-5 rounded-2xl border border-border p-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <Input
                        placeholder="Username"
                        value={newCustomer.username}
                        onChange={(e) =>
                          setNewCustomer({ ...newCustomer, username: e.target.value })
                        }
                      />
                      <Input
                        type="email"
                        placeholder="Email"
                        value={newCustomer.email}
                        onChange={(e) =>
                          setNewCustomer({ ...newCustomer, email: e.target.value })
                        }
                      />
                      <Input
                        type="text"
                        placeholder="Password (min 8 chars)"
                        value={newCustomer.password}
                        onChange={(e) =>
                          setNewCustomer({ ...newCustomer, password: e.target.value })
                        }
                      />
                      <Input
                        placeholder="First name"
                        value={newCustomer.firstName}
                        onChange={(e) =>
                          setNewCustomer({ ...newCustomer, firstName: e.target.value })
                        }
                      />
                      <Input
                        placeholder="Last name"
                        value={newCustomer.lastName}
                        onChange={(e) =>
                          setNewCustomer({ ...newCustomer, lastName: e.target.value })
                        }
                      />
                      <Input
                        type="number"
                        placeholder="Opening credit (optional)"
                        value={newCustomer.openingCredit}
                        onChange={(e) =>
                          setNewCustomer({ ...newCustomer, openingCredit: e.target.value })
                        }
                      />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button onClick={createCustomer} disabled={busy}>
                        {busy ? "Creating…" : "Create account"}
                      </Button>
                      <Button variant="ghost" onClick={() => setShowCreate(false)}>
                        Cancel
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Opening credit is taken from your own balance, so keep enough in the
                      partner wallet first.
                    </p>
                  </div>
                )}

                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search by username or email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {!filtered.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No customers yet.
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
                          <th className="py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c) => (
                          <tr key={c.linkId} className="border-b border-border/60">
                            <td className="py-2.5">
                              <div className="font-medium">
                                {[c.firstName, c.lastName].filter(Boolean).join(" ") ||
                                  c.username}
                              </div>
                              <div className="text-xs text-muted-foreground">{c.email}</div>
                            </td>
                            <td className="py-2.5">
                              <Badge variant={STATUS_VARIANT[c.status] || "secondary"}>
                                {c.status}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-right font-semibold">
                              {money(c.balance, c.currency || currency)}
                            </td>
                            <td className="py-2.5 text-muted-foreground">
                              {c.attachedAt
                                ? new Date(c.attachedAt).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="py-2.5 text-right">
                              <Button
                                size="sm"
                                variant={selected === c.customerUserId ? "default" : "outline"}
                                onClick={() =>
                                  setSelected(
                                    selected === c.customerUserId ? null : c.customerUserId
                                  )
                                }
                              >
                                Manage
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

            {selected && detail && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
                    <span>
                      {detail.user?.username}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {detail.user?.email}
                      </span>
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-4">
                    <div>
                      <div className="stat-label">Balance</div>
                      <div className="text-xl font-bold text-primary">
                        {money(detail.wallet?.balance, detail.wallet?.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">Sent this month</div>
                      <div className="text-xl font-bold">{detail.usage?.totals?.sent ?? 0}</div>
                    </div>
                    <div>
                      <div className="stat-label">Spent this month</div>
                      <div className="text-xl font-bold">
                        {money(detail.usage?.totals?.cost, detail.wallet?.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="stat-label">Channels</div>
                      <div className="text-xl font-bold">{detail.channels ?? 0}</div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-border p-4">
                    <p className="text-sm font-semibold">Move credit</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr_auto_auto]">
                      <Input
                        type="number"
                        placeholder="Amount"
                        value={creditForm.amount}
                        onChange={(e) =>
                          setCreditForm({ ...creditForm, amount: e.target.value })
                        }
                      />
                      <Input
                        placeholder="Note (shows on both ledgers)"
                        value={creditForm.note}
                        onChange={(e) => setCreditForm({ ...creditForm, note: e.target.value })}
                      />
                      <Button
                        className="gap-2"
                        disabled={busy}
                        onClick={() => moveCredit("credit")}
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        disabled={busy}
                        onClick={() => moveCredit("reclaim")}
                      >
                        <Minus className="h-4 w-4" />
                        Reclaim
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Your balance: {money(wallet.balance, currency)}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {detail.user?.status !== "active" ? (
                      <Button size="sm" className="gap-2" onClick={() => changeStatus("active")}>
                        <Play className="h-3.5 w-3.5" />
                        Activate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => changeStatus("inactive")}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Suspend
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="gap-2" onClick={resetPassword}>
                      <KeyRound className="h-3.5 w-3.5" />
                      Reset password
                    </Button>
                  </div>

                  {!!detail.ledger?.length && (
                    <div className="mt-6">
                      <p className="mb-2 text-sm font-semibold">Recent billing activity</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-left text-muted-foreground">
                              <th className="py-2 font-medium">When</th>
                              <th className="py-2 font-medium">Detail</th>
                              <th className="py-2 text-right font-medium">Amount</th>
                              <th className="py-2 text-right font-medium">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.ledger.map((row: any) => (
                              <tr key={row.id} className="border-b border-border/60">
                                <td className="py-2 whitespace-nowrap text-muted-foreground">
                                  {new Date(row.createdAt).toLocaleString()}
                                </td>
                                <td className="py-2">{row.description || row.category}</td>
                                <td
                                  className={`py-2 text-right font-semibold ${
                                    row.type === "debit"
                                      ? "text-[var(--bad)]"
                                      : "text-[var(--ok)]"
                                  }`}
                                >
                                  {row.type === "debit" ? "−" : "+"}
                                  {money(row.amount, row.currency)}
                                </td>
                                <td className="py-2 text-right text-muted-foreground">
                                  {money(row.balanceAfter, row.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {tab === "support" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <LifeBuoy className="h-4 w-4 text-primary" />
                  Customer tickets
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!tickets?.tickets?.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No tickets from your customers.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tickets.tickets.map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => setOpenTicket(openTicket === t.id ? null : t.id)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                          openTicket === t.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{t.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {t.creatorName} · {new Date(t.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge
                            variant={
                              t.status === "open"
                                ? "warning"
                                : t.status === "closed" || t.status === "resolved"
                                ? "success"
                                : "secondary"
                            }
                          >
                            {t.status}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  {ticketDetail?.ticket?.title || "Select a ticket"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!ticketDetail?.ticket ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Pick a ticket on the left to read and answer it.
                  </p>
                ) : (
                  <>
                    <p className="rounded-xl bg-muted p-3 text-sm">
                      {ticketDetail.ticket.description}
                    </p>

                    <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                      {(ticketDetail.messages || []).map((m: any) => (
                        <div
                          key={m.id}
                          className="rounded-xl border border-border px-3.5 py-2.5"
                        >
                          <p className="text-xs font-semibold text-muted-foreground">
                            {m.senderName || m.senderType} ·{" "}
                            {new Date(m.createdAt).toLocaleString()}
                          </p>
                          <p className="mt-1 text-sm">{m.message}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Input
                        placeholder="Write a reply…"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") sendReply();
                        }}
                      />
                      <Button className="shrink-0 gap-2" onClick={sendReply}>
                        <Send className="h-4 w-4" />
                        Send
                      </Button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTicketStatus("in_progress")}
                      >
                        In progress
                      </Button>
                      <Button size="sm" onClick={() => setTicketStatus("resolved")}>
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTicketStatus("closed")}
                      >
                        Close
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "earnings" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Commissions</CardTitle>
              </CardHeader>
              <CardContent>
                {!commissions?.rows?.length ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nothing earned yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {commissions.rows.map((row: any) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold">
                            {money(row.commissionAmount, row.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {Number(row.commissionPercent)}% of{" "}
                            {money(row.baseAmount, row.currency)} ·{" "}
                            {new Date(row.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={row.status === "paid" ? "success" : "warning"}>
                          {row.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4 text-primary" />
                  Payouts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                  />
                  <Button className="shrink-0 gap-2" onClick={requestPayout}>
                    <Send className="h-4 w-4" />
                    Request
                  </Button>
                </div>

                <div className="mt-4 space-y-2">
                  {!payouts?.length ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No payout requests yet.
                    </p>
                  ) : (
                    payouts.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold">{money(p.amount, p.currency)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </p>
                        </div>
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
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === "wallet" && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Partner wallet ledger</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Top up this wallet from the{" "}
                <a href="/wallet" className="text-primary hover:underline">
                  Wallet
                </a>{" "}
                page, then hand credit to your customers from the Customers tab.
              </p>
              {!myLedger?.rows?.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No activity yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 font-medium">When</th>
                        <th className="py-2 font-medium">Detail</th>
                        <th className="py-2 text-right font-medium">Amount</th>
                        <th className="py-2 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myLedger.rows.map((row: any) => (
                        <tr key={row.id} className="border-b border-border/60">
                          <td className="py-2 whitespace-nowrap text-muted-foreground">
                            {new Date(row.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2">{row.description || row.category}</td>
                          <td
                            className={`py-2 text-right font-semibold ${
                              row.type === "debit" ? "text-[var(--bad)]" : "text-[var(--ok)]"
                            }`}
                          >
                            {row.type === "debit" ? "−" : "+"}
                            {money(row.amount, row.currency)}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {money(row.balanceAfter, row.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
