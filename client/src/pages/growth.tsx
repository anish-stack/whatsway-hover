import { useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useChannelContext } from "@/contexts/channel-context";
import {
  ArrowDown, BarChart3, Check, Clock, Copy, Link2, Loader2, MessageSquareText, Pencil, Plus, Repeat, ShoppingCart, Trash2, UserPlus, X,
} from "lucide-react";

const j = async (method: string, url: string, body?: any) => (await apiRequest(method, url, body)).json();

export default function GrowthPage() {
  const { selectedChannel } = useChannelContext() as any;
  const channelId: string | undefined = selectedChannel?.id;
  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Growth Tools" subtitle="Follow-up sequences, trackable links and abandoned-cart reminders" />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        <Tabs defaultValue="drips">
          <TabsList>
            <TabsTrigger value="drips"><Repeat className="mr-1.5 h-4 w-4" />Follow-up sequences</TabsTrigger>
            <TabsTrigger value="links"><Link2 className="mr-1.5 h-4 w-4" />Short links</TabsTrigger>
            <TabsTrigger value="cart"><ShoppingCart className="mr-1.5 h-4 w-4" />Abandoned cart</TabsTrigger>
          </TabsList>
          <TabsContent value="drips" className="mt-4">{channelId ? <DripsTab channelId={channelId} /> : <PickNumber />}</TabsContent>
          <TabsContent value="links" className="mt-4"><LinksTab /></TabsContent>
          <TabsContent value="cart" className="mt-4">{channelId ? <CartTab channelId={channelId} /> : <PickNumber />}</TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function PickNumber() {
  return <Card><CardContent className="p-8 text-center text-muted-foreground sm:p-8">Select a WhatsApp number first.</CardContent></Card>;
}

/* ───────────── Follow-up sequences ───────────── */

type Step = { delayMinutes: number; kind: "text" | "template"; text?: string; templateName?: string; language?: string; params?: string[] };
type Seq = { id?: string; name: string; isActive: boolean; trigger: string; triggerValue?: string | null; stopOnReply: boolean; steps: Step[]; stats?: Record<string, number> };

const TRIGGERS: Record<string, { label: string; hint: string }> = {
  manual: { label: "I add people", hint: "Pick contacts and start them on this sequence." },
  keyword: { label: "Customer sends a keyword", hint: "e.g. price, demo, offer — comma separated." },
  flow_submit: { label: "WhatsApp Flow form submitted", hint: "Leave blank for any form, or paste the Meta Flow ID." },
  new_contact: { label: "New contact messages first time", hint: "Starts for every new person who writes to you." },
};

const UNITS = [{ v: 1, l: "minutes" }, { v: 60, l: "hours" }, { v: 1440, l: "days" }];
function splitDelay(min: number) {
  if (min && min % 1440 === 0) return { n: min / 1440, u: 1440 };
  if (min && min % 60 === 0) return { n: min / 60, u: 60 };
  return { n: min, u: 1 };
}
function delayLabel(min: number) {
  if (!min) return "right away";
  const { n, u } = splitDelay(min);
  const l = UNITS.find((x) => x.v === u)!.l;
  return `after ${n} ${n === 1 ? l.replace(/s$/, "") : l}`;
}

const blankSeq = (): Seq => ({
  name: "", isActive: true, trigger: "keyword", triggerValue: "", stopOnReply: true,
  steps: [
    { delayMinutes: 0, kind: "text", text: "Hi {{name}} 👋 Thanks for your interest! Here are the details…" },
    { delayMinutes: 2880, kind: "template", templateName: "", params: ["{{name}}"] },
    { delayMinutes: 5760, kind: "template", templateName: "", params: ["{{name}}"] },
  ],
});

function DripsTab({ channelId }: { channelId: string }) {
  const { toast } = useToast();
  const [edit, setEdit] = useState<Seq | null>(null);
  const [people, setPeople] = useState<any>(null);
  const [enrolOpen, setEnrolOpen] = useState<Seq | null>(null);
  const list = useQuery<any>({ queryKey: ["/api/growth/drips", channelId], queryFn: () => j("GET", `/api/growth/drips?channelId=${channelId}`) });
  const rows: Seq[] = list.data?.data || [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/growth/drips", channelId] });

  const toggle = useMutation({
    mutationFn: (s: Seq) => j("PATCH", `/api/growth/drips/${s.id}/active`, { channelId, isActive: !s.isActive }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (s: Seq) => j("DELETE", `/api/growth/drips/${s.id}?channelId=${channelId}`),
    onSuccess: () => { refresh(); toast({ title: "Sequence deleted" }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Send a series of messages automatically — e.g. Day 1 welcome, Day 3 reminder, Day 7 offer. People drop out when they reply (optional) or send STOP.
        </p>
        <Button onClick={() => setEdit(blankSeq())}><Plus className="mr-1.5 h-4 w-4" />New sequence</Button>
      </div>
      {list.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
        <Card className="rounded-2xl border-dashed"><CardContent className="p-10 text-center sm:p-10">
          <Repeat className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No sequences yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Create one to follow up with leads automatically. Steps after the first day need an approved template, because WhatsApp blocks free text 24 hours after the customer's last message.</p>
          <Button className="mt-4" onClick={() => setEdit(blankSeq())}><Plus className="mr-1.5 h-4 w-4" />Create sequence</Button>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((s) => (
            <Card key={s.id} className="rounded-2xl">
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base sm:text-base">{s.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {TRIGGERS[s.trigger]?.label}{s.trigger === "keyword" && s.triggerValue ? `: ${s.triggerValue}` : ""}
                  </CardDescription>
                </div>
                <Switch checked={s.isActive} onCheckedChange={() => toggle.mutate(s)} aria-label="Sequence on/off" />
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="space-y-2">
                  {s.steps.map((st, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-xs font-semibold text-[var(--brand)]">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground"><Clock className="mr-1 inline h-3 w-3" />{delayLabel(st.delayMinutes)}{i > 0 ? "" : " of starting"}</p>
                        <p className="truncate">{st.kind === "template" ? `Template: ${st.templateName || "—"}` : st.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span><b className="text-foreground">{s.stats?.active || 0}</b> in progress</span>
                  <span><b className="text-foreground">{s.stats?.completed || 0}</b> finished</span>
                  <span><b className="text-foreground">{s.stats?.stopped || 0}</b> stopped</span>
                  {!!s.stats?.failed && <span className="text-destructive"><b>{s.stats.failed}</b> failed</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEnrolOpen(s)} disabled={!s.isActive}><UserPlus className="mr-1.5 h-4 w-4" />Add people</Button>
                  <Button size="sm" variant="outline" onClick={() => setPeople(s)}><BarChart3 className="mr-1.5 h-4 w-4" />People</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(s)}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(`Delete "${s.name}"? People in it stop getting messages.`) && remove.mutate(s)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {edit && <SequenceEditor channelId={channelId} value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
      {enrolOpen && <EnrolDialog channelId={channelId} seq={enrolOpen} onClose={() => { setEnrolOpen(null); refresh(); }} />}
      {people && <PeopleSheet channelId={channelId} seq={people} onClose={() => setPeople(null)} />}
    </div>
  );
}

function SequenceEditor({ channelId, value, onClose, onSaved }: { channelId: string; value: Seq; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [s, setS] = useState<Seq>(() => JSON.parse(JSON.stringify(value)));
  const [err, setErr] = useState<string | null>(null);
  const tpls = useQuery<any>({ queryKey: ["/api/growth/templates", channelId], queryFn: () => j("GET", `/api/growth/templates?channelId=${channelId}`) });
  const templates: any[] = tpls.data?.data || [];
  const varCount = (name?: string) => {
    const t = templates.find((x) => x.name === name);
    return t ? new Set(String(t.body).match(/\{\{\s*\w+\s*\}\}/g) || []).size : 0;
  };
  const setStep = (i: number, patch: Partial<Step>) => setS({ ...s, steps: s.steps.map((st, k) => (k === i ? { ...st, ...patch } : st)) });

  const save = useMutation({
    mutationFn: () => j(s.id ? "PUT" : "POST", s.id ? `/api/growth/drips/${s.id}` : "/api/growth/drips", { ...s, channelId }),
    onSuccess: () => { toast({ title: s.id ? "Sequence saved" : "Sequence created" }); onSaved(); },
    onError: (e: any) => setErr(e?.message || "Couldn't save"),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>{s.id ? "Edit sequence" : "New follow-up sequence"}</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="seq-name">Name</Label>
            <Input id="seq-name" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="e.g. New lead follow-up" />
          </div>
          <div className="space-y-1.5">
            <Label>Starts when</Label>
            <Select value={s.trigger} onValueChange={(v) => setS({ ...s, trigger: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TRIGGERS).map(([k, t]) => <SelectItem key={k} value={k}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            {(s.trigger === "keyword" || s.trigger === "flow_submit") && (
              <Input value={s.triggerValue || ""} onChange={(e) => setS({ ...s, triggerValue: e.target.value })}
                placeholder={s.trigger === "keyword" ? "price, demo, offer" : "Meta Flow ID (optional)"} />
            )}
            <p className="text-xs text-muted-foreground">{TRIGGERS[s.trigger]?.hint}</p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span><span className="block text-sm font-medium">Stop when they reply</span><span className="text-xs text-muted-foreground">Your team takes over the chat from there.</span></span>
            <Switch checked={s.stopOnReply} onCheckedChange={(v) => setS({ ...s, stopOnReply: v })} />
          </label>

          <div className="space-y-3">
            <Label>Messages</Label>
            {s.steps.map((st, i) => {
              const d = splitDelay(st.delayMinutes);
              const n = varCount(st.templateName);
              return (
                <div key={i}>
                  {i > 0 && <ArrowDown className="mx-auto mb-2 h-4 w-4 text-muted-foreground" />}
                  <div className="space-y-3 rounded-xl border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">Step {i + 1}</span>
                      <span className="text-muted-foreground">send</span>
                      <Input type="number" min={0} className="h-8 w-20" value={d.n} onChange={(e) => setStep(i, { delayMinutes: Math.max(0, Number(e.target.value) || 0) * d.u })} />
                      <Select value={String(d.u)} onValueChange={(v) => setStep(i, { delayMinutes: d.n * Number(v) })}>
                        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map((u) => <SelectItem key={u.v} value={String(u.v)}>{u.l}</SelectItem>)}</SelectContent>
                      </Select>
                      <span className="text-muted-foreground">{i === 0 ? "after start" : "after step " + i}</span>
                      <Button size="icon" variant="ghost" className="ml-auto h-8 w-8" disabled={s.steps.length === 1} onClick={() => setS({ ...s, steps: s.steps.filter((_, k) => k !== i) })} aria-label="Remove step"><X className="h-4 w-4" /></Button>
                    </div>
                    <div className="flex gap-2">
                      {(["text", "template"] as const).map((k) => (
                        <Button key={k} type="button" size="sm" variant={st.kind === k ? "default" : "outline"} onClick={() => setStep(i, { kind: k })}>
                          {k === "text" ? "Text message" : "Approved template"}
                        </Button>
                      ))}
                    </div>
                    {st.kind === "text" ? (
                      <>
                        <Textarea rows={3} value={st.text || ""} onChange={(e) => setStep(i, { text: e.target.value })} placeholder="Hi {{name}}, …" />
                        {st.delayMinutes >= 1380 && <p className="text-xs text-amber-700">Text only reaches people who messaged you in the last 24 hours. Use a template for later steps.</p>}
                      </>
                    ) : (
                      <div className="space-y-2">
                        <Select value={st.templateName || ""} onValueChange={(v) => {
                          const t = templates.find((x) => x.name === v);
                          setStep(i, { templateName: v, language: t?.language, params: Array.from({ length: varCount(v) }, (_, k) => st.params?.[k] ?? (k === 0 ? "{{name}}" : "")) });
                        }}>
                          <SelectTrigger><SelectValue placeholder={tpls.isLoading ? "Loading…" : templates.length ? "Choose a template" : "No approved templates"} /></SelectTrigger>
                          <SelectContent>{templates.map((t) => <SelectItem key={`${t.name}-${t.language}`} value={t.name}>{t.name} ({t.language})</SelectItem>)}</SelectContent>
                        </Select>
                        {Array.from({ length: n }, (_, k) => (
                          <Input key={k} value={st.params?.[k] || ""} placeholder={`Value for {{${k + 1}}} — {{name}} works`}
                            onChange={(e) => { const p = [...(st.params || [])]; p[k] = e.target.value; setStep(i, { params: p }); }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {s.steps.length < 20 && (
              <Button type="button" variant="outline" className="w-full" onClick={() => setS({ ...s, steps: [...s.steps, { delayMinutes: 1440, kind: "template", templateName: "", params: [] }] })}>
                <Plus className="mr-1.5 h-4 w-4" />Add step
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Use {"{{name}}"} and {"{{phone}}"} in messages and template values.</p>
          </div>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
          <div className="flex justify-end gap-2 pb-6">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { setErr(null); save.mutate(); }} disabled={save.isPending || !s.name.trim()}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : s.id ? "Save sequence" : "Create sequence"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EnrolDialog({ channelId, seq, onClose }: { channelId: string; seq: Seq; onClose: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [phones, setPhones] = useState("");
  const contacts = useQuery<any>({
    queryKey: ["/api/contacts", channelId, "drip-pick"],
    queryFn: async () => (await fetch(`/api/contacts?channelId=${channelId}&limit=500`, { credentials: "include", headers: { "x-channel-id": channelId } })).json(),
  });
  const all: any[] = contacts.data?.data || contacts.data?.contacts || (Array.isArray(contacts.data) ? contacts.data : []);
  const shown = useMemo(() => all.filter((c) => !q || `${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200), [all, q]);
  const go = useMutation({
    mutationFn: () => j("POST", `/api/growth/drips/${seq.id}/enroll`, {
      channelId, contactIds: [...picked], phones: phones.split(/[\s,]+/).map((p) => p.replace(/\D/g, "")).filter((p) => p.length >= 8),
    }),
    onSuccess: (r: any) => { toast({ title: `${r.added} added to "${seq.name}"`, description: r.skipped ? `${r.skipped} skipped (already in it or opted out)` : undefined }); onClose(); },
    onError: (e: any) => toast({ title: "Couldn't add people", description: e?.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add people to "{seq.name}"</DialogTitle>
          <DialogDescription>Step 1 goes out {delayLabel(seq.steps[0]?.delayMinutes || 0)}.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
          {contacts.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : shown.length === 0 ? <p className="p-2 text-sm text-muted-foreground">No contacts found.</p> : shown.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
              <input type="checkbox" checked={picked.has(c.id)} onChange={(e) => { const n = new Set(picked); e.target.checked ? n.add(c.id) : n.delete(c.id); setPicked(n); }} />
              <span className="flex-1 truncate">{c.name}</span><span className="text-muted-foreground">{c.phone}</span>
            </label>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="drip-phones">Or paste numbers</Label>
          <Textarea id="drip-phones" rows={2} value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="919876543210, 919811122233" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => go.mutate()} disabled={go.isPending || (!picked.size && !phones.trim())}>
            {go.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${picked.size || ""} ${picked.size === 1 ? "person" : "people"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-blue-50 text-blue-700 border-blue-200", completed: "bg-green-50 text-green-700 border-green-200",
  stopped: "bg-muted text-muted-foreground", failed: "bg-red-50 text-red-700 border-red-200",
};

function PeopleSheet({ channelId, seq, onClose }: { channelId: string; seq: Seq; onClose: () => void }) {
  const q = useQuery<any>({ queryKey: ["/api/growth/drips", seq.id, "people"], queryFn: () => j("GET", `/api/growth/drips/${seq.id}/enrollments?channelId=${channelId}`), refetchInterval: 15000 });
  const stop = useMutation({ mutationFn: (id: string) => j("POST", `/api/growth/enrollments/${id}/stop`, { channelId }), onSuccess: () => q.refetch() });
  const rows: any[] = q.data?.data || [];
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>People in "{seq.name}"</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-2">
          {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? <p className="text-sm text-muted-foreground">Nobody yet.</p> : rows.map((r) => (
            <div key={r.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{r.name || r.phone}</span>
                <Badge variant="outline" className={STATUS_STYLE[r.status]}>{r.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.phone} · {r.status === "active" ? `Step ${r.stepIndex + 1} at ${new Date(r.nextRunAt).toLocaleString()}` : r.stopReason || `${r.stepIndex} sent`}
              </p>
              {r.lastError && <p className="mt-1 text-xs text-destructive">{r.lastError}</p>}
              {r.status === "active" && <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={() => stop.mutate(r.id)}>Stop for this person</Button>}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ───────────── Short links ───────────── */

function LinksTab() {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const list = useQuery<any>({ queryKey: ["/api/growth/links"], queryFn: () => j("GET", "/api/growth/links") });
  const base: string = list.data?.base || `${location.origin}/l/`;
  const rows: any[] = list.data?.data || [];
  const create = useMutation({
    mutationFn: () => j("POST", "/api/growth/links", { url, title: title || null, code: code || null }),
    onSuccess: (r: any) => {
      setUrl(""); setTitle(""); setCode("");
      list.refetch();
      navigator.clipboard?.writeText(r.shortUrl);
      toast({ title: "Short link created and copied", description: r.shortUrl });
    },
    onError: (e: any) => toast({ title: "Couldn't create link", description: e?.message, variant: "destructive" }),
  });
  const del = useMutation({ mutationFn: (id: string) => j("DELETE", `/api/growth/links/${id}`), onSuccess: () => list.refetch() });
  const toggle = useMutation({ mutationFn: (l: any) => j("PATCH", `/api/growth/links/${l.id}`, { isActive: !l.isActive }), onSuccess: () => list.refetch() });
  const copy = (s: string) => { navigator.clipboard?.writeText(s); setCopied(s); setTimeout(() => setCopied(null), 1500); };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-base">Shorten a link</CardTitle>
          <CardDescription>Put short links in campaigns, follow-ups and your Instagram bio to see how many people tap them. Add <code>?r=diwali</code> to a short link to tag where the click came from.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Input aria-label="Long link" placeholder="https://yourshop.com/products/diwali-offer" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Input aria-label="Label" placeholder="Label (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input aria-label="Custom code" placeholder="Custom code (optional)" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\w-]/g, ""))} />
            <Button type="submit" disabled={!url.trim() || create.isPending}>{create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Shorten"}</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardContent className="p-0 sm:p-0">
          {list.isLoading ? <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No short links yet.</p>
          ) : (
            <div className="divide-y">
              {rows.map((l) => {
                const short = `${base}${l.code}`;
                return (
                  <div key={l.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => copy(short)} className="truncate font-medium text-[var(--brand)] hover:underline">{short.replace(/^https?:\/\//, "")}</button>
                        {copied === short ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                        {!l.isActive && <Badge variant="outline">Off</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{l.title ? `${l.title} · ` : ""}{l.targetUrl}</p>
                    </div>
                    <div className="flex items-center gap-5 text-sm">
                      <div className="text-right"><p className="text-lg font-semibold tabular-nums">{l.clicks}</p><p className="text-xs text-muted-foreground">clicks</p></div>
                      <div className="text-right"><p className="text-lg font-semibold tabular-nums">{l.uniqueClicks}</p><p className="text-xs text-muted-foreground">people</p></div>
                      <Button size="sm" variant="outline" onClick={() => setStats(l)}><BarChart3 className="h-4 w-4" /></Button>
                      <Switch checked={l.isActive} onCheckedChange={() => toggle.mutate(l)} aria-label="Link on/off" />
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm("Delete this link? It will stop working.") && del.mutate(l.id)} aria-label="Delete link"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {stats && <LinkStats link={stats} onClose={() => setStats(null)} />}
    </div>
  );
}

function LinkStats({ link, onClose }: { link: any; onClose: () => void }) {
  const q = useQuery<any>({ queryKey: ["/api/growth/links", link.id, "stats"], queryFn: () => j("GET", `/api/growth/links/${link.id}/stats`) });
  const daily: any[] = q.data?.daily || [];
  const max = Math.max(1, ...daily.map((d) => d.clicks));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{link.title || link.code}</DialogTitle><DialogDescription className="truncate">{link.targetUrl}</DialogDescription></DialogHeader>
        {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">Clicks, last 14 days</p>
              {daily.length === 0 ? <p className="text-sm text-muted-foreground">No clicks yet.</p> : (
                <div className="flex h-32 items-end gap-1" role="img" aria-label="Clicks per day">
                  {daily.map((d) => (
                    <div key={d.day} className="group relative flex-1" title={`${d.day}: ${d.clicks}`}>
                      <div className="rounded-t bg-[var(--brand)]" style={{ height: `${(d.clicks / max) * 112 + 4}px` }} />
                      <p className="mt-1 text-center text-[10px] text-muted-foreground">{d.day.slice(8)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="mb-1 font-medium">Devices</p>
                {(q.data?.devices || []).map((d: any) => <p key={d.device} className="flex justify-between"><span className="capitalize">{d.device}</span><span className="tabular-nums">{d.clicks}</span></p>)}
              </div>
              <div>
                <p className="mb-1 font-medium">Tags (?r=)</p>
                {(q.data?.refs || []).length === 0 ? <p className="text-muted-foreground">None</p> : q.data.refs.map((d: any) => <p key={d.ref} className="flex justify-between"><span>{d.ref}</span><span className="tabular-nums">{d.clicks}</span></p>)}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Abandoned cart ───────────── */

function CartTab({ channelId }: { channelId: string }) {
  const { toast } = useToast();
  const q = useQuery<any>({ queryKey: ["/api/growth/cart-recovery", channelId], queryFn: () => j("GET", `/api/growth/cart-recovery?channelId=${channelId}`) });
  const tpls = useQuery<any>({ queryKey: ["/api/growth/templates", channelId], queryFn: () => j("GET", `/api/growth/templates?channelId=${channelId}`) });
  const [cfg, setCfg] = useState<any>(null);
  const c = cfg || q.data?.config;
  const save = useMutation({
    mutationFn: () => j("PUT", "/api/growth/cart-recovery", { channelId, ...c, templateName: c.templateName === "none" ? "" : c.templateName }),
    onSuccess: () => { toast({ title: "Cart reminders saved" }); q.refetch(); setCfg(null); },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });
  if (q.isLoading || !c) return <Loader2 className="h-5 w-5 animate-spin" />;
  const set = (p: any) => setCfg({ ...c, ...p });
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base sm:text-base">Remind people who leave items in their cart</CardTitle>
            <CardDescription className="mt-1">One reminder per cart, with Checkout and View cart buttons.</CardDescription>
          </div>
          <Switch checked={!!c.enabled} onCheckedChange={(v) => set({ enabled: v })} aria-label="Cart reminders on/off" />
        </CardHeader>
        <CardContent className="space-y-4">
          {!q.data?.storeEnabled && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Your WhatsApp Store is off. Turn it on in WhatsApp Store → Store settings, or reminders won't go out.</p>}
          <div className="space-y-1.5">
            <Label>Send the reminder</Label>
            <Select value={String(c.delayMinutes)} onValueChange={(v) => set({ delayMinutes: Number(v) })}>
              <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[[30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"], [720, "12 hours"], [1380, "23 hours"]].map(([v, l]) => <SelectItem key={v} value={String(v)}>{l} after the last change</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cart-text">Message</Label>
            <Textarea id="cart-text" rows={6} value={c.text} onChange={(e) => set({ text: e.target.value })} />
            <p className="text-xs text-muted-foreground">Use {"{{name}}"}, {"{{items}}"} and {"{{total}}"}.</p>
          </div>
          <div className="space-y-1.5">
            <Label>If the chat is older than 24 hours, send this template</Label>
            <Select value={c.templateName || "none"} onValueChange={(v) => { const t = (tpls.data?.data || []).find((x: any) => x.name === v); set({ templateName: v, language: t?.language || "en_US" }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Don't send (skip those carts)</SelectItem>
                {(tpls.data?.data || []).map((t: any) => <SelectItem key={`${t.name}-${t.language}`} value={t.name}>{t.name} ({t.language})</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Template values: {"{{1}}"} name, {"{{2}}"} items, {"{{3}}"} total.</p>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card className="rounded-2xl"><CardContent className="p-4 sm:p-5"><p className="text-xs text-muted-foreground">Reminders sent</p><p className="mt-1 text-2xl font-bold tabular-nums">{q.data.stats.remindersSent}</p></CardContent></Card>
          <Card className="rounded-2xl"><CardContent className="p-4 sm:p-5"><p className="text-xs text-muted-foreground">Orders after a reminder</p><p className="mt-1 text-2xl font-bold tabular-nums">{q.data.stats.recovered}</p></CardContent></Card>
        </div>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-sm sm:text-sm">Open carts</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {q.data.carts.length === 0 ? <p className="text-sm text-muted-foreground">No open carts right now.</p> : q.data.carts.slice(0, 15).map((x: any) => (
              <div key={x.phone} className="flex items-center justify-between text-sm">
                <span>{x.phone}</span>
                <span className="text-muted-foreground">{x.items} item{x.items === 1 ? "" : "s"} · {x.reminderSentAt ? "reminded" : new Date(x.updatedAt).toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="rounded-2xl bg-muted/40">
          <CardContent className="flex gap-3 p-4 text-sm sm:p-4">
            <MessageSquareText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">People who reply STOP never get reminders or follow-ups.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
