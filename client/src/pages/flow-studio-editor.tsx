/**
 * Flow Studio editor — drag-and-drop builder for one WhatsApp Flow.
 * Left: screens + block palette · Centre: phone canvas (edit / try) · Right: properties.
 * Autosaves; "Send test" and "Publish" push the compiled Flow JSON to Meta.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Braces, Check, CheckCircle2, ChevronRight, ClipboardList, Copy, Download, ExternalLink,
  AlignJustify, AlignLeft, CalendarDays, ChevronsUpDown, CircleDot, Heading, Heading2, ImageIcon, ListChecks, SquareCheck, Tags, TextCursorInput, Type,
  Eye, Flag, GitBranch, Loader2, Sparkles, MousePointerClick, Plus, Redo2, RotateCcw, Rocket, Send, Settings2, Undo2, Wrench,
} from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useChannelContext } from "@/contexts/channel-context";
import FlowPreview, { DND_NEW, PhoneFrame, missingRequired } from "@/components/flow-studio/FlowPreview";
import { BlockInspector, ScreenInspector } from "@/components/flow-studio/Inspector";
import FlowAiChat, { EDIT_IDEAS } from "@/components/flow-studio/FlowAiChat";
import { FLOW_STATUS } from "@/pages/whatsapp-flows";
import {
  COMPLETE, COMPONENT_META, FLOW_CATEGORIES, compileFlow, formatAnswer, isInput, listFields, newComponent, newScreen, slugField, uid, validateFlow,
  type ComponentKind, type FlowComponent, type FlowDefinition, type FlowIssue, type FlowScreen, type FlowSettings,
} from "@shared/flow-studio";

const PALETTE: Array<{ group: string; kinds: ComponentKind[] }> = [
  { group: "Text", kinds: ["TextHeading", "TextSubheading", "TextBody", "TextCaption", "Image"] },
  { group: "Questions", kinds: ["TextInput", "TextArea", "DatePicker", "OptIn"] },
  { group: "Choices", kinds: ["Dropdown", "RadioButtonsGroup", "CheckboxGroup", "ChipsSelector"] },
];
const KIND_ICON: Record<ComponentKind, any> = {
  TextHeading: Heading, TextSubheading: Heading2, TextBody: AlignLeft, TextCaption: Type, Image: ImageIcon,
  TextInput: TextCursorInput, TextArea: AlignJustify, DatePicker: CalendarDays, OptIn: SquareCheck,
  Dropdown: ChevronsUpDown, RadioButtonsGroup: CircleDot, CheckboxGroup: ListChecks, ChipsSelector: Tags,
};
const DEFAULT_KEY = /^(answer|details|date|consent|choice)(_\d+)?$/;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

type Flow = {
  id: string; channelId: string; name: string; categories: string[]; definition: FlowDefinition; settings: FlowSettings; cta: string; body: string;
  status: string; dirty: boolean; metaFlowId: string | null; version: number; previewUrl: string | null; validationErrors: Array<{ message: string; line?: number }>;
  issues?: FlowIssue[];
};
type SaveState = "saved" | "pending" | "saving" | "error";

export default function FlowStudioEditor() {
  const [, params] = useRoute("/whatsapp-flows/:id");
  const id = params?.id || "";
  const { toast } = useToast();
  const { selectedChannel } = useChannelContext() as any;
  const q = useQuery<Flow>({ queryKey: ["/api/flow-studio/item", id], enabled: !!id, queryFn: async () => (await apiRequest("GET", `/api/flow-studio/${id}`)).json(), refetchOnWindowFocus: false });

  // ── editable state (initialised once from the server) ──
  const [def, setDef] = useState<FlowDefinition | null>(null);
  const [name, setName] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [settings, setSettings] = useState<FlowSettings>({});
  const [cta, setCta] = useState("");
  const [body, setBody] = useState("");
  const [server, setServer] = useState<Flow | null>(null);
  const loaded = useRef(false);
  useEffect(() => {
    if (q.data && !loaded.current) {
      loaded.current = true;
      setDef(q.data.definition); setName(q.data.name); setCategories(q.data.categories || ["OTHER"]); setSettings(q.data.settings || {});
      setCta(q.data.cta); setBody(q.data.body); setServer(q.data);
      setScreenId(q.data.definition.screens?.[0]?.id || "");
    }
  }, [q.data]);

  // ── undo / redo ──
  const past = useRef<FlowDefinition[]>([]);
  const future = useRef<FlowDefinition[]>([]);
  const lastPush = useRef(0);
  const [, force] = useState(0);
  const change = useCallback((fn: (d: FlowDefinition) => void) => {
    setDef((cur) => {
      if (!cur) return cur;
      const next = clone(cur);
      fn(next);
      const now = Date.now();
      if (now - lastPush.current > 600) { past.current.push(cur); if (past.current.length > 60) past.current.shift(); }
      lastPush.current = now;
      future.current = [];
      return next;
    });
    force((n) => n + 1);
  }, []);
  const undo = useCallback(() => setDef((cur) => { const p = past.current.pop(); if (!p || !cur) return cur; future.current.push(cur); lastPush.current = 0; return p; }), []);
  const redo = useCallback(() => setDef((cur) => { const f = future.current.pop(); if (!f || !cur) return cur; past.current.push(cur); lastPush.current = 0; return f; }), []);

  // ── autosave ──
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const timer = useRef<any>(null);
  const payload = useRef<any>(null);
  const first = useRef(true);
  useEffect(() => {
    if (!loaded.current || !def) return;
    if (first.current) { first.current = false; return; }
    payload.current = { name: name.trim() || "Untitled flow", categories, definition: def, settings, cta: cta.trim() || "Open", body: body.trim() || "Please fill this short form." };
    setSaveState("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { flush(); }, 1000);
  }, [def, name, categories, settings, cta, body]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = payload.current;
    if (!p) return;
    payload.current = null;
    setSaveState("saving");
    try {
      const saved: Flow = await (await apiRequest("PUT", `/api/flow-studio/${id}`, p)).json();
      setServer((s) => (s ? { ...s, ...saved, definition: s.definition } : saved));
      setSaveState(payload.current ? "pending" : "saved");
    } catch (e: any) {
      payload.current = payload.current || p;
      setSaveState("error");
      toast({ title: "Not saved", description: e.message, variant: "destructive" });
    }
  }, [id, toast]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (payload.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); if (payload.current) flush(); };
  }, [flush]);

  // ── selection ──
  const [screenId, setScreenId] = useState("");
  const [blockId, setBlockId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "try">("edit");
  const [aiOpen, setAiOpen] = useState(false);
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get("tab") || "build");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); flush(); }
      if (typing || tab !== "build") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && blockId) { e.preventDefault(); blockAction(blockId, "delete"); }
      if (e.key === "Escape") setBlockId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const issues = useMemo(() => (def ? validateFlow(def) : []), [def]);
  const errors = issues.filter((i) => i.level === "error");

  if (q.isLoading || !def || !server) {
    return (
      <div className="flex-1 dots-bg min-h-screen">
        <Header title="Flow Studio" subtitle="Loading…" />
        <div className="flex justify-center p-16">{q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : <Loader2 className="h-6 w-6 animate-spin" />}</div>
      </div>
    );
  }

  const raw = !!def.raw;
  const screens = def.screens;
  const sIndex = Math.max(0, screens.findIndex((s) => s.id === screenId));
  const screen = screens[sIndex];
  const block = screen?.components.find((c) => c.id === blockId) || null;
  const errorIds = new Set(errors.map((i) => i.componentId).filter(Boolean) as string[]);
  const screenErr = new Set(errors.map((i) => i.screenId).filter(Boolean) as string[]);

  // ── editing operations ──
  function withScreen(fn: (s: FlowScreen, d: FlowDefinition) => void) {
    change((d) => { const s = d.screens.find((x) => x.id === screen.id); if (s) fn(s, d); });
  }
  function updateComponent(cid: string, patch: Partial<FlowComponent>) {
    change((d) => {
      for (const s of d.screens) {
        const c = s.components.find((x) => x.id === cid);
        if (!c) continue;
        const oldName = c.name;
        if (patch.label !== undefined && isInput(c) && patch.name === undefined) {
          const taken = d.screens.flatMap((x) => x.components.filter((y) => y.id !== cid && y.name).map((y) => y.name!));
          if (c.name && (DEFAULT_KEY.test(c.name) || c.name === slugField(c.label || "", taken))) patch = { ...patch, name: slugField(patch.label || "field", taken) };
        }
        Object.assign(c, patch);
        if (patch.name !== undefined && oldName && patch.name !== oldName) {
          for (const x of d.screens) if (x.branch?.field === oldName) x.branch.field = patch.name;
          setSettings((st) => ({ ...st, saveName: st.saveName === oldName ? patch.name : st.saveName, saveEmail: st.saveEmail === oldName ? patch.name : st.saveEmail }));
        }
        if (patch.options && s.branch?.field === c.name && !patch.options.some((o) => o.id === s.branch!.equals)) s.branch = patch.options[0] ? { ...s.branch!, equals: patch.options[0].id } : null;
      }
    });
  }
  function addBlock(type: ComponentKind, index?: number) {
    let created: FlowComponent | null = null;
    change((d) => {
      const s = d.screens.find((x) => x.id === screen.id)!;
      created = newComponent(type, d);
      const at = index ?? (block ? s.components.findIndex((c) => c.id === block.id) + 1 : s.components.length);
      s.components.splice(at, 0, created);
    });
    setTimeout(() => created && setBlockId((created as FlowComponent).id), 0);
    setMode("edit");
  }
  function moveBlock(cid: string, index: number) {
    withScreen((s) => {
      const from = s.components.findIndex((c) => c.id === cid);
      if (from < 0) return;
      const [c] = s.components.splice(from, 1);
      s.components.splice(index > from ? index - 1 : index, 0, c);
    });
  }
  function blockAction(cid: string, a: "up" | "down" | "duplicate" | "delete") {
    withScreen((s, d) => {
      const i = s.components.findIndex((c) => c.id === cid);
      if (i < 0) return;
      if (a === "up" && i > 0) [s.components[i - 1], s.components[i]] = [s.components[i], s.components[i - 1]];
      if (a === "down" && i < s.components.length - 1) [s.components[i + 1], s.components[i]] = [s.components[i], s.components[i + 1]];
      if (a === "duplicate") {
        const c = clone(s.components[i]);
        c.id = uid();
        if (c.name) c.name = slugField(c.name, d.screens.flatMap((x) => x.components.map((y) => y.name || "")));
        s.components.splice(i + 1, 0, c);
      }
      if (a === "delete") {
        const [gone] = s.components.splice(i, 1);
        if (gone.name && s.branch?.field === gone.name) s.branch = null;
      }
    });
    if (a === "delete") setBlockId(null);
  }
  function addScreen() {
    let createdId = "";
    change((d) => {
      const i = d.screens.findIndex((x) => x.id === screen.id);
      const cur = d.screens[i];
      const s = newScreen(d, `Screen ${d.screens.length + 1}`);
      s.next = cur.next;
      s.footerLabel = cur.next === COMPLETE ? "Submit" : "Continue";
      cur.next = s.id;
      if (cur.footerLabel === "Submit") cur.footerLabel = "Continue";
      d.screens.splice(i + 1, 0, s);
      createdId = s.id;
    });
    setTimeout(() => { setScreenId(createdId); setBlockId(null); }, 0);
  }
  function deleteScreen() {
    const gone = screen;
    change((d) => {
      const i = d.screens.findIndex((x) => x.id === gone.id);
      d.screens.splice(i, 1);
      for (const s of d.screens) {
        if (s.next === gone.id) s.next = gone.next;
        if (s.branch?.goTo === gone.id) s.branch = null;
      }
    });
    setScreenId(screens[sIndex - 1]?.id || screens[sIndex + 1]?.id || "");
    setBlockId(null);
  }
  function moveScreen(i: number, dir: -1 | 1) {
    change((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.screens.length) return;
      const linear = d.screens.map((s, k) => s.next === (d.screens[k + 1]?.id ?? COMPLETE));
      [d.screens[i], d.screens[j]] = [d.screens[j], d.screens[i]];
      [linear[i], linear[j]] = [linear[j], linear[i]];
      d.screens.forEach((s, k) => { if (linear[k]) s.next = d.screens[k + 1]?.id ?? COMPLETE; });
      const pos = new Map(d.screens.map((s, k) => [s.id, k] as const));
      d.screens.forEach((s, k) => {
        if (s.next !== COMPLETE && (pos.get(s.next) ?? -1) <= k) s.next = d.screens[k + 1]?.id ?? COMPLETE;
        if (s.branch && ((pos.get(s.branch.goTo) ?? -1) <= k || s.next === COMPLETE)) s.branch = null;
      });
    });
  }

  const statusInfo = FLOW_STATUS[server.status] || FLOW_STATUS.draft;
  const business = selectedChannel?.name || "your business";

  return (
    <div className="flex min-h-screen flex-1 flex-col dots-bg">
      <Header title="Flow Studio" subtitle="Build, preview and publish WhatsApp Flows" />
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setMode("edit"); }} className="flex flex-1 flex-col">
        {/* toolbar */}
        <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
            <Button asChild size="icon" variant="ghost" className="h-9 w-9 shrink-0"><Link href="/whatsapp-flows" aria-label="Back to flows"><ArrowLeft className="h-4 w-4" /></Link></Button>
            <div className="min-w-0 flex-1 basis-48">
              <input aria-label="Flow name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className="w-full truncate rounded-md bg-transparent px-1 text-base font-semibold outline-none hover:bg-muted/60 focus:bg-muted/60" />
              <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${statusInfo.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />{statusInfo.label}{server.status === "published" ? ` · v${server.version}` : ""}</span>
                {server.dirty && server.status !== "local" && <span className="text-sky-700">Unpublished changes</span>}
                <SaveBadge state={saveState} onRetry={flush} />
              </div>
            </div>
            <TabsList className="order-last w-full sm:order-none sm:w-auto">
              <TabsTrigger value="build"><Wrench className="mr-1.5 h-4 w-4" />Build</TabsTrigger>
              <TabsTrigger value="settings"><Settings2 className="mr-1.5 h-4 w-4" />Settings</TabsTrigger>
              <TabsTrigger value="responses"><ClipboardList className="mr-1.5 h-4 w-4" />Responses</TabsTrigger>
              <TabsTrigger value="json"><Braces className="mr-1.5 h-4 w-4" />JSON</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-1.5">
              {!raw && tab === "build" && (
                <>
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 className="h-4 w-4" /></Button>
                </>
              )}
              {!raw && <Button size="sm" variant="outline" onClick={() => setAiOpen(true)} className="border-[var(--brand)]/40 text-[var(--brand)] hover:bg-[var(--brand)]/5 hover:text-[var(--brand)]"><Sparkles className="mr-1.5 h-4 w-4" />Edit with AI</Button>}
              <IssuesButton issues={issues} onPick={(i) => { setTab("build"); if (i.screenId) setScreenId(i.screenId); setBlockId(i.componentId || null); setMode("edit"); }} />
              <ActionButtons flow={server} flowId={id} hasErrors={errors.length > 0} flush={flush} onFlow={(f) => setServer((s) => (s ? { ...s, ...f, definition: s.definition } : s))} defaultBody={body} defaultCta={cta} />
            </div>
          </div>
          {server.validationErrors?.length > 0 && !server.dirty && (
            <div className="flex items-start gap-2 border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 sm:px-6">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div><b>WhatsApp rejected this version:</b> {server.validationErrors.slice(0, 3).map((e) => e.message).join(" · ")}{server.validationErrors.length > 3 ? ` (+${server.validationErrors.length - 3} more)` : ""}</div>
            </div>
          )}
        </div>

        {/* BUILD */}
        <TabsContent value="build" className="mt-0 flex-1">
          {raw ? (
            <div className="mx-auto max-w-2xl p-6">
              <Card className="rounded-2xl"><CardContent className="space-y-3">
                <p className="font-semibold">This flow uses advanced features</p>
                <p className="text-sm text-muted-foreground">It was built in WhatsApp Manager with parts the visual builder doesn't support (like a data endpoint or dynamic lists). You can still edit it in the JSON tab, publish it, send it and collect responses here.</p>
                <Button variant="outline" onClick={() => setTab("json")}><Braces className="mr-2 h-4 w-4" />Open JSON editor</Button>
              </CardContent></Card>
            </div>
          ) : (
            <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[260px_minmax(0,1fr)_320px] lg:gap-6">
              {/* left: screens + palette */}
              <aside className="space-y-4 lg:sticky lg:top-[78px] lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto lg:pr-1">
                <Card className="rounded-2xl"><CardContent className="space-y-2 p-3 sm:p-3">
                  <div className="flex items-center justify-between px-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Screens</p><span className="text-xs text-muted-foreground">{screens.length}/15</span></div>
                  <ol className="space-y-1.5">
                    {screens.map((s, i) => {
                      const on = s.id === screen.id;
                      const nextLabel = s.next === COMPLETE ? "Finish" : `→ ${screens.findIndex((x) => x.id === s.next) + 1}`;
                      return (
                        <li key={s.id}>
                          <div className={`group flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors ${on ? "border-[var(--brand)] bg-[var(--brand)]/5" : "border-transparent hover:bg-muted/60"}`}>
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { setScreenId(s.id); setBlockId(null); setMode("edit"); }}>
                              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${on ? "bg-[var(--brand)] text-white" : "bg-muted"}`}>{i + 1}</span>
                              <span className="min-w-0">
                                <span className="flex items-center gap-1 truncate text-sm font-medium">{s.title || "Untitled"}{screenErr.has(s.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-label="has problems" />}</span>
                                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">{s.components.length} block{s.components.length === 1 ? "" : "s"} · {s.next === COMPLETE ? <><Flag className="h-3 w-3" />Finish</> : nextLabel}{s.branch && <><GitBranch className="ml-1 h-3 w-3" />{screens.findIndex((x) => x.id === s.branch!.goTo) + 1}</>}</span>
                              </span>
                            </button>
                            <div className="hidden flex-col group-hover:flex">
                              <button type="button" aria-label="Move screen up" disabled={i === 0} onClick={() => moveScreen(i, -1)} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                              <button type="button" aria-label="Move screen down" disabled={i === screens.length - 1} onClick={() => moveScreen(i, 1)} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <Button variant="outline" size="sm" className="w-full" onClick={addScreen} disabled={screens.length >= 15}><Plus className="mr-2 h-4 w-4" />Add screen</Button>
                </CardContent></Card>

                <Card className="rounded-2xl"><CardContent className="space-y-3 p-3 sm:p-3">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocks</p>
                  {PALETTE.map((g) => (
                    <div key={g.group} className="space-y-1">
                      <p className="px-1 text-[11px] text-muted-foreground">{g.group}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {g.kinds.map((k) => (
                          <button key={k} type="button" draggable
                            onDragStart={(e) => { e.dataTransfer.setData(DND_NEW, k); e.dataTransfer.effectAllowed = "copy"; }}
                            onClick={() => addBlock(k)}
                            title={COMPONENT_META[k].hint}
                            className="flex cursor-grab items-center gap-1.5 rounded-lg border bg-card px-2 py-1.5 text-left text-xs font-medium transition-colors hover:border-[var(--brand)]/50 hover:bg-[var(--brand)]/5 active:cursor-grabbing">
                            {(() => { const Icon = KIND_ICON[k]; return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />; })()}<span className="truncate">{COMPONENT_META[k].label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="px-1 text-[11px] text-muted-foreground">Drag onto the phone, or click to add below the selected block.</p>
                </CardContent></Card>
              </aside>

              {/* centre: phone */}
              <section className="flex min-w-0 flex-col items-center gap-3">
                <div className="flex rounded-full border bg-card p-1 text-sm shadow-sm" role="radiogroup" aria-label="Canvas mode">
                  {([["edit", MousePointerClick, "Edit"], ["try", Eye, "Try it"]] as const).map(([m, Icon, l]) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setBlockId(null); }} className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${mode === m ? "bg-[var(--brand)] text-white" : "text-muted-foreground hover:text-foreground"}`}><Icon className="h-3.5 w-3.5" />{l}</button>
                  ))}
                </div>
                {mode === "edit" ? (
                  <FlowPreview
                    screen={screen} businessName={business} mode="edit" selectedId={blockId} errorIds={errorIds}
                    onSelect={setBlockId} onDropNew={(t, i) => addBlock(t, i)} onMove={moveBlock} onAction={blockAction}
                  />
                ) : (
                  <TryRunner def={def} startId={screen.id} business={business} onExit={() => setMode("edit")} />
                )}
                {mode === "edit" && (
                  <p className="text-center text-xs text-muted-foreground">
                    Screen {sIndex + 1} of {screens.length} · button {screen.next === COMPLETE ? "finishes the flow" : `goes to screen ${screens.findIndex((x) => x.id === screen.next) + 1}`}{screen.branch ? " (with a rule)" : ""}
                  </p>
                )}
              </section>

              {/* right: properties */}
              <aside className="lg:sticky lg:top-[78px] lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto">
                <Card className="rounded-2xl"><CardContent className="p-4 sm:p-4">
                  {block ? (
                    <BlockInspector key={block.id} c={block} onChange={(p) => updateComponent(block.id, p)} onClose={() => setBlockId(null)} issues={issues.filter((i) => i.componentId === block.id)} />
                  ) : (
                    <ScreenInspector key={screen.id} def={def} screen={screen} index={sIndex}
                      onChange={(p) => withScreen((s) => Object.assign(s, p))} onDelete={deleteScreen}
                      issues={issues.filter((i) => i.screenId === screen.id && !i.componentId)} />
                  )}
                </CardContent></Card>
              </aside>
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-0">
          <SettingsTab def={def} settings={settings} setSettings={setSettings} categories={categories} setCategories={setCategories} cta={cta} setCta={setCta} body={body} setBody={setBody} server={server} business={business} />
        </TabsContent>
        <TabsContent value="responses" className="mt-0">
          {tab === "responses" && <ResponsesTab flowId={id} def={def} />}
        </TabsContent>
        <TabsContent value="json" className="mt-0">
          <JsonTab def={def} name={name} onRaw={(r) => change((d) => { d.raw = r; })} />
        </TabsContent>
      </Tabs>
      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader><SheetTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--brand)]" />Edit with AI</SheetTitle></SheetHeader>
          <FlowAiChat
            className="mt-4 flex-1"
            channelId={server.channelId}
            flowId={id}
            getCurrent={() => ({ definition: def, name, cta, body, settings })}
            ideas={EDIT_IDEAS}
            intro="Tell me what to change — add or remove questions, new screens, a rule, a translation. I'll update the whole flow; you can undo it."
            placeholder="e.g. Ask for city after the name…"
            renderResult={(r, latest) => latest ? (
              <Button className="w-full" onClick={() => {
                change((d) => { d.screens = r.definition.screens; delete d.raw; });
                setSettings(r.settings); if (r.cta) setCta(r.cta); if (r.body) setBody(r.body);
                setScreenId(r.definition.screens[0]?.id || ""); setBlockId(null); setTab("build"); setMode("edit");
                toast({ title: "Changes applied", description: "Ctrl+Z undoes the screen changes." });
              }}><Check className="mr-2 h-4 w-4" />Apply to this flow</Button>
            ) : null}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ───────────────────────── toolbar pieces ─────────────────────────

