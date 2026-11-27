import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiRequestFormData } from "@/lib/queryClient";
import {
  Bot, Eye, EyeOff, Film, Heart, ImageIcon, Instagram, Loader2, MessageCircle, Pencil, Plus, RefreshCw, Reply, Send, Trash2, Unplug, Upload, Zap,
} from "lucide-react";

const j = async (method: string, url: string, body?: any) => (await apiRequest(method, url, body)).json();
const fmt = (n?: number | null) => (n == null ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString());

export default function InstagramPage() {
  const { toast } = useToast();
  const status = useQuery<any>({ queryKey: ["/api/instagram/status"] });
  const accounts = useQuery<any>({ queryKey: ["/api/instagram/accounts"] });
  const list: any[] = accounts.data?.data || [];
  const [accountId, setAccountId] = useState<string>("");
  const acc = list.find((a) => a.id === accountId) || list[0];

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected")) toast({ title: `@${p.get("connected")} connected`, description: "Comments and DMs now reach HoverChat." });
    if (p.get("error")) toast({ title: "Instagram not connected", description: p.get("error")!, variant: "destructive" });
    if (p.get("connected") || p.get("error")) window.history.replaceState({}, "", "/instagram");
  }, [toast]);

  const connect = useMutation({
    mutationFn: () => j("GET", "/api/instagram/connect"),
    onSuccess: (r: any) => { window.location.href = r.url; },
    onError: (e: any) => toast({ title: "Can't connect yet", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Instagram" subtitle="Reels, comments, DMs and comment-to-DM automations in one place" />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {accounts.isLoading || status.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !list.length ? (
          <ConnectCard configured={!!status.data?.configured} busy={connect.isPending} onConnect={() => connect.mutate()} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {list.length > 1 && (
                <Select value={acc.id} onValueChange={setAccountId}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>{list.map((a) => <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <Button variant="outline" size="sm" onClick={() => connect.mutate()} disabled={connect.isPending}><Plus className="mr-1.5 h-4 w-4" />Connect another</Button>
            </div>
            <AccountView key={acc.id} acc={acc} onChange={() => accounts.refetch()} onReconnect={() => connect.mutate()} />
          </>
        )}
      </main>
    </div>
  );
}

function ConnectCard({ configured, busy, onConnect }: { configured: boolean; busy: boolean; onConnect: () => void }) {
  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="grid gap-0 md:grid-cols-2">
        <div className="space-y-4 p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white"><Instagram className="h-6 w-6" /></div>
          <h2 className="text-2xl font-semibold">Connect your Instagram</h2>
          <p className="text-muted-foreground">Turn reel comments into sales. When someone comments <b>shop</b> on your reel, they get your link in DM instantly — and you reply to DMs from here.</p>
          <ul className="space-y-1.5 text-sm">
            <li>• Comment → automatic DM with your link</li>
            <li>• Reach, views and likes for every post and reel</li>
            <li>• Reply to comments and DMs, publish posts and reels</li>
          </ul>
          <Button size="lg" onClick={onConnect} disabled={!configured || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Instagram className="mr-2 h-4 w-4" />Connect Instagram</>}
          </Button>
          {!configured && <p className="text-sm text-amber-700">Instagram isn't switched on for this platform yet. Ask your admin to add it in Instagram & Ads apps.</p>}
          <p className="text-xs text-muted-foreground">Needs a Business or Creator account. Personal accounts can switch for free in the Instagram app: Settings → Account type.</p>
        </div>
        <div className="hidden items-center justify-center bg-gradient-to-br from-[#fdf2f8] to-[#f5f3ff] p-8 md:flex">
          <div className="w-72 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm"><b>riya.k</b> shop 🔥</p>
            <div className="rounded-xl bg-muted p-3 text-sm">Hey @riya.k! Here's the link to shop the look 👇
              <div className="mt-2 rounded-lg border bg-white py-1.5 text-center text-sm font-medium">Shop now</div>
            </div>
            <p className="text-right text-xs text-muted-foreground">Sent automatically</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function AccountView({ acc, onChange, onReconnect }: { acc: any; onChange: () => void; onReconnect: () => void }) {
  const { toast } = useToast();
  const sync = useMutation({
    mutationFn: () => j("POST", `/api/instagram/accounts/${acc.id}/sync`),
    onSuccess: (r: any) => { onChange(); toast({ title: "Instagram synced", description: r.chats ? `${r.chats} chats updated` : undefined }); },
    onError: (e: any) => toast({ title: "Sync failed", description: e?.message, variant: "destructive" }),
  });
  const disconnect = useMutation({
    mutationFn: () => j("DELETE", `/api/instagram/accounts/${acc.id}`),
    onSuccess: () => { onChange(); toast({ title: `@${acc.username} disconnected` }); },
  });
  const insights = useQuery<any>({ queryKey: [`/api/instagram/accounts/${acc.id}/insights`], enabled: acc.status === "active" });
  const ins = insights.data?.data || {};
  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col gap-5 p-6 sm:p-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            {acc.profilePic ? <img src={acc.profilePic} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-pink-200" /> : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Instagram /></div>}
            <div>
              <p className="text-lg font-semibold">@{acc.username}</p>
              <p className="text-sm text-muted-foreground">{acc.name || acc.accountType}</p>
              {acc.status !== "active" && (
                <p className="mt-1 text-sm text-destructive">Connection expired. <button className="underline" onClick={onReconnect}>Reconnect</button></p>
              )}
            </div>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-3 sm:grid-cols-6">
            {[
              ["Followers", acc.followers], ["Following", acc.follows], ["Posts", acc.mediaCount],
              ["Reach · 28d", ins.reach], ["Views · 28d", ins.views], ["Interactions", ins.total_interactions],
            ].map(([l, v]) => (
              <div key={l as string}><p className="text-xl font-semibold tabular-nums">{insights.isLoading && String(l).includes("·") ? "…" : fmt(v as number)}</p><p className="text-xs text-muted-foreground">{l}</p></div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}><RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} /></Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => confirm(`Disconnect @${acc.username}? Automations stop.`) && disconnect.mutate()}><Unplug className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>
      <Tabs defaultValue="automations">
        <TabsList>
          <TabsTrigger value="automations"><Zap className="mr-1.5 h-4 w-4" />Comment → DM</TabsTrigger>
          <TabsTrigger value="posts"><Film className="mr-1.5 h-4 w-4" />Posts & reels</TabsTrigger>
          <TabsTrigger value="inbox"><MessageCircle className="mr-1.5 h-4 w-4" />DMs</TabsTrigger>
          <TabsTrigger value="publish"><Upload className="mr-1.5 h-4 w-4" />Publish</TabsTrigger>
        </TabsList>
        <TabsContent value="automations" className="mt-4"><Automations acc={acc} /></TabsContent>
        <TabsContent value="posts" className="mt-4"><Posts acc={acc} /></TabsContent>
        <TabsContent value="inbox" className="mt-4"><Inbox acc={acc} /></TabsContent>
        <TabsContent value="publish" className="mt-4"><Publish acc={acc} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────── media helpers ───────────── */

function useMedia(acc: any) {
  const [pages, setPages] = useState<any[]>([]);
  const [after, setAfter] = useState<string | null>(null);
  const q = useQuery<any>({ queryKey: [`/api/instagram/accounts/${acc.id}/media`] });
  const more = useMutation({
    mutationFn: () => j("GET", `/api/instagram/accounts/${acc.id}/media?after=${encodeURIComponent(after || q.data?.next)}`),
    onSuccess: (r: any) => { setPages((p) => [...p, ...r.data]); setAfter(r.next); },
  });
  const all = [...(q.data?.data || []), ...pages];
  const hasMore = pages.length ? !!after : !!q.data?.next;
  return { q, all, more, hasMore };
}

const thumb = (m: any) => m.thumbnail_url || m.media_url;

/* ───────────── Comment → DM automations ───────────── */

type Rule = {
  id?: string; name: string; mediaId?: string | null; mediaThumb?: string | null; mediaCaption?: string | null;
  keywords: string[]; matchMode: "contains" | "exact"; publicReplies: string[]; dmText: string;
  dmButtonText?: string | null; dmButtonUrl?: string | null; oncePerUser: boolean; isActive: boolean; triggered?: number; dmsSent?: number;
};
const blankRule = (m?: any): Rule => ({
  name: m ? `Reel: ${String(m.caption || "").slice(0, 30) || m.id}` : "Any post — shop", mediaId: m?.id || null, mediaThumb: m ? thumb(m) : null, mediaCaption: m?.caption || null,
  keywords: ["shop"], matchMode: "contains",
  publicReplies: ["Sent you a DM 📩", "Check your DMs {{username}} 💌", "Done! Look in your inbox ✨"],
  dmText: "Hey {{username}}! 👋 Here's the link you asked for:", dmButtonText: "Shop now", dmButtonUrl: "", oncePerUser: true, isActive: true,
});

function Automations({ acc }: { acc: any }) {
  const { toast } = useToast();
  const rules = useQuery<any>({ queryKey: [`/api/instagram/accounts/${acc.id}/rules`] });
  const activity = useQuery<any>({ queryKey: [`/api/instagram/accounts/${acc.id}/activity`], refetchInterval: 20000 });
  const [edit, setEdit] = useState<Rule | null>(null);
  const toggle = useMutation({ mutationFn: (r: Rule) => j("PATCH", `/api/instagram/accounts/${acc.id}/rules/${r.id}/active`, { isActive: !r.isActive }), onSuccess: () => rules.refetch() });
  const del = useMutation({ mutationFn: (r: Rule) => j("DELETE", `/api/instagram/accounts/${acc.id}/rules/${r.id}`), onSuccess: () => { rules.refetch(); toast({ title: "Automation deleted" }); } });
  const rows: Rule[] = rules.data?.data || [];
  const events: any[] = activity.data?.data || [];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-muted-foreground">When someone comments a keyword, reply publicly and send them a DM with your link. Each person gets the DM once.</p>
          <Button onClick={() => setEdit(blankRule())}><Plus className="mr-1.5 h-4 w-4" />New automation</Button>
        </div>
        {rules.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
          <Card className="rounded-2xl border-dashed"><CardContent className="p-10 text-center sm:p-10">
            <Bot className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No automations yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Pick a reel, choose a word like "shop" or "link", and write the DM. Tell your viewers: "Comment SHOP and I'll DM you the link".</p>
            <Button className="mt-4" onClick={() => setEdit(blankRule())}><Plus className="mr-1.5 h-4 w-4" />Create automation</Button>
          </CardContent></Card>
        ) : rows.map((r) => (
          <Card key={r.id} className="rounded-2xl">
            <CardContent className="flex gap-4 p-4 sm:p-4">
              {r.mediaThumb ? <img src={r.mediaThumb} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover" /> : <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-center text-[10px] text-muted-foreground">Any post</div>}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium">{r.name}</p>
                  <Switch checked={r.isActive} onCheckedChange={() => toggle.mutate(r)} aria-label="Automation on/off" />
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.keywords.length ? r.keywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>) : <Badge variant="secondary">any comment</Badge>}
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">DM: {r.dmText}{r.dmButtonText ? ` [${r.dmButtonText}]` : ""}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span><b className="text-foreground">{r.triggered || 0}</b> comments</span>
                  <span><b className="text-foreground">{r.dmsSent || 0}</b> DMs sent</span>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => confirm("Delete this automation?") && del.mutate(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="h-fit rounded-2xl">
        <CardHeader className="pb-2"><CardTitle className="text-sm sm:text-sm">Latest comments handled</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {events.length === 0 ? <p className="text-sm text-muted-foreground">Comments on your posts show up here.</p> : events.slice(0, 25).map((e) => (
            <div key={e.id} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate"><b>@{e.fromUsername || "user"}</b> {e.text}</span>
                <Badge variant="outline" className={e.action === "dm_sent" ? "border-green-200 bg-green-50 text-green-700" : e.action === "failed" ? "border-red-200 bg-red-50 text-red-700" : ""}>
                  {e.action === "dm_sent" ? "DM sent" : e.action === "no_match" ? "no match" : e.action}
                </Badge>
              </div>
              {e.error && <p className="text-xs text-muted-foreground">{e.error}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
      {edit && <RuleEditor acc={acc} value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); rules.refetch(); }} />}
    </div>
  );
}

function RuleEditor({ acc, value, onClose, onSaved }: { acc: any; value: Rule; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [r, setR] = useState<Rule>(() => JSON.parse(JSON.stringify(value)));
  const [kw, setKw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { all, q } = useMedia(acc);
  const save = useMutation({
    mutationFn: () => j(r.id ? "PUT" : "POST", r.id ? `/api/instagram/accounts/${acc.id}/rules/${r.id}` : `/api/instagram/accounts/${acc.id}/rules`, {
      ...r, dmButtonText: r.dmButtonText || null, dmButtonUrl: r.dmButtonUrl || null, publicReplies: r.publicReplies.filter((x) => x.trim()),
    }),
    onSuccess: () => { toast({ title: r.id ? "Automation saved" : "Automation is live" }); onSaved(); },
    onError: (e: any) => setErr(e?.message || "Couldn't save"),
  });
  const addKw = () => { const k = kw.trim().toLowerCase(); if (k && !r.keywords.includes(k)) setR({ ...r, keywords: [...r.keywords, k] }); setKw(""); };
  const preview = (s: string) => s.replace(/\{\{\s*(username|name)\s*\}\}/g, "@riya.k");
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>{r.id ? "Edit automation" : "New comment → DM automation"}</SheetTitle></SheetHeader>
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_220px]">
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input id="rule-name" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Which post or reel?</Label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                <button type="button" onClick={() => setR({ ...r, mediaId: null, mediaThumb: null, mediaCaption: null })}
                  className={`flex h-24 w-[72px] shrink-0 items-center justify-center rounded-lg border-2 p-1 text-center text-xs ${!r.mediaId ? "border-[var(--brand)]" : "border-transparent bg-muted"}`}>Any post or reel</button>
                {q.isLoading ? <Loader2 className="m-4 h-5 w-5 animate-spin" /> : all.map((m) => (
                  <button key={m.id} type="button" title={m.caption || ""} onClick={() => setR({ ...r, mediaId: m.id, mediaThumb: thumb(m), mediaCaption: m.caption || null })}
                    className={`relative h-24 w-[72px] shrink-0 overflow-hidden rounded-lg border-2 ${r.mediaId === m.id ? "border-[var(--brand)]" : "border-transparent"}`}>
                    <img src={thumb(m)} alt="" className="h-full w-full object-cover" />
                    {m.media_product_type === "REELS" && <Film className="absolute right-1 top-1 h-3.5 w-3.5 text-white drop-shadow" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-kw">When the comment has</Label>
              <div className="flex flex-wrap gap-1.5">
                {r.keywords.map((k) => (
                  <Badge key={k} variant="secondary" className="gap-1">{k}<button type="button" aria-label={`Remove ${k}`} onClick={() => setR({ ...r, keywords: r.keywords.filter((x) => x !== k) })}>×</button></Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input id="rule-kw" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="shop, link, price…" onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKw(); } }} />
                <Button type="button" variant="outline" onClick={addKw}>Add</Button>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Select value={r.matchMode} onValueChange={(v: any) => setR({ ...r, matchMode: v })}>
                  <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">Word anywhere in the comment</SelectItem>
                    <SelectItem value="exact">Comment is exactly the word</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">No words = every comment</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Public reply under the comment (one picked at random)</Label>
              {r.publicReplies.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={p} onChange={(e) => setR({ ...r, publicReplies: r.publicReplies.map((x, k) => (k === i ? e.target.value : x)) })} />
                  <Button size="icon" variant="ghost" type="button" aria-label="Remove reply" onClick={() => setR({ ...r, publicReplies: r.publicReplies.filter((_, k) => k !== i) })}>×</Button>
                </div>
              ))}
              {r.publicReplies.length < 5 && <Button type="button" size="sm" variant="outline" onClick={() => setR({ ...r, publicReplies: [...r.publicReplies, ""] })}><Plus className="mr-1 h-3.5 w-3.5" />Add reply</Button>}
              <p className="text-xs text-muted-foreground">Different replies look natural. Leave empty to only send the DM.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-dm">DM message</Label>
              <Textarea id="rule-dm" rows={4} value={r.dmText} onChange={(e) => setR({ ...r, dmText: e.target.value })} />
              <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                <Input aria-label="Button text" maxLength={20} value={r.dmButtonText || ""} onChange={(e) => setR({ ...r, dmButtonText: e.target.value })} placeholder="Button text" />
                <Input aria-label="Button link" value={r.dmButtonUrl || ""} onChange={(e) => setR({ ...r, dmButtonUrl: e.target.value })} placeholder="https://yourshop.com/product (tip: use a short link)" />
              </div>
              <p className="text-xs text-muted-foreground">{"{{username}}"} becomes their @handle.</p>
            </div>
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span>Send the DM only once per person</span>
              <Switch checked={r.oncePerUser} onCheckedChange={(v) => setR({ ...r, oncePerUser: v })} />
            </label>
            {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
            <div className="flex justify-end gap-2 pb-6">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => { setErr(null); save.mutate(); }} disabled={save.isPending || !r.dmText.trim()}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : r.id ? "Save" : "Turn on automation"}
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <div className="space-y-3 rounded-2xl border bg-muted/30 p-3 text-sm">
              <p><b>riya.k</b> {r.keywords[0] || "love this"} 😍</p>
              {r.publicReplies[0] && <p className="pl-4 text-muted-foreground"><b className="text-foreground">{acc.username}</b> {preview(r.publicReplies[0])}</p>}
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="whitespace-pre-wrap">{preview(r.dmText)}</p>
                {r.dmButtonText && <div className="mt-2 rounded-lg border py-1.5 text-center font-medium text-blue-600">{r.dmButtonText}</div>}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ───────────── Posts & reels ───────────── */

function Posts({ acc }: { acc: any }) {
  const { all, q, more, hasMore } = useMedia(acc);
  const [open, setOpen] = useState<any>(null);
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as any).message}</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {all.map((m) => (
          <button key={m.id} type="button" onClick={() => setOpen(m)} className="group relative aspect-[4/5] overflow-hidden rounded-xl bg-muted text-left focus-visible:outline focus-visible:outline-2">
            <img src={thumb(m)} alt={String(m.caption || "").slice(0, 80)} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
            <div className="absolute inset-x-0 bottom-0 flex gap-3 bg-gradient-to-t from-black/70 to-transparent p-2 text-xs text-white">
              <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{fmt(m.like_count)}</span>
              <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{fmt(m.comments_count)}</span>
              {m.media_product_type === "REELS" ? <Film className="ml-auto h-3.5 w-3.5" /> : <ImageIcon className="ml-auto h-3.5 w-3.5" />}
            </div>
          </button>
        ))}
      </div>
      {hasMore && <Button variant="outline" onClick={() => more.mutate()} disabled={more.isPending}>{more.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}</Button>}
      {open && <MediaSheet acc={acc} m={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function MediaSheet({ acc, m, onClose }: { acc: any; m: any; onClose: () => void }) {
  const { toast } = useToast();
  const insights = useQuery<any>({ queryKey: [`/api/instagram/accounts/${acc.id}/media/${m.id}/insights?type=${m.media_product_type || ""}`] });
  const comments = useQuery<any>({ queryKey: [`/api/instagram/accounts/${acc.id}/media/${m.id}/comments`] });
  const [replyTo, setReplyTo] = useState<any>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "dm">("reply");
  const send = useMutation({
    mutationFn: () => j("POST", `/api/instagram/accounts/${acc.id}/comments/${replyTo.id}/${mode}`, { message: text }),
    onSuccess: () => { toast({ title: mode === "dm" ? "DM sent" : "Reply posted" }); setText(""); setReplyTo(null); comments.refetch(); },
    onError: (e: any) => toast({ title: "Couldn't send", description: e?.message, variant: "destructive" }),
  });
  const hide = useMutation({ mutationFn: (c: any) => j("POST", `/api/instagram/accounts/${acc.id}/comments/${c.id}/hide`, { hide: !c.hidden }), onSuccess: () => comments.refetch() });
  const del = useMutation({ mutationFn: (c: any) => j("DELETE", `/api/instagram/accounts/${acc.id}/comments/${c.id}`), onSuccess: () => comments.refetch() });
  const ins = insights.data?.data || {};
  const metrics: Array<[string, string]> = [["views", "Views"], ["reach", "Reach"], ["likes", "Likes"], ["comments", "Comments"], ["shares", "Shares"], ["saved", "Saves"]];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>{m.media_product_type === "REELS" ? "Reel" : "Post"} · {new Date(m.timestamp).toLocaleDateString()}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-5">
          <div className="flex gap-4">
            <img src={thumb(m)} alt="" className="h-40 w-32 rounded-xl object-cover" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="line-clamp-5 text-sm">{m.caption}</p>
              <a href={m.permalink} target="_blank" rel="noreferrer" className="text-sm text-[var(--brand)] hover:underline">Open on Instagram</a>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {metrics.map(([k, l]) => (
              <div key={k} className="rounded-xl border p-3"><p className="text-lg font-semibold tabular-nums">{insights.isLoading ? "…" : fmt(ins[k])}</p><p className="text-xs text-muted-foreground">{l}</p></div>
            ))}
          </div>
          {ins.ig_reels_avg_watch_time != null && <p className="text-sm text-muted-foreground">Average watch time: {(ins.ig_reels_avg_watch_time / 1000).toFixed(1)}s</p>}
          <div className="space-y-2">
            <p className="font-medium">Comments</p>
            {comments.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (comments.data?.data || []).length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : comments.data.data.map((c: any) => (
              <div key={c.id} className={`rounded-lg border p-3 text-sm ${c.hidden ? "opacity-60" : ""}`}>
                <p><b>@{c.username}</b> {c.text}</p>
                {(c.replies?.data || []).map((r: any) => <p key={r.id} className="mt-1 pl-4 text-muted-foreground"><b className="text-foreground">@{r.username}</b> {r.text}</p>)}
                <div className="mt-1 flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setReplyTo(c); setMode("reply"); }}><Reply className="mr-1 h-3.5 w-3.5" />Reply</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setReplyTo(c); setMode("dm"); }}><Send className="mr-1 h-3.5 w-3.5" />DM</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => hide.mutate(c)}>{c.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => confirm("Delete this comment?") && del.mutate(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                {replyTo?.id === c.id && (
                  <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
                    <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === "dm" ? "Private message to this person" : `Reply to @${c.username}`} />
                    <Button type="submit" disabled={!text.trim() || send.isPending}>{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "dm" ? "Send DM" : "Reply"}</Button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ───────────── DMs ───────────── */

function Inbox({ acc }: { acc: any }) {
  const threads = useQuery<any>({ queryKey: [`/api/instagram/accounts/${acc.id}/threads`], refetchInterval: 10000 });
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const rows: any[] = (threads.data?.data || []).filter((t: any) => !q || `${t.username} ${t.name}`.toLowerCase().includes(q.toLowerCase()));
  const active = open || rows[0]?.id;
  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="grid h-[620px] md:grid-cols-[300px_1fr]">
        <div className="flex flex-col border-r">
          <div className="border-b p-3"><Input placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="flex-1 overflow-y-auto">
            {threads.isLoading ? <Loader2 className="m-4 h-5 w-5 animate-spin" /> : rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No DMs yet. New messages appear here as they arrive.</p>
            ) : rows.map((t) => (
              <button key={t.id} type="button" onClick={() => setOpen(t.id)}
                className={`flex w-full items-center gap-3 border-b px-3 py-3 text-left hover:bg-muted ${active === t.id ? "bg-muted" : ""}`}>
                {t.profilePic ? <img src={t.profilePic} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-100 text-sm font-semibold text-pink-700">{(t.username || "?")[0]?.toUpperCase()}</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.username ? `@${t.username}` : t.name || "Instagram user"}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.lastMessageText}</p>
                </div>
                {t.unread > 0 && <span className="rounded-full bg-[var(--brand)] px-1.5 text-xs text-white">{t.unread}</span>}
              </button>
            ))}
          </div>
        </div>
        {active ? <Thread acc={acc} threadId={active} onRead={() => threads.refetch()} /> : <div className="hidden items-center justify-center text-sm text-muted-foreground md:flex">Pick a chat</div>}
      </div>
    </Card>
  );
}

function Thread({ acc, threadId, onRead }: { acc: any; threadId: string; onRead: () => void }) {
  const { toast } = useToast();
  const q = useQuery<any>({ queryKey: [`/api/instagram/accounts/${acc.id}/threads/${threadId}/messages`], refetchInterval: 8000 });
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const msgs: any[] = q.data?.data || [];
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  useEffect(() => { if (q.data) onRead(); }, [threadId, !!q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = useMutation({
    mutationFn: () => j("POST", `/api/instagram/accounts/${acc.id}/threads/${threadId}/reply`, { text }),
    onSuccess: () => { setText(""); q.refetch(); },
    onError: (e: any) => toast({ title: "Couldn't send", description: e?.message, variant: "destructive" }),
  });
  const t = q.data?.thread;
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b p-3 font-medium">{t ? (t.username ? `@${t.username}` : t.name || "Instagram user") : "…"}</div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
        {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : msgs.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.direction === "out" ? "bg-[var(--brand)] text-white" : "border bg-white"}`}>
              {m.text || (m.attachments ? "[Attachment]" : "")}
              <p className={`mt-0.5 text-[10px] ${m.direction === "out" ? "text-white/70" : "text-muted-foreground"}`}>
                {new Date(m.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{m.source === "automation" ? " · auto" : ""}
              </p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} disabled={q.data && !q.data.canReply}
          placeholder={q.data && !q.data.canReply ? "Instagram allows replies only within 24 hours of their last message" : "Type a message"} />
        <Button type="submit" disabled={!text.trim() || send.isPending || (q.data && !q.data.canReply)}><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}

/* ───────────── Publish ───────────── */

function Publish({ acc }: { acc: any }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<"image" | "reel">("image");
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const pub = useMutation({
    mutationFn: () => j("POST", `/api/instagram/accounts/${acc.id}/publish`, { kind, url, caption }),
    onSuccess: () => { toast({ title: kind === "reel" ? "Reel published" : "Post published" }); setUrl(""); setCaption(""); },
    onError: (e: any) => toast({ title: "Couldn't publish", description: e?.message, variant: "destructive" }),
  });
  const upload = async (f: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("image", f);
      const r = await (await apiRequestFormData("POST", "/api/store/upload-image", fd)).json();
      setUrl(r.url);
    } catch (e: any) { toast({ title: "Upload failed", description: e?.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };
  const tags = useMemo(() => (caption.match(/#\w+/g) || []).length, [caption]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-base sm:text-base">Publish to @{acc.username}</CardTitle><CardDescription>Posts go live right away.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button type="button" variant={kind === "image" ? "default" : "outline"} onClick={() => setKind("image")}><ImageIcon className="mr-1.5 h-4 w-4" />Photo</Button>
            <Button type="button" variant={kind === "reel" ? "default" : "outline"} onClick={() => setKind("reel")}><Film className="mr-1.5 h-4 w-4" />Reel</Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pub-url">{kind === "image" ? "Photo (JPG)" : "Video link (MP4, 3–90 s, 9:16)"}</Label>
            <div className="flex gap-2">
              <Input id="pub-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              {kind === "image" && (
                <label className="inline-flex cursor-pointer items-center rounded-md border px-3 text-sm hover:bg-muted">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <input type="file" accept="image/jpeg" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                </label>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Instagram downloads the file from this link, so it must be public.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pub-cap">Caption</Label>
            <Textarea id="pub-cap" rows={6} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={"New drop is here ✨\n\nComment SHOP and we'll DM you the link 👇\n\n#fashion #newarrivals"} />
            <p className="text-xs text-muted-foreground">{caption.length}/2200 · {tags}/30 hashtags</p>
          </div>
          <Button onClick={() => pub.mutate()} disabled={!url || pub.isPending || tags > 30}>
            {pub.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{kind === "reel" ? "Processing video…" : "Publishing…"}</> : "Publish now"}
          </Button>
        </CardContent>
      </Card>
      <Card className="h-fit rounded-2xl bg-muted/30">
        <CardContent className="space-y-2 p-5 text-sm sm:p-5">
          <p className="font-medium">Tip: pair it with an automation</p>
          <p className="text-muted-foreground">Write "Comment SHOP for the link" in your caption, then create a Comment → DM automation for this reel. Every comment becomes a DM with your product link.</p>
        </CardContent>
      </Card>
    </div>
  );
}
