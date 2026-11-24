/**
 * Flow Studio — list of no-code WhatsApp Flows for the selected number.
 * Create from a starter, import flows built in WhatsApp Manager, open the builder.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive, CalendarCheck, ClipboardList, Copy, Download, ExternalLink, FileText, Headphones, LayoutTemplate, Loader2, MessageSquareHeart,
  MoreHorizontal, Pencil, Plus, RefreshCw, Search, Sparkles, Ticket, Trash2, UserPlus, Workflow,
} from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useChannelContext } from "@/contexts/channel-context";
import { FLOW_CATEGORIES } from "@shared/flow-studio";
import FlowAiChat, { CREATE_IDEAS, type AiFlowResult } from "@/components/flow-studio/FlowAiChat";
import FlowPreview from "@/components/flow-studio/FlowPreview";

export const FLOW_STATUS: Record<string, { label: string; cls: string; dot: string }> = {
  local: { label: "Not on WhatsApp yet", cls: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  draft: { label: "Draft", cls: "bg-amber-50 text-amber-800 ring-1 ring-amber-200", dot: "bg-amber-500" },
  published: { label: "Live", cls: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200", dot: "bg-emerald-500" },
  throttled: { label: "Throttled", cls: "bg-orange-50 text-orange-800 ring-1 ring-orange-200", dot: "bg-orange-500" },
  blocked: { label: "Blocked", cls: "bg-red-50 text-red-700 ring-1 ring-red-200", dot: "bg-red-500" },
  deprecated: { label: "Retired", cls: "bg-slate-100 text-slate-500", dot: "bg-slate-300" },
};

const STARTER_ICON: Record<string, any> = {
  lead: UserPlus, appointment: CalendarCheck, feedback: MessageSquareHeart, signup: ClipboardList, support: Headphones, event: Ticket, blank: FileText,
};
const catLabel = (id: string) => FLOW_CATEGORIES.find((c) => c.id === id)?.label || id;

type Row = {
  id: string; name: string; categories: string[]; status: string; dirty: boolean; metaFlowId: string | null; version: number;
  updatedAt: string; screens: number; jsonMode: boolean; stats: { sent: number; completed: number; last: string | null };
};

function ago(iso?: string | null) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function WhatsAppFlowsPage() {
  const { selectedChannel } = useChannelContext() as any;
  const channelId: string | undefined = selectedChannel?.id;
  const wabaId: string | undefined = selectedChannel?.whatsappBusinessAccountId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Row | null>(null);

  const list = useQuery<{ flows: Row[]; unlinked: any[]; metaError: string | null }>({
    queryKey: ["/api/flow-studio", channelId],
    enabled: !!channelId,
    queryFn: async () => (await apiRequest("GET", `/api/flow-studio?channelId=${channelId}`)).json(),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/flow-studio", channelId] });

  const importFlow = useMutation({
    mutationFn: async (metaFlowId: string) => (await apiRequest("POST", "/api/flow-studio/import", { channelId, metaFlowId })).json(),
    onSuccess: (r: any) => { refresh(); navigate(`/whatsapp-flows/${r.id}`); },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });
  const duplicate = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/flow-studio/${id}/duplicate`)).json(),
    onSuccess: () => { refresh(); toast({ title: "Copy created" }); },
  });
  const retire = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/flow-studio/${id}/deprecate`)).json(),
    onSuccess: () => { refresh(); toast({ title: "Flow retired", description: "It can no longer be sent." }); },
    onError: (e: Error) => toast({ title: "Couldn't retire", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/flow-studio/${id}`)).json(),
    onSuccess: () => { refresh(); setToDelete(null); toast({ title: "Flow deleted" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const flows = list.data?.flows || [];
  const shown = useMemo(() => flows.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase())), [flows, q]);
  const totals = useMemo(() => ({
    live: flows.filter((f) => f.status === "published").length,
    responses: flows.reduce((n, f) => n + f.stats.completed, 0),
    sent: flows.reduce((n, f) => n + f.stats.sent, 0),
  }), [flows]);
  const managerUrl = `https://business.facebook.com/wa/manage/flows/${wabaId ? `?waba_id=${wabaId}` : ""}`;

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Flow Studio" subtitle="Build WhatsApp forms without code: leads, bookings, surveys, sign-ups" />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {!channelId ? (
          <Card><CardContent className="text-center text-muted-foreground">Select a WhatsApp number first.</CardContent></Card>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { l: "Flows", v: flows.length },
                  { l: "Live", v: totals.live },
                  { l: "Responses", v: totals.responses },
                  { l: "Sent from Studio", v: totals.sent },
                ].map((k) => (
                  <Card key={k.l} className="rounded-2xl"><CardContent><p className="text-xs text-muted-foreground">{k.l}</p><p className="mt-1 text-2xl font-bold tabular-nums">{list.isLoading ? "…" : k.v}</p></CardContent></Card>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => list.refetch()} disabled={list.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${list.isFetching ? "animate-spin" : ""}`} />Refresh</Button>
                <Button variant="outline" onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" />New flow</Button>
                <Button onClick={() => setAiOpen(true)}><Sparkles className="mr-2 h-4 w-4" />Create with AI</Button>
              </div>
            </section>

            {list.data?.metaError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Couldn't reach WhatsApp to refresh statuses: {list.data.metaError}
              </div>
            )}

            <Card className="rounded-2xl">
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-base font-semibold">Your flows</h2>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Search flows" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
                  </div>
                </div>
                {list.isLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : flows.length === 0 ? (
                  <EmptyState onCreate={() => setCreating(true)} onAi={() => setAiOpen(true)} />
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {shown.map((f) => {
                      const st = FLOW_STATUS[f.status] || FLOW_STATUS.draft;
                      const rate = f.stats.sent ? Math.round((f.stats.completed / f.stats.sent) * 100) : null;
                      return (
                        <div key={f.id} className="group relative flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-[var(--brand)]/40">
                          <div className="flex items-start justify-between gap-2">
                            <button className="min-w-0 text-left" onClick={() => navigate(`/whatsapp-flows/${f.id}`)}>
                              <p className="truncate font-semibold">{f.name}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{(f.categories || []).map(catLabel).join(", ")} · {f.jsonMode ? "JSON" : `${f.screens} screen${f.screens === 1 ? "" : "s"}`}</p>
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Flow actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/whatsapp-flows/${f.id}`)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/whatsapp-flows/${f.id}?tab=responses`)}><ClipboardList className="mr-2 h-4 w-4" />Responses</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => duplicate.mutate(f.id)}><Copy className="mr-2 h-4 w-4" />Duplicate</DropdownMenuItem>
                                <DropdownMenuItem asChild><a href={`/api/flow-studio/${f.id}/responses?format=csv`}><Download className="mr-2 h-4 w-4" />Export CSV</a></DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {f.status === "published" && <DropdownMenuItem onClick={() => retire.mutate(f.id)}><Archive className="mr-2 h-4 w-4" />Retire</DropdownMenuItem>}
                                <DropdownMenuItem className="text-destructive" onClick={() => setToDelete(f)}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}{f.status === "published" && f.version > 1 ? ` · v${f.version}` : ""}</span>
                            {f.dirty && f.status !== "local" && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800 ring-1 ring-sky-200">Unpublished changes</span>}
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center">
                            <div><p className="text-lg font-semibold tabular-nums">{f.stats.completed}</p><p className="text-[11px] text-muted-foreground">Responses</p></div>
                            <div><p className="text-lg font-semibold tabular-nums">{f.stats.sent}</p><p className="text-[11px] text-muted-foreground">Sent</p></div>
                            <div><p className="text-lg font-semibold tabular-nums">{rate === null ? "—" : `${Math.min(rate, 100)}%`}</p><p className="text-[11px] text-muted-foreground">Completion</p></div>
                          </div>
                          <p className="mt-3 text-xs text-muted-foreground">Last response {ago(f.stats.last)} · edited {ago(f.updatedAt)}</p>
                        </div>
                      );
                    })}
                    {shown.length === 0 && <p className="text-sm text-muted-foreground">No flow matches “{q}”.</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            {(list.data?.unlinked?.length || 0) > 0 && (
              <Card className="rounded-2xl">
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold">Built in WhatsApp Manager</h2>
                      <p className="text-sm text-muted-foreground">Import these to edit them here and track their responses.</p>
                    </div>
                    <Button asChild variant="ghost" size="sm"><a href={managerUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />WhatsApp Manager</a></Button>
                  </div>
                  <div className="divide-y rounded-xl border">
                    {list.data!.unlinked.map((m) => {
                      const st = FLOW_STATUS[String(m.status).toLowerCase()] || FLOW_STATUS.draft;
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{m.name}</p>
                            <p className="text-xs text-muted-foreground">{(m.categories || []).map(catLabel).join(", ") || "—"} · ID {m.id}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`hidden rounded-full px-2 py-0.5 text-xs sm:inline ${st.cls}`}>{st.label}</span>
                            <Button size="sm" variant="outline" disabled={importFlow.isPending} onClick={() => importFlow.mutate(m.id)}>
                              {importFlow.isPending && importFlow.variables === m.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Import
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <HowItWorks />
          </>
        )}
      </main>
      {creating && channelId && <CreateDialog channelId={channelId} onClose={() => setCreating(false)} onAi={() => { setCreating(false); setAiOpen(true); }} onCreated={(id) => { refresh(); navigate(`/whatsapp-flows/${id}`); }} />}
      {aiOpen && channelId && <AiCreateDialog channelId={channelId} business={selectedChannel?.name || "your business"} onClose={() => setAiOpen(false)} onCreated={(id) => { refresh(); navigate(`/whatsapp-flows/${id}`); }} />}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its responses stay in your reports. {toDelete?.status === "draft" ? "The draft on WhatsApp is deleted too." : toDelete?.status === "published" ? "Published flows stay on WhatsApp (Meta doesn't allow deleting them) — retire it first if you want to stop it being sent." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => toDelete && remove.mutate(toDelete.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ onCreate, onAi }: { onCreate: () => void; onAi: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)]/10 text-[var(--brand)]"><Workflow className="h-6 w-6" /></div>
      <h3 className="mt-4 font-semibold">Build your first WhatsApp form</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">Customers fill it without leaving the chat. Answers land in your inbox, update the contact and can notify your team.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onAi}><Sparkles className="mr-2 h-4 w-4" />Describe it, AI builds it</Button>
        <Button variant="outline" onClick={onCreate}>Start from a template</Button>
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <Card className="rounded-2xl">
      <CardContent>
        <h2 className="flex items-center gap-2 text-base font-semibold"><LayoutTemplate className="h-4 w-4" />How sending works</h2>
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-3">
          <div><p className="font-medium">1 · Build and test</p><p className="mt-1 text-muted-foreground">Drag blocks onto screens, try it in the preview, then “Send test” to your own number. Drafts can be test-sent before publishing.</p></div>
          <div><p className="font-medium">2 · Publish</p><p className="mt-1 text-muted-foreground">Publishing locks that version on WhatsApp. Edits after that go live as a new version when you publish again.</p></div>
          <div><p className="font-medium">3 · Send to customers</p><p className="mt-1 text-muted-foreground">In a live chat use “Send”. For campaigns, add a <b>WhatsApp Flow</b> button to a template and pick this flow — replies are tracked here either way.</p></div>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateDialog({ channelId, onClose, onCreated, onAi }: { channelId: string; onClose: () => void; onCreated: (id: string) => void; onAi: () => void }) {
  const { toast } = useToast();
  const starters = useQuery<any[]>({ queryKey: ["/api/flow-studio/starters"], queryFn: async () => (await apiRequest("GET", "/api/flow-studio/starters")).json() });
  const [starter, setStarter] = useState("lead");
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/flow-studio", { channelId, starter, name: name.trim() || starters.data?.find((s) => s.id === starter)?.name || "New flow" })).json(),
    onSuccess: (r: any) => onCreated(r.id),
    onError: (e: Error) => toast({ title: "Couldn't create", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New flow</DialogTitle>
          <DialogDescription>Pick a starting point. Everything is editable.</DialogDescription>
        </DialogHeader>
        <button type="button" onClick={onAi} className="flex items-center gap-3 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-3 text-left hover:bg-[var(--brand)]/10">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)] text-white"><Sparkles className="h-4 w-4" /></span>
          <span><span className="block text-sm font-medium">Describe it, AI builds it</span><span className="block text-xs text-muted-foreground">Tell Gemini what the form is for. It designs the screens, questions and follow-up.</span></span>
        </button>
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {(starters.data || []).map((s) => {
            const Icon = STARTER_ICON[s.id] || FileText;
            const on = starter === s.id;
            return (
              <button key={s.id} type="button" onClick={() => setStarter(s.id)}
                className={`flex gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${on ? "border-[var(--brand)] bg-[var(--brand)]/5" : "hover:bg-muted/50"}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? "bg-[var(--brand)] text-white" : "bg-muted text-foreground"}`}><Icon className="h-4 w-4" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{s.description}</span>
                </span>
              </button>
            );
          })}
          {starters.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="flow-name">Flow name</Label>
          <Input id="flow-name" placeholder={starters.data?.find((s) => s.id === starter)?.name || "e.g. Website enquiry"} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create.mutate()} />
          <p className="text-xs text-muted-foreground">Only you see this name.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create flow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AiCreateDialog({ channelId, business, onClose, onCreated }: { channelId: string; business: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [result, setResult] = useState<AiFlowResult | null>(null);
  const [at, setAt] = useState(0);
  const [values, setValues] = useState<Record<string, any>>({});
  const create = useMutation({
    mutationFn: async (r: AiFlowResult) => (await apiRequest("POST", "/api/flow-studio", {
      channelId, name: r.name, starter: "blank", category: r.category,
      draft: { definition: r.definition, settings: r.settings, cta: r.cta, body: r.body },
    })).json(),
    onSuccess: (row: any) => { toast({ title: "Flow created", description: "Review it, then publish." }); onCreated(row.id); },
    onError: (e: Error) => toast({ title: "Couldn't create", description: e.message, variant: "destructive" }),
  });
  const screens = result?.definition.screens || [];
  const screen = screens[Math.min(at, screens.length - 1)];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[88vh] max-w-5xl flex-col gap-4 p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[var(--brand)]" />Create a flow with AI</DialogTitle>
          <DialogDescription>Describe your form in your own words — English or Hinglish. You can keep asking for changes.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
          <FlowAiChat
            className="min-h-0"
            channelId={channelId}
            ideas={CREATE_IDEAS}
            intro="What should customers fill in? Mention your business and what you need to know — I'll design the screens."
            placeholder="e.g. Admission enquiry for my coaching institute…"
            onResult={(r) => { setResult(r); setAt(0); setValues({}); }}
            renderResult={(r, latest) => latest ? (
              <Button className="w-full" onClick={() => create.mutate(r)} disabled={create.isPending}>
                {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}Create & open in builder
              </Button>
            ) : null}
          />
          <div className="hidden min-h-0 flex-col items-center gap-2 overflow-hidden md:flex">
            {screen ? (
              <>
                <div className="flex flex-wrap justify-center gap-1">
                  {screens.map((s, i) => <button key={s.id} type="button" onClick={() => setAt(i)} className={`h-7 min-w-7 rounded-md px-2 text-xs font-medium ${i === at ? "bg-[var(--brand)] text-white" : "bg-muted hover:bg-muted/70"}`} aria-label={`Screen ${i + 1}`}>{i + 1}</button>)}
                </div>
                <div className="-mb-32 origin-top scale-[0.8]">
                  <FlowPreview screen={screen} businessName={business} mode="try" values={values}
                    setValue={(n, v) => setValues((x) => ({ ...x, [n]: v }))}
                    onSubmit={() => setAt((i) => Math.min(i + 1, screens.length - 1))} onClose={() => setAt(0)} />
                </div>
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-dashed text-center text-sm text-muted-foreground">
                <Workflow className="mb-2 h-6 w-6" />Your flow preview<br />appears here
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