function SaveBadge({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "saving") return <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving</span>;
  if (state === "pending") return <span>Unsaved</span>;
  if (state === "error") return <button type="button" onClick={onRetry} className="font-medium text-red-600 hover:underline">Not saved · retry</button>;
  return <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" />Saved</span>;
}

function IssuesButton({ issues, onPick }: { issues: FlowIssue[]; onPick: (i: FlowIssue) => void }) {
  const errs = issues.filter((i) => i.level === "error").length;
  const warns = issues.length - errs;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={errs ? "text-red-600 hover:text-red-700" : "text-emerald-700 hover:text-emerald-800"}>
          {errs ? <AlertTriangle className="mr-1.5 h-4 w-4" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
          {errs ? `${errs} to fix` : warns ? `${warns} note${warns > 1 ? "s" : ""}` : "Ready"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">{issues.length ? "Check before publishing" : "No problems found"}</div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {issues.map((i, k) => (
            <li key={k}><button type="button" onClick={() => onPick(i)} className="flex w-full gap-2 px-3 py-2 text-left text-xs hover:bg-muted">
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${i.level === "error" ? "bg-red-500" : "bg-amber-500"}`} />{i.message}<ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button></li>
          ))}
          {!issues.length && <li className="px-3 py-3 text-xs text-muted-foreground">Everything follows WhatsApp's rules.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function ActionButtons({ flow, flowId, hasErrors, flush, onFlow, defaultBody, defaultCta }: {
  flow: Flow; flowId: string; hasErrors: boolean; flush: () => Promise<void>; onFlow: (f: Partial<Flow>) => void; defaultBody: string; defaultCta: string;
}) {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const fail = (title: string) => (e: any) => {
    let detail = e.message;
    try { const j = JSON.parse(String(e.message).replace(/^\d+:\s*/, "")); detail = j.metaErrors?.[0]?.message || j.issues?.[0]?.message || j.error || detail; } catch { /* plain */ }
    toast({ title, description: detail, variant: "destructive" });
    queryClient.invalidateQueries({ queryKey: ["/api/flow-studio/item", flowId] });
  };
  const sync = useMutation({
    mutationFn: async () => { await flush(); return (await apiRequest("POST", `/api/flow-studio/${flowId}/sync`)).json(); },
    onSuccess: (f: Flow) => { onFlow(f); toast(f.validationErrors?.length ? { title: "Saved with problems", description: f.validationErrors[0].message, variant: "destructive" } : { title: "Draft saved on WhatsApp" }); },
    onError: fail("Couldn't save to WhatsApp"),
  });
  const publish = useMutation({
    mutationFn: async () => { await flush(); return (await apiRequest("POST", `/api/flow-studio/${flowId}/publish`)).json(); },
    onSuccess: (f: Flow) => { onFlow(f); setConfirm(false); toast({ title: `Published v${f.version}`, description: "Customers can now receive this flow." }); },
    onError: (e) => { setConfirm(false); fail("Publish failed")(e); },
  });
  const preview = useMutation({
    mutationFn: async () => {
      await flush();
      if (!flow.metaFlowId || flow.dirty) { const f = await (await apiRequest("POST", `/api/flow-studio/${flowId}/sync`)).json(); onFlow(f); }
      return (await apiRequest("POST", `/api/flow-studio/${flowId}/preview`)).json();
    },
    onSuccess: (r: any) => (r.previewUrl ? window.open(r.previewUrl, "_blank", "noopener") : toast({ title: "No preview link yet" })),
    onError: fail("Preview unavailable"),
  });
  const canPublish = !hasErrors && (flow.status === "local" || flow.status === "draft" || flow.dirty) && flow.status !== "blocked";

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => preview.mutate()} disabled={preview.isPending || hasErrors} title="Opens Meta's interactive preview">
        {preview.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}<span className="hidden xl:inline">Meta preview</span><span className="xl:hidden">Preview</span>
      </Button>
      <Button variant="outline" size="sm" onClick={() => setSendOpen(true)} disabled={hasErrors || flow.status === "deprecated"}><Send className="mr-1.5 h-4 w-4" />Send</Button>
      <Button size="sm" onClick={() => setConfirm(true)} disabled={!canPublish || publish.isPending || sync.isPending}>
        {publish.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Rocket className="mr-1.5 h-4 w-4" />}{flow.status === "published" && !flow.dirty ? "Published" : "Publish"}
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish {flow.version ? `version ${flow.version + 1}` : "this flow"}?</AlertDialogTitle>
            <AlertDialogDescription>
              WhatsApp locks a flow once it's published. Later edits go live as a new version when you publish again; templates already approved with the old version keep working and their replies still show up here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => sync.mutate()} disabled={sync.isPending}>{sync.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save as draft only</Button>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); publish.mutate(); }} disabled={publish.isPending}>{publish.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Publish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {sendOpen && <SendDialog flow={flow} flowId={flowId} flush={flush} onFlow={onFlow} defaultBody={defaultBody} defaultCta={defaultCta} onClose={() => setSendOpen(false)} />}
    </>
  );
}

function SendDialog({ flow, flowId, flush, onFlow, defaultBody, defaultCta, onClose }: {
  flow: Flow; flowId: string; flush: () => Promise<void>; onFlow: (f: Partial<Flow>) => void; defaultBody: string; defaultCta: string; onClose: () => void;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState(() => { try { return localStorage.getItem("hc:flow-test-number") || ""; } catch { return ""; } });
  const [body, setBody] = useState(defaultBody);
  const [cta, setCta] = useState(defaultCta);
  const [header, setHeader] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      await flush();
      if (!flow.metaFlowId || flow.dirty || flow.status === "local") { const f = await (await apiRequest("POST", `/api/flow-studio/${flowId}/sync`)).json(); onFlow(f); }
      return (await apiRequest("POST", `/api/flow-studio/${flowId}/send`, { to, body, cta, header: header || undefined })).json();
    },
    onSuccess: (r: any) => {
      try { localStorage.setItem("hc:flow-test-number", to); } catch { /* ignore */ }
      toast({ title: r.draft ? "Draft sent" : "Flow sent", description: r.draft ? "Draft flows open for testing only. Publish before sending to customers." : "Answers will appear under Responses." });
      onClose();
    },
    onError: (e: any) => {
      let d = e.message; try { const j = JSON.parse(String(e.message).replace(/^\d+:\s*/, "")); d = j.metaErrors?.[0]?.message || j.issues?.[0]?.message || j.error || d; } catch { /* plain */ }
      toast({ title: "Send failed", description: d, variant: "destructive" });
    },
  });
  const draft = flow.status !== "published" || flow.dirty;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send this flow</DialogTitle>
          <DialogDescription>Goes to someone who messaged you in the last 24 hours. For anyone else, use a template with a Flow button.</DialogDescription>
        </DialogHeader>
        {draft && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Not published{flow.dirty && flow.status === "published" ? " (latest edits)" : ""} — this sends the draft for testing. Customers need the published version.</div>}
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="sd-to">WhatsApp number</Label><Input id="sd-to" placeholder="919876543210" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="sd-h">Header (optional)</Label><Input id="sd-h" maxLength={60} value={header} onChange={(e) => setHeader(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="sd-b">Message</Label><Textarea id="sd-b" rows={3} maxLength={1024} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="sd-c">Button</Label><Input id="sd-c" maxLength={20} value={cta} onChange={(e) => setCta(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => send.mutate()} disabled={send.isPending || to.replace(/\D/g, "").length < 8 || !body.trim()}>{send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── try mode ─────────────────────────

function TryRunner({ def, startId, business, onExit }: { def: FlowDefinition; startId: string; business: string; onExit: () => void }) {
  const [at, setAt] = useState(startId);
  const [trail, setTrail] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);
  const screen = def.screens.find((s) => s.id === at) || def.screens[0];
  const fields = listFields(def);
  const restart = () => { setAt(def.screens[0].id); setTrail([]); setValues({}); setDone(false); setMsg(""); };

  if (done) {
    return (
      <PhoneFrame>
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-white px-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-[#1daa61]" />
          <p className="text-[17px] font-semibold text-[#111b21]">Response sent</p>
          <div className="max-h-72 w-full overflow-y-auto rounded-lg bg-[#f0f2f5] p-3 text-left text-[12px]">
            {fields.map((f) => <p key={f.name} className="py-0.5"><span className="text-[#667781]">{f.label}:</span> <b className="font-medium text-[#111b21]">{formatAnswer(f, values[f.name]) || "—"}</b></p>)}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={restart}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Again</Button>
            <Button size="sm" onClick={onExit}>Back to editing</Button>
          </div>
        </div>
      </PhoneFrame>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <FlowPreview
        screen={screen} businessName={business} mode="try" values={values}
        setValue={(n, v) => { setValues((x) => ({ ...x, [n]: v })); setMsg(""); }}
        onClose={restart}
        footerNote={msg ? <span className="text-red-600">{msg}</span> : undefined}
        onSubmit={() => {
          const miss = missingRequired(screen, values);
          if (miss.length) { setMsg(`Please complete: ${miss.map((c) => c.label).join(", ")}`); return; }
          const b = screen.branch;
          const target = b && values[b.field] === b.equals ? b.goTo : screen.next;
          if (target === COMPLETE) { setDone(true); return; }
          setTrail((t) => [...t, screen.id]); setAt(target);
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={!trail.length} onClick={() => { const t = [...trail]; const p = t.pop()!; setTrail(t); setAt(p); }}><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back</Button>
        <Button size="sm" variant="ghost" onClick={restart}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Restart</Button>
      </div>
    </div>
  );
}

// ───────────────────────── settings ─────────────────────────

function SettingsTab({ def, settings, setSettings, categories, setCategories, cta, setCta, body, setBody, server, business }: {
  def: FlowDefinition; settings: FlowSettings; setSettings: (fn: (s: FlowSettings) => FlowSettings) => void; categories: string[]; setCategories: (v: string[]) => void;
  cta: string; setCta: (v: string) => void; body: string; setBody: (v: string) => void; server: Flow; business: string;
}) {
  const fields = listFields(def);
  const textFields = fields.filter((f) => f.type === "TextInput" || f.type === "TextArea");
  const [tagDraft, setTagDraft] = useState("");
  const thankRef = useRef<HTMLTextAreaElement>(null);
  const set = (p: Partial<FlowSettings>) => setSettings((s) => ({ ...s, ...p }));
  const tags = settings.tags || [];
  const addTag = () => {
    const t = tagDraft.trim().replace(/,$/, "");
    if (t && !tags.includes(t) && tags.length < 10) set({ tags: [...tags, t.slice(0, 40)] });
    setTagDraft("");
  };
  const insertVar = (v: string) => {
    const el = thankRef.current; const cur = settings.thankYou || "";
    const at = el ? el.selectionStart : cur.length;
    set({ thankYou: `${cur.slice(0, at)}{{${v}}}${cur.slice(at)}` });
  };

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-base sm:text-base">When someone submits</CardTitle><CardDescription>Runs automatically for every response.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Save as contact name</Label>
                <Select value={settings.saveName || "__none"} onValueChange={(v) => set({ saveName: v === "__none" ? undefined : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">Don't change</SelectItem>{textFields.map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Save as contact email</Label>
                <Select value={settings.saveEmail || "__none"} onValueChange={(v) => set({ saveEmail: v === "__none" ? undefined : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__none">Don't change</SelectItem>{textFields.map((f) => <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-tag">Add tags to the contact</Label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
                {tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set({ tags: tags.filter((x) => x !== t) })} className="text-muted-foreground hover:text-foreground">×</button></span>)}
                <input id="st-tag" className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none" placeholder={tags.length ? "" : "e.g. lead, hot"} value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)} onBlur={addTag} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } if (e.key === "Backspace" && !tagDraft && tags.length) set({ tags: tags.slice(0, -1) }); }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-thanks">Reply on WhatsApp</Label>
              <Textarea id="st-thanks" ref={thankRef} rows={3} maxLength={1000} placeholder="Leave empty to send nothing" value={settings.thankYou || ""} onChange={(e) => set({ thankYou: e.target.value })} />
              <div className="flex flex-wrap gap-1.5">
                {["name", ...fields.map((f) => f.name)].slice(0, 12).map((v) => <button key={v} type="button" onClick={() => insertVar(v)} className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted">{`{{${v}}}`}</button>)}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border px-4 py-3">
              <div><p className="text-sm font-medium">Notify me</p><p className="text-xs text-muted-foreground">In-app notification with the first answers.</p></div>
              <Switch checked={!!settings.notifyTeam} onCheckedChange={(v) => set({ notifyTeam: v })} aria-label="Notify me" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-base sm:text-base">Category</CardTitle><CardDescription>Required by WhatsApp. Pick up to three.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {FLOW_CATEGORIES.map((c) => {
              const on = categories.includes(c.id);
              return <button key={c.id} type="button" aria-pressed={on} onClick={() => setCategories(on ? (categories.length > 1 ? categories.filter((x) => x !== c.id) : categories) : categories.length < 3 ? [...categories, c.id] : categories)}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "hover:bg-muted"}`}>{c.label}</button>;
            })}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-base sm:text-base">Use in templates and campaigns</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {server.metaFlowId ? (
              <div className="flex items-center gap-2"><span className="text-muted-foreground">WhatsApp Flow ID</span><code className="rounded bg-muted px-2 py-0.5">{server.metaFlowId}</code>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigator.clipboard.writeText(server.metaFlowId!)} aria-label="Copy flow id"><Copy className="h-3.5 w-3.5" /></Button></div>
            ) : <p className="text-muted-foreground">Publish (or send a test) to get a WhatsApp Flow ID.</p>}
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Publish this flow.</li>
              <li>Templates → Create → add a <b className="text-foreground">WhatsApp Flow</b> button and pick “{server.name}”.</li>
              <li>Once Meta approves the template, use it in Campaigns, Automations or the API. Every reply is matched back to this flow.</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-base sm:text-base">Message</CardTitle><CardDescription>What customers see in chat when you send it from here.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="st-body">Text</Label><Textarea id="st-body" rows={3} maxLength={1024} value={body} onChange={(e) => setBody(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="st-cta">Button · {cta.length}/20</Label><Input id="st-cta" maxLength={20} value={cta} onChange={(e) => setCta(e.target.value)} /></div>
            <div className="rounded-xl bg-[#efeae2] p-4">
              <div className="max-w-[260px] overflow-hidden rounded-lg bg-white text-[13px] shadow-sm">
                <p className="whitespace-pre-wrap px-3 pt-2 text-[#111b21]">{body || "Message text"}</p>
                <p className="px-3 pb-1.5 text-right text-[10px] text-[#667781]">{business} · 10:42</p>
                <div className="border-t py-2 text-center text-[14px] font-medium text-[#027eb5]">{cta || "Open"}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────── responses ─────────────────────────

