import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiRequestFormData } from "@/lib/queryClient";
import { ExternalLink, Loader2, Megaphone, Pencil, Plus, Sparkles, TrendingUp, Unplug, Upload, Wand2 } from "lucide-react";

const j = async (method: string, url: string, body?: any) => (await apiRequest(method, url, body)).json();
const PRESETS: Array<[string, string]> = [["today", "Today"], ["yesterday", "Yesterday"], ["last_7d", "Last 7 days"], ["last_14d", "Last 14 days"], ["last_30d", "Last 30 days"], ["this_month", "This month"], ["last_month", "Last month"]];

function money(v: number | null | undefined, cur = "INR", digits = 0) {
  if (v == null) return "—";
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: cur, maximumFractionDigits: digits }).format(v); } catch { return `${cur} ${v.toFixed(digits)}`; }
}
const num = (v?: number | null) => (v == null ? "—" : v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : Math.round(v).toLocaleString("en-IN"));

export default function AdsManagerPage() {
  const { toast } = useToast();
  const conn = useQuery<any>({ queryKey: ["/api/ads/connection"] });
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected")) toast({ title: "Facebook connected", description: "Now choose your ad account and Page." });
    if (p.get("error")) toast({ title: "Facebook not connected", description: p.get("error")!, variant: "destructive" });
    if (p.get("connected") || p.get("error")) window.history.replaceState({}, "", "/ads-manager");
  }, [toast]);
  const connect = useMutation({
    mutationFn: () => j("GET", "/api/ads/connect"),
    onSuccess: (r: any) => { window.location.href = r.url; },
    onError: (e: any) => toast({ title: "Can't connect yet", description: e?.message, variant: "destructive" }),
  });
  const c = conn.data?.data;
  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="AI Ads Manager" subtitle="Your Facebook & Instagram ads, read by AI — with Click-to-WhatsApp ads in a few taps" />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {conn.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !c ? (
          <Card className="rounded-2xl">
            <CardContent className="grid gap-6 p-8 sm:p-8 md:grid-cols-[1.2fr_1fr] md:items-center">
              <div className="space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white"><TrendingUp className="h-6 w-6" /></div>
                <h2 className="text-2xl font-semibold">See what your ads really bring in</h2>
                <p className="text-muted-foreground">Connect your Meta ad account. You'll see spend, reach and WhatsApp chats per campaign, get AI advice on what to pause or scale, and launch Click-to-WhatsApp ads.</p>
                <Button size="lg" onClick={() => connect.mutate()} disabled={!conn.data?.configured || connect.isPending}>
                  {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect Facebook ad account"}
                </Button>
                {!conn.data?.configured && <p className="text-sm text-amber-700">Ads isn't switched on for this platform yet. Ask your admin to add the Facebook app in Instagram & Ads apps.</p>}
              </div>
              <ul className="space-y-3 rounded-2xl bg-muted/40 p-6 text-sm">
                <li><b>Nothing spends on its own.</b> New ads are created paused; you turn them on.</li>
                <li><b>Read-only by default.</b> Pausing, budgets and new ads happen only when you click.</li>
                <li><b>Disconnect anytime</b> here or in Facebook settings.</li>
              </ul>
            </CardContent>
          </Card>
        ) : <Connected c={c} onChange={() => conn.refetch()} onReconnect={() => connect.mutate()} />}
      </main>
    </div>
  );
}