function ResponsesTab({ flowId, def }: { flowId: string; def: FlowDefinition }) {
  const r = useQuery<any>({ queryKey: ["/api/flow-studio/responses", flowId], queryFn: async () => (await apiRequest("GET", `/api/flow-studio/${flowId}/responses`)).json(), refetchInterval: 20000 });
  const [open, setOpen] = useState<any>(null);
  const fields = listFields(def);
  const cols = fields.slice(0, 4);
  const rows: any[] = r.data?.rows || [];
  const st = r.data?.stats || { sent: 0, completed: 0, last: null };
  const rate = st.sent ? Math.min(100, Math.round((st.completed / st.sent) * 100)) : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ l: "Responses", v: st.completed }, { l: "Sent from Studio", v: st.sent }, { l: "Completion", v: rate === null ? "—" : `${rate}%` }, { l: "Last response", v: st.last ? new Date(st.last).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—" }].map((k) => (
          <Card key={k.l} className="rounded-2xl"><CardContent><p className="text-xs text-muted-foreground">{k.l}</p><p className="mt-1 truncate text-xl font-bold tabular-nums">{k.v}</p></CardContent></Card>
        ))}
      </div>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base sm:text-base">Answers</CardTitle>
          <Button asChild variant="outline" size="sm" disabled={!rows.length}><a href={`/api/flow-studio/${flowId}/responses?format=csv`}><Download className="mr-2 h-4 w-4" />Export CSV</a></Button>
        </CardHeader>
        <CardContent>
          {r.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !rows.length ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">No responses yet. Send the flow (or a template with this flow) and answers appear here within seconds.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2 font-medium">Contact</th>{cols.map((c) => <th key={c.name} className="px-3 py-2 font-medium">{c.label}</th>)}<th className="px-3 py-2 font-medium">Submitted</th></tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(row)}>
                      <td className="px-3 py-2.5"><p className="font-medium">{row.contactName || `+${row.phone}`}</p>{row.contactName && <p className="text-xs text-muted-foreground">+{row.phone}</p>}</td>
                      {cols.map((c) => <td key={c.name} className="max-w-[220px] truncate px-3 py-2.5">{formatAnswer(c, row.response?.[c.name]) || <span className="text-muted-foreground">—</span>}</td>)}
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{row.completedAt ? new Date(row.completedAt).toLocaleString() : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <SheetHeader><SheetTitle>{open.contactName || `+${open.phone}`}</SheetTitle></SheetHeader>
              <p className="mt-1 text-xs text-muted-foreground">+{open.phone} · {open.completedAt ? new Date(open.completedAt).toLocaleString() : ""} · via {open.source === "studio" ? "Studio" : open.source === "template" ? "template" : "WhatsApp"}</p>
              <dl className="mt-6 space-y-3 text-sm">
                {fields.map((f) => (
                  <div key={f.name} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{f.label}</dt><dd className="mt-0.5 whitespace-pre-wrap break-words font-medium">{formatAnswer(f, open.response?.[f.name]) || "—"}</dd></div>
                ))}
                {Object.keys(open.response || {}).filter((k) => !fields.some((f) => f.name === k)).map((k) => (
                  <div key={k} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 break-words font-medium">{formatAnswer(undefined, open.response[k])}</dd></div>
                ))}
              </dl>
              {open.conversationId && <Button asChild className="mt-6 w-full" variant="outline"><Link href={`/inbox?conversation=${open.conversationId}`}>Open chat</Link></Button>}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ───────────────────────── JSON ─────────────────────────

function JsonTab({ def, name, onRaw }: { def: FlowDefinition; name: string; onRaw: (raw: any) => void }) {
  const json = useMemo(() => JSON.stringify(compileFlow(def), null, 2), [def]);
  const [draft, setDraft] = useState(json);
  const [err, setErr] = useState("");
  useEffect(() => { setDraft(json); }, [json]);
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "flow"}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-4 sm:p-6">
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div><CardTitle className="text-base sm:text-base">Flow JSON</CardTitle><CardDescription>{def.raw ? "Edit and apply. It's validated again when you publish." : "Generated from the builder — this is exactly what's sent to WhatsApp."}</CardDescription></div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(json)}><Copy className="mr-2 h-4 w-4" />Copy</Button>
            <Button size="sm" variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />Download</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {def.raw ? (
            <>
              <Textarea aria-label="Flow JSON" value={draft} onChange={(e) => { setDraft(e.target.value); setErr(""); }} rows={28} spellCheck={false} className="font-mono text-xs" />
              {err && <p className="text-sm text-red-600">{err}</p>}
              <Button onClick={() => { try { onRaw(JSON.parse(draft)); } catch (e: any) { setErr(`Invalid JSON: ${e.message}`); } }} disabled={draft === json}>Apply changes</Button>
            </>
          ) : (
            <pre className="max-h-[70vh] overflow-auto rounded-xl bg-[#0f1720] p-4 text-xs leading-relaxed text-[#d7e3ee]">{json}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