function Connected({ c, onChange, onReconnect }: { c: any; onChange: () => void; onReconnect: () => void }) {
  const { toast } = useToast();
  const [preset, setPreset] = useState("last_7d");
  const [create, setCreate] = useState(false);
  const pick = useQuery<any>({ queryKey: ["/api/ads/accounts"], enabled: c.status === "active" });
  const choose = useMutation({ mutationFn: (b: any) => j("PUT", "/api/ads/selection", b), onSuccess: () => onChange() });
  const disconnect = useMutation({ mutationFn: () => j("DELETE", "/api/ads/connection"), onSuccess: () => { onChange(); toast({ title: "Facebook disconnected" }); } });
  const ov = useQuery<any>({ queryKey: ["/api/ads/overview", c.adAccountId, preset], queryFn: () => j("GET", `/api/ads/overview?preset=${preset}`), enabled: !!c.adAccountId && c.status === "active" });

  if (c.status !== "active") return (
    <Card className="rounded-2xl"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-6 sm:p-6">
      <p>Your Facebook connection expired.</p><Button onClick={onReconnect}>Reconnect</Button>
    </CardContent></Card>
  );

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col gap-3 p-4 sm:p-4 lg:flex-row lg:items-center">
          <p className="text-sm text-muted-foreground">Connected as <b className="text-foreground">{c.fbUserName}</b></p>
          <div className="flex flex-1 flex-wrap gap-2 lg:justify-end">
            <Select value={c.adAccountId || ""} onValueChange={(v) => choose.mutate({ adAccountId: v })}>
              <SelectTrigger className="w-64"><SelectValue placeholder={pick.isLoading ? "Loading ad accounts…" : "Choose ad account"} /></SelectTrigger>
              <SelectContent>{(pick.data?.adAccounts || []).map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name} · {a.currency}{a.active ? "" : " (inactive)"}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={c.pageId || ""} onValueChange={(v) => choose.mutate({ pageId: v })}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Facebook Page" /></SelectTrigger>
              <SelectContent>{(pick.data?.pages || []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{PRESETS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => setCreate(true)} disabled={!c.adAccountId}><Plus className="mr-1.5 h-4 w-4" />Click-to-WhatsApp ad</Button>
            <Button variant="ghost" size="icon" className="text-destructive" aria-label="Disconnect" onClick={() => confirm("Disconnect Facebook? Your ads keep running in Meta.") && disconnect.mutate()}><Unplug className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {!c.adAccountId ? (
        <Card className="rounded-2xl border-dashed"><CardContent className="p-10 text-center text-muted-foreground sm:p-10">Choose an ad account above to see your numbers.</CardContent></Card>
      ) : ov.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : ov.error ? (
        <p className="text-sm text-destructive">{(ov.error as any).message}</p>
      ) : ov.data && (
        <>
          <Kpis d={ov.data} />
          <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <SpendChart d={ov.data} />
            <AiReview preset={preset} />
          </div>
          <Campaigns d={ov.data} adAccountId={c.adAccountId} onChange={() => ov.refetch()} />
        </>
      )}
      {create && <CreateAd c={c} onClose={() => setCreate(false)} onDone={() => { setCreate(false); ov.refetch(); }} />}
    </div>
  );
}

function Kpis({ d }: { d: any }) {
  const t = d.totals;
  const items: Array<[string, string, string?]> = [
    ["Spend", money(t.spend, d.currency)],
    ["Reach", num(t.reach), `${num(t.impressions)} impressions`],
    ["Clicks", num(t.clicks), `CTR ${t.ctr.toFixed(2)}%`],
    ["Cost per click", money(t.cpc, d.currency, 2), `CPM ${money(t.cpm, d.currency)}`],
    ["WhatsApp chats started", num(t.conversations)],
    ["Cost per chat", money(t.costPerConversation, d.currency, 2), t.leads ? `${t.leads} leads` : undefined],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map(([l, v, s]) => (
        <Card key={l} className="rounded-2xl"><CardContent className="p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">{l}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{v}</p>
          {s && <p className="text-xs text-muted-foreground">{s}</p>}
        </CardContent></Card>
      ))}
    </div>
  );
}

function SpendChart({ d }: { d: any }) {
  const rows = (d.daily || []).map((x: any) => ({ date: x.date.slice(5), spend: Math.round(x.spend), chats: x.conversations }));
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2"><CardTitle className="text-sm sm:text-sm">Daily spend</CardTitle></CardHeader>
      <CardContent className="h-64">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">No spend in this period.</p> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(v) => num(v)} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))" }} formatter={(v: any, k: any) => (k === "spend" ? [money(v, d.currency), "Spend"] : [v, "Chats"])} />
              <Bar dataKey="spend" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/** Tiny markdown: **bold** and "- " bullets. */
function Md({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p));
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split("\n").filter((l) => l.trim()).map((l, i) =>
        /^\s*[-*•]\s+/.test(l) ? <p key={i} className="pl-4 -indent-3">• {bold(l.replace(/^\s*[-*•]\s+/, ""))}</p>
          : /^#+\s/.test(l) ? <p key={i} className="pt-2 font-semibold">{bold(l.replace(/^#+\s/, ""))}</p>
            : <p key={i} className={/^\*\*/.test(l) ? "pt-2" : ""}>{bold(l)}</p>)}
    </div>
  );
}

function AiReview({ preset }: { preset: string }) {
  const { toast } = useToast();
  const [goal, setGoal] = useState("");
  const review = useMutation({
    mutationFn: () => j("POST", "/api/ads/ai/review", { preset, goal: goal || undefined }),
    onError: (e: any) => toast({ title: "AI review failed", description: e?.message, variant: "destructive" }),
  });
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-sm"><Sparkles className="h-4 w-4 text-violet-600" />AI review</CardTitle>
        <CardDescription>Reads this period's numbers and tells you what to pause, scale or fix.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal (optional), e.g. more WhatsApp orders under ₹40 each" />
          <Button onClick={() => review.mutate()} disabled={review.isPending}>{review.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Review"}</Button>
        </div>
        {review.data?.review ? <div className="max-h-80 overflow-y-auto rounded-xl bg-violet-50/60 p-4 dark:bg-violet-950/20"><Md text={review.data.review} /></div>
          : <p className="text-sm text-muted-foreground">Tip: run it weekly. Changes are never made for you.</p>}
      </CardContent>
    </Card>
  );
}

const STATUS: Record<string, string> = { ACTIVE: "border-green-200 bg-green-50 text-green-700", PAUSED: "", CAMPAIGN_PAUSED: "", WITH_ISSUES: "border-red-200 bg-red-50 text-red-700", DISAPPROVED: "border-red-200 bg-red-50 text-red-700", IN_PROCESS: "border-blue-200 bg-blue-50 text-blue-700", PENDING_REVIEW: "border-blue-200 bg-blue-50 text-blue-700" };

function Campaigns({ d, adAccountId, onChange }: { d: any; adAccountId: string; onChange: () => void }) {
  const { toast } = useToast();
  const [confirmOn, setConfirmOn] = useState<any>(null);
  const [budget, setBudget] = useState<{ k: any; v: string } | null>(null);
  const status = useMutation({
    mutationFn: (x: { id: string; status: string }) => j("POST", `/api/ads/campaigns/${x.id}/status`, { status: x.status }),
    onSuccess: (_r, x) => { toast({ title: x.status === "ACTIVE" ? "Campaign turned on" : "Campaign paused" }); setConfirmOn(null); onChange(); },
    onError: (e: any) => toast({ title: "Couldn't change status", description: e?.message, variant: "destructive" }),
  });
  const setB = useMutation({
    mutationFn: () => j("POST", `/api/ads/campaigns/${budget!.k.id}/budget`, { dailyBudget: Number(budget!.v) }),
    onSuccess: (r: any) => { toast({ title: "Daily budget updated", description: r.data?.updated }); setBudget(null); onChange(); },
    onError: (e: any) => toast({ title: "Couldn't change budget", description: e?.message, variant: "destructive" }),
  });
  const act = adAccountId.replace(/^act_/, "");
  const rows: any[] = d.campaigns || [];
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm sm:text-sm">Campaigns</CardTitle>
        <a className="flex items-center gap-1 text-sm text-blue-600 hover:underline" href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act}`} target="_blank" rel="noreferrer">Open Meta Ads Manager<ExternalLink className="h-3.5 w-3.5" /></a>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0 sm:p-0">
        {rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No campaigns in this ad account.</p> : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">On</th><th className="px-2 py-2 font-medium">Campaign</th>
                <th className="px-2 py-2 text-right font-medium">Daily budget</th><th className="px-2 py-2 text-right font-medium">Spend</th>
                <th className="px-2 py-2 text-right font-medium">Reach</th><th className="px-2 py-2 text-right font-medium">CTR</th>
                <th className="px-2 py-2 text-right font-medium">Chats</th><th className="px-4 py-2 text-right font-medium">Cost / chat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Switch checked={k.status === "ACTIVE"} aria-label={`Turn ${k.name} ${k.status === "ACTIVE" ? "off" : "on"}`}
                      onCheckedChange={(on) => (on ? setConfirmOn(k) : status.mutate({ id: k.id, status: "PAUSED" }))} />
                  </td>
                  <td className="max-w-[320px] px-2 py-3">
                    <p className="truncate font-medium">{k.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${STATUS[k.effectiveStatus] || ""}`}>{String(k.effectiveStatus).replace(/_/g, " ").toLowerCase()}</Badge>
                      <span>{String(k.objective || "").replace("OUTCOME_", "").toLowerCase()}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {k.dailyBudget != null ? (
                      <button className="inline-flex items-center gap-1 hover:underline" onClick={() => setBudget({ k, v: String(k.dailyBudget) })}>{money(k.dailyBudget, d.currency)}<Pencil className="h-3 w-3" /></button>
                    ) : k.lifetimeBudget != null ? <span className="text-muted-foreground">{money(k.lifetimeBudget, d.currency)} total</span> : (
                      <button className="text-muted-foreground hover:underline" onClick={() => setBudget({ k, v: "" })}>ad set budget</button>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{money(k.spend, d.currency)}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{num(k.reach)}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{k.ctr ? `${k.ctr.toFixed(2)}%` : "—"}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{k.conversations || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(k.costPerConversation, d.currency, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      <Dialog open={!!confirmOn} onOpenChange={(o) => !o && setConfirmOn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn on "{confirmOn?.name}"?</DialogTitle>
            <DialogDescription>
              Meta will start delivering this campaign and charge your ad account
              {confirmOn?.dailyBudget ? ` up to ${money(confirmOn.dailyBudget, d.currency)} per day` : " according to its budget"}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOn(null)}>Keep paused</Button>
            <Button onClick={() => status.mutate({ id: confirmOn.id, status: "ACTIVE" })} disabled={status.isPending}>{status.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Turn on"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!budget} onOpenChange={(o) => !o && setBudget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Daily budget</DialogTitle><DialogDescription>{budget?.k.name}. Big jumps (over 20%) can restart Meta's learning phase.</DialogDescription></DialogHeader>
          <Input type="number" min={1} value={budget?.v || ""} onChange={(e) => setBudget(budget && { ...budget, v: e.target.value })} placeholder="e.g. 500" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudget(null)}>Cancel</Button>
            <Button onClick={() => setB.mutate()} disabled={!Number(budget?.v) || setB.isPending}>{setB.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save budget"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CreateAd({ c, onClose, onDone }: { c: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [brief, setBrief] = useState({ business: "", offer: "", audience: "", language: "English" });
  const [f, setF] = useState({ name: "", dailyBudget: "300", ageMin: "18", ageMax: "55", primaryText: "", headline: "", imageUrl: "" });
  const [cityQ, setCityQ] = useState("");
  const [cities, setCities] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState<any>(null);
  const ai = useMutation({
    mutationFn: () => j("POST", "/api/ads/ai/copy", brief),
    onSuccess: (r: any) => setF((x) => ({ ...x, primaryText: r.primaryTexts[0] || x.primaryText, headline: r.headlines[0] || x.headline, name: x.name || brief.offer.slice(0, 60) })),
    onError: (e: any) => toast({ title: "AI couldn't write copy", description: e?.message, variant: "destructive" }),
  });
  const cityFind = useQuery<any>({ queryKey: ["/api/ads/cities", cityQ], queryFn: () => j("GET", `/api/ads/cities?q=${encodeURIComponent(cityQ)}`), enabled: cityQ.length >= 2 });
  const create = useMutation({
    mutationFn: () => j("POST", "/api/ads/ctwa", {
      name: f.name, dailyBudget: Number(f.dailyBudget), ageMin: Number(f.ageMin), ageMax: Number(f.ageMax),
      primaryText: f.primaryText, headline: f.headline, imageUrl: f.imageUrl, countries: ["IN"], cities: cities.map((x) => ({ key: x.key, radius: 15 })),
    }),
    onSuccess: (r: any) => { setDone(r.data); toast({ title: "Ad created — paused", description: "Review it, then turn it on from the campaign list." }); },
    onError: (e: any) => toast({ title: "Couldn't create the ad", description: e?.message, variant: "destructive" }),
  });
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("image", file);
      const r = await (await apiRequestFormData("POST", "/api/store/upload-image", fd)).json();
      setF((x) => ({ ...x, imageUrl: r.url }));
    } catch (e: any) { toast({ title: "Upload failed", description: e?.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };
  const alt = ai.data;
  return (
    <Sheet open onOpenChange={(o) => !o && (done ? onDone() : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5" />New Click-to-WhatsApp ad</SheetTitle></SheetHeader>
        {done ? (
          <div className="mt-8 space-y-4 text-center">
            <p className="text-lg font-semibold">Your ad is ready and paused</p>
            <p className="text-sm text-muted-foreground">Nothing is spending yet. Check the preview in Meta Ads Manager, then switch it on.</p>
            <div className="flex justify-center gap-2">
              <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${String(c.adAccountId).replace(/^act_/, "")}&selected_campaign_ids=${done.campaignId}`} target="_blank" rel="noreferrer">
                <Button variant="outline"><ExternalLink className="mr-1.5 h-4 w-4" />Preview in Ads Manager</Button>
              </a>
              <Button onClick={onDone}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {!c.pageId && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Choose your Facebook Page first (top of the page). It must be linked to your WhatsApp Business number.</p>}
            <section className="space-y-3 rounded-xl border p-4">
              <p className="flex items-center gap-2 font-medium"><Wand2 className="h-4 w-4 text-violet-600" />Write it with AI</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={brief.business} onChange={(e) => setBrief({ ...brief, business: e.target.value })} placeholder="Business, e.g. Ladies kurti boutique in Delhi" />
                <Input value={brief.offer} onChange={(e) => setBrief({ ...brief, offer: e.target.value })} placeholder="Offer, e.g. Diwali sale 30% off" />
                <Input value={brief.audience} onChange={(e) => setBrief({ ...brief, audience: e.target.value })} placeholder="Audience (optional)" />
                <Select value={brief.language} onValueChange={(v) => setBrief({ ...brief, language: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["English", "Hinglish", "Hindi"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={() => ai.mutate()} disabled={ai.isPending || !brief.business || !brief.offer}>
                {ai.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-1.5 h-4 w-4" />Write ad copy</>}
              </Button>
              {alt && (
                <div className="space-y-2 text-sm">
                  <p className="text-xs text-muted-foreground">Tap an option to use it</p>
                  {alt.primaryTexts.map((t: string, i: number) => (
                    <button key={i} type="button" onClick={() => setF({ ...f, primaryText: t })} className={`block w-full rounded-lg border p-2 text-left ${f.primaryText === t ? "border-violet-500 bg-violet-50" : ""}`}>{t}</button>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {alt.headlines.map((h: string, i: number) => (
                      <button key={i} type="button" onClick={() => setF({ ...f, headline: h })} className={`rounded-full border px-3 py-1 ${f.headline === h ? "border-violet-500 bg-violet-50" : ""}`}>{h}</button>
                    ))}
                  </div>
                  {alt.imagePrompt && <p className="text-xs text-muted-foreground">Image idea: {alt.imagePrompt}</p>}
                </div>
              )}
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ad-name">Campaign name</Label><Input id="ad-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ad-text">Primary text</Label><Textarea id="ad-text" rows={4} value={f.primaryText} onChange={(e) => setF({ ...f, primaryText: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ad-head">Headline</Label><Input id="ad-head" maxLength={40} value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label htmlFor="ad-img">Image (1080×1080 JPG)</Label>
                <div className="flex gap-2">
                  <Input id="ad-img" value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} placeholder="https://…" />
                  <label className="inline-flex cursor-pointer items-center rounded-md border px-3 hover:bg-muted">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                  </label>
                </div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="ad-budget">Daily budget (₹)</Label><Input id="ad-budget" type="number" min={100} value={f.dailyBudget} onChange={(e) => setF({ ...f, dailyBudget: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>Age</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={18} max={65} value={f.ageMin} onChange={(e) => setF({ ...f, ageMin: e.target.value })} aria-label="Minimum age" />
                  <span>to</span>
                  <Input type="number" min={18} max={65} value={f.ageMax} onChange={(e) => setF({ ...f, ageMax: e.target.value })} aria-label="Maximum age" />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ad-city">Cities (blank = all of India)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {cities.map((x) => <Badge key={x.key} variant="secondary" className="gap-1">{x.name}<button type="button" aria-label={`Remove ${x.name}`} onClick={() => setCities(cities.filter((y) => y.key !== x.key))}>×</button></Badge>)}
                </div>
                <Input id="ad-city" value={cityQ} onChange={(e) => setCityQ(e.target.value)} placeholder="Search a city, e.g. Noida" />
                {cityQ.length >= 2 && (cityFind.data?.data || []).length > 0 && (
                  <div className="rounded-lg border">
                    {cityFind.data.data.map((x: any) => (
                      <button key={x.key} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { if (!cities.some((y) => y.key === x.key)) setCities([...cities, x]); setCityQ(""); }}>
                        {x.name}, {x.region}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">15 km around each city.</p>
              </div>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
              Created <b className="text-foreground">paused</b>: campaign → ad set (optimised for WhatsApp conversations) → ad with a "Send message" button. Nothing spends until you turn it on.
            </div>
            <div className="flex justify-end gap-2 pb-6">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending || !c.pageId || !f.name || !f.primaryText || !f.headline || !f.imageUrl || Number(f.dailyBudget) < 100}>
                {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create paused ad"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
