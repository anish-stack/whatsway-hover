/**
 * Full-screen landing page builder: section library (click or drag onto the page), live canvas
 * rendered in an iframe (real desktop/mobile breakpoints), drag to reorder, and a properties panel.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiRequestFormData, queryClient } from "@/lib/queryClient";
import {
  BLOCKS, BLOCK_TYPES, ICON_CHOICES, LANDING_CATEGORIES, autoDescription, firstImage, newBlock,
  type Block, type BlockType, type FieldDef, type LandingSettings,
} from "@shared/landing";
import { LANDING_ICONS, LandingBlock, LandingCss, LandingIcon, landingStyle } from "@/components/landing/LandingRenderer";
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronRight, Copy, ExternalLink, Eye, EyeOff, GripVertical, ImagePlus, Loader2,
  Monitor, Plus, Redo2, Settings2, Smartphone, Trash2, Undo2, Upload, X,
} from "lucide-react";

const JoditEditor = lazy(() => import("jodit-react"));
const DESKTOP_W = 1280;
const MOBILE_W = 390;

type Drag = { kind: "new"; type: BlockType } | { kind: "move"; id: string } | null;
interface PageMeta {
  title: string; slug: string; category: string | null; status: "draft" | "published";
  metaTitle: string; metaDescription: string; metaKeywords: string; ogImage: string; noindex: boolean;
  canonicalUrl: string; schemaJson: string;
}

// ───────────── iframe canvas (real breakpoints) ─────────────
function Frame({ width, scale, children }: { width: number; scale: number; children: ReactNode }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(800);
  const onLoad = () => {
    const doc = ref.current?.contentDocument;
    if (!doc) return;
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => doc.head.appendChild(n.cloneNode(true)));
    doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/, "");
    setMount(doc.getElementById("root"));
  };
  useEffect(() => {
    if (!mount) return;
    const ro = new ResizeObserver(() => setHeight(Math.max(600, mount.scrollHeight)));
    ro.observe(mount);
    return () => ro.disconnect();
  }, [mount]);
  return (
    <div style={{ width: width * scale, height: height * scale }} className="relative mx-auto">
      <iframe ref={ref} title="Page canvas" onLoad={onLoad}
        srcDoc='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#fff"><div id="root"></div></body></html>'
        style={{ width, height, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0, background: "#fff" }} />
      {mount && createPortal(children, mount)}
    </div>
  );
}

// ───────────── field editors ─────────────
async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await (await apiRequestFormData("POST", "/api/admin/landing/upload", fd)).json();
  return r.data.url;
}

function ImageField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const { toast } = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { onChange(await uploadImage(f)); } catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative group rounded-lg border overflow-hidden bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
          <img src={value} alt="" className="h-28 w-full object-contain" />
          <button type="button" onClick={() => onChange("")} aria-label="Remove image" className="absolute right-1.5 top-1.5 h-7 w-7 grid place-items-center rounded-full bg-white/90 shadow"><X className="h-4 w-4" /></button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… or upload" className="text-xs" />
        <Button type="button" size="icon" variant="outline" aria-label="Upload image" onClick={() => ref.current?.click()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}</Button>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}

function IconField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start gap-2 font-normal"><LandingIcon name={value} className="h-4 w-4" />{value || "Choose icon"}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <div className="grid grid-cols-7 gap-1">
          {ICON_CHOICES.map((n) => {
            const I = LANDING_ICONS[n];
            return (
              <button key={n} type="button" title={n} aria-label={n} onClick={() => { onChange(n); setOpen(false); }}
                className={`h-9 w-9 grid place-items-center rounded-md hover:bg-muted ${value === n ? "bg-[var(--brand-50,#eafbf2)] text-[var(--brand)] ring-1 ring-[var(--brand)]" : ""}`}>
                {I && <I className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ListField({ f, value, onChange, uid }: { f: FieldDef; value: any[]; onChange: (v: any[]) => void; uid: string }) {
  const items = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState<number | null>(null);
  const set = (i: number, k: string, v: any) => onChange(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; onChange(n); setOpen(j); };
  const add = () => {
    const blank: any = {};
    for (const s of f.item || []) blank[s.key] = s.kind === "toggle" ? false : s.kind === "icon" ? "Sparkles" : "";
    onChange([...items, blank]);
    setOpen(items.length);
  };
  const summary = (it: any) => {
    const k = (f.item || []).find((s) => ["text", "textarea"].includes(s.kind));
    return (k && String(it?.[k.key] || "").slice(0, 40)) || "Untitled";
  };
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border bg-white">
          <div className="flex items-center gap-1 pl-2 pr-1">
            <button type="button" className="flex-1 flex items-center gap-1.5 py-2 text-left text-sm min-w-0" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              {open === i ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{summary(it)}</span>
            </button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove" onClick={() => { onChange(items.filter((_, j) => j !== i)); setOpen(null); }}><Trash2 className="h-3.5 w-3.5 text-red-600" /></Button>
          </div>
          {open === i && (
            <div className="space-y-3 border-t p-3">
              {(f.item || []).map((sf) => <Field key={sf.key} f={sf} value={it?.[sf.key]} onChange={(v) => set(i, sf.key, v)} uid={`${uid}-${i}`} />)}
            </div>
          )}
        </div>
      ))}
      {(!f.max || items.length < f.max) && <Button type="button" variant="outline" size="sm" className="w-full" onClick={add}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button>}
    </div>
  );
}

function Field({ f, value, onChange, uid }: { f: FieldDef; value: any; onChange: (v: any) => void; uid: string }) {
  const id = `${uid}-${f.key}`;
  const joditCfg = useMemo(() => ({
    readonly: false, height: 320, toolbarAdaptive: false, askBeforePasteHTML: false, defaultActionOnPaste: "insert_clear_html",
    buttons: "bold,italic,underline,|,ul,ol,|,paragraph,link,image,|,align,undo,redo", uploader: { insertImageAsBase64URI: true },
  }), []);
  if (f.kind === "toggle") {
    return <div className="flex items-center justify-between gap-3"><Label htmlFor={id} className="text-sm font-normal">{f.label}</Label><Switch id={id} checked={!!value} onCheckedChange={onChange} /></div>;
  }
  let control: ReactNode;
  switch (f.kind) {
    case "textarea": control = <Textarea id={id} rows={3} value={value ?? ""} placeholder={f.placeholder} maxLength={f.max} onChange={(e) => onChange(e.target.value)} className="text-sm" />; break;
    case "image": control = <ImageField id={id} value={value ?? ""} onChange={onChange} />; break;
    case "icon": control = <IconField value={value ?? ""} onChange={onChange} />; break;
    case "list": control = <ListField f={f} value={value} onChange={onChange} uid={id} />; break;
    case "select": control = (
      <Select value={String(value ?? "") || "__"} onValueChange={(v) => onChange(v === "__" ? "" : v)}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>{(f.options || []).map((o) => <SelectItem key={o.value || "__"} value={o.value || "__"}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    ); break;
    case "html": control = (
      <Suspense fallback={<div className="h-40 grid place-items-center"><Loader2 className="h-4 w-4 animate-spin" /></div>}>
        <JoditEditor value={value ?? ""} config={joditCfg as any} onBlur={(v: string) => onChange(v)} />
      </Suspense>
    ); break;
    default: control = <Input id={id} value={value ?? ""} placeholder={f.placeholder || (f.kind === "url" ? "https://…, /page or #section" : undefined)} maxLength={f.max} onChange={(e) => onChange(e.target.value)} className="text-sm" />;
  }
  return <div className="space-y-1.5"><Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{f.label}</Label>{control}{f.help && <p className="text-[11px] text-muted-foreground">{f.help}</p>}</div>;
}

// ───────────── page settings panel ─────────────
const S = ({ title, children }: { title: string; children: ReactNode }) => <section className="space-y-3 border-b pb-5 last:border-0"><h3 className="text-sm font-semibold">{title}</h3>{children}</section>;
function PageSettings({ meta, setMeta, settings, setSettings, blocks }: {
  blocks: Block[]; meta: PageMeta; setMeta: (p: Partial<PageMeta>) => void; settings: LandingSettings; setSettings: (p: Partial<LandingSettings>) => void;
}) {
  const T = (k: keyof LandingSettings, label: string, ph?: string, help?: string) => (
    <div className="space-y-1.5"><Label htmlFor={`ps-${k}`} className="text-xs text-muted-foreground">{label}</Label><Input id={`ps-${k}`} value={(settings[k] as string) || ""} placeholder={ph} onChange={(e) => setSettings({ [k]: e.target.value } as any)} className="text-sm" />{help && <p className="text-[11px] text-muted-foreground">{help}</p>}</div>
  );
  return (
    <div className="space-y-5">
      <S title="Page">
        <div className="space-y-1.5"><Label htmlFor="pm-title" className="text-xs text-muted-foreground">Page name</Label><Input id="pm-title" value={meta.title} onChange={(e) => setMeta({ title: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="pm-slug" className="text-xs text-muted-foreground">Address</Label>
          <div className="flex items-center rounded-md border text-sm"><span className="pl-2 text-muted-foreground">/</span><input id="pm-slug" className="flex-1 bg-transparent px-1 py-2 outline-none" value={meta.slug} onChange={(e) => setMeta({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-") })} /></div>
          {meta.status === "published" && <p className="text-[11px] text-amber-700">Changing the address of a live page breaks ads and links that use the old one.</p>}
        </div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Category</Label>
          <Select value={meta.category || "none"} onValueChange={(v) => setMeta({ category: v === "none" ? null : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">No category</SelectItem>{LANDING_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3"><Label htmlFor="ps-chrome" className="text-sm font-normal">Hide site menu & footer<span className="block text-[11px] text-muted-foreground">Best for ad landing pages — fewer exits</span></Label><Switch id="ps-chrome" checked={!!settings.hideChrome} onCheckedChange={(v) => setSettings({ hideChrome: v })} /></div>
        <div className="space-y-1.5"><Label htmlFor="ps-color" className="text-xs text-muted-foreground">Brand colour</Label>
          <div className="flex gap-2"><input id="ps-color" type="color" value={settings.primary || "#08a957"} onChange={(e) => setSettings({ primary: e.target.value })} className="h-9 w-12 rounded border p-0.5" /><Input value={settings.primary || ""} placeholder="#08a957" onChange={(e) => setSettings({ primary: e.target.value })} className="text-sm" /></div>
        </div>
      </S>
      <S title="WhatsApp button">
        {T("whatsappNumber", "WhatsApp number (with country code)", "919876543210", "Shows a floating chat button and powers 'WhatsApp chat' buttons")}
        <div className="space-y-1.5"><Label htmlFor="ps-wt" className="text-xs text-muted-foreground">Pre-filled message</Label><Textarea id="ps-wt" rows={2} value={settings.whatsappText || ""} onChange={(e) => setSettings({ whatsappText: e.target.value })} placeholder="Hi, I saw your ad and want a demo" /></div>
      </S>
      <S title="Ads & tracking">
        {T("googleAdsId", "Google Ads tag ID", "AW-123456789")}
        {T("googleAdsLabel", "Google Ads conversion label", "AbCdEfGh123", "Fires a conversion when the lead form is sent")}
        {T("ga4Id", "Google Analytics 4 ID", "G-XXXXXXX")}
        {T("metaPixelId", "Meta (Facebook) Pixel ID", "123456789012345", "Sends PageView and Lead events")}
        <p className="text-[11px] text-muted-foreground">Ad clicks keep utm_* and gclid in every lead, so you can see which campaign brought it.</p>
      </S>
      <S title="After a lead is sent">
        {T("thankYouUrl", "Thank-you page (optional)", "/thank-you", "Redirect visitors here — useful as a Google Ads conversion page")}
        {T("notifyEmails", "Also email leads to", "sales@company.com, owner@company.com")}
      </S>
      <S title="Search & sharing">
        <div className="space-y-1.5"><Label htmlFor="pm-mt" className="text-xs text-muted-foreground">SEO title</Label><Input id="pm-mt" maxLength={120} value={meta.metaTitle} onChange={(e) => setMeta({ metaTitle: e.target.value })} /><p className="text-[11px] text-muted-foreground">{meta.metaTitle.length}/60 recommended</p></div>
        <div className="space-y-1.5"><Label htmlFor="pm-md" className="text-xs text-muted-foreground">SEO description</Label><Textarea id="pm-md" rows={3} maxLength={320} value={meta.metaDescription} onChange={(e) => setMeta({ metaDescription: e.target.value })} /><p className="text-[11px] text-muted-foreground">{meta.metaDescription.length}/160 recommended · also shown in the industry grid</p></div>
        <div className="space-y-1.5"><Label htmlFor="pm-mk" className="text-xs text-muted-foreground">Keywords</Label><Input id="pm-mk" value={meta.metaKeywords} onChange={(e) => setMeta({ metaKeywords: e.target.value })} /></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Share image</Label><ImageField id="pm-og" value={meta.ogImage} onChange={(v) => setMeta({ ogImage: v })} /></div>
        <div className="space-y-1.5"><Label htmlFor="pm-cu" className="text-xs text-muted-foreground">Canonical URL (optional)</Label><Input id="pm-cu" value={meta.canonicalUrl} placeholder="https://… (leave empty to use this page)" onChange={(e) => setMeta({ canonicalUrl: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="pm-sj" className="text-xs text-muted-foreground">Extra schema (JSON-LD, optional)</Label>
          <Textarea id="pm-sj" rows={4} className="font-mono text-[11px]" value={meta.schemaJson} placeholder='{"@type":"Organization","name":"…"}' onChange={(e) => setMeta({ schemaJson: e.target.value })} />
          <p className="text-[11px] text-muted-foreground">Page and FAQ schema are added automatically. Use this for Organization, LocalBusiness, Product…</p>
        </div>
        <SeoPreview meta={meta} blocks={blocks} />
        <div className="flex items-center justify-between gap-3"><Label htmlFor="pm-ni" className="text-sm font-normal">Hide from Google<span className="block text-[11px] text-muted-foreground">On for ad-only pages to avoid duplicate content</span></Label><Switch id="pm-ni" checked={meta.noindex} onCheckedChange={(v) => setMeta({ noindex: v })} /></div>
      </S>
    </div>
  );
}

function SeoPreview({ meta, blocks }: { meta: PageMeta; blocks: Block[] }) {
  const desc = meta.metaDescription || autoDescription(blocks);
  const img = meta.ogImage || firstImage(blocks);
  const checks = [
    { ok: meta.metaTitle.length >= 20 && meta.metaTitle.length <= 65, t: "SEO title 20–65 characters" },
    { ok: desc.length >= 70 && desc.length <= 170, t: "Description 70–170 characters" },
    { ok: blocks.filter((b) => b.type === "hero" && !b.hidden).length === 1, t: "One hero (one H1) on the page" },
    { ok: !!img, t: "Share image set" },
    { ok: !blocks.some((b) => (b.props?.image && b.type !== "logos" && !(b.props.imageAlt || b.props.alt)) || (b.props?.items || []).some((i: any) => i?.image && b.type === "gallery" && !i.alt)), t: "Every image has a description (alt)" },
  ];
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="text-xs font-medium text-muted-foreground">Google preview</div>
      <div>
        <div className="truncate text-[12px] text-slate-600">{window.location.host} › {meta.slug}</div>
        <div className="truncate text-[15px] text-[#1a0dab]">{meta.metaTitle || meta.title}</div>
        <p className="line-clamp-2 text-[12px] text-slate-600">{desc || "Add a description so Google shows a good summary."}</p>
      </div>
      {img && <img src={img} alt="" className="h-24 w-full rounded-md object-cover" />}
      <ul className="space-y-1">
        {checks.map((c) => <li key={c.t} className={`flex items-center gap-1.5 text-[11px] ${c.ok ? "text-emerald-700" : "text-amber-700"}`}>{c.ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{c.t}</li>)}
      </ul>
    </div>
  );
}

// ───────────── editor ─────────────
export default function LandingEditorPage() {
  const [, params] = useRoute("/admin/landing-pages/:id");
  const id = params?.id || "";
  const [, nav] = useLocation();
  const { toast } = useToast();
  const q = useQuery<{ data: any }>({ queryKey: [`/api/admin/landing/pages/${id}`], enabled: !!id, refetchOnWindowFocus: false });

  const [meta, setMetaState] = useState<PageMeta | null>(null);
  const [blocks, setBlocksState] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<LandingSettings>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leftTab, setLeftTab] = useState("add");
  const [rightTab, setRightTab] = useState("section");
  const history = useRef<{ past: Block[][]; future: Block[][] }>({ past: [], future: [] });
  const drag = useRef<Drag>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  useEffect(() => {
    const p = q.data?.data;
    if (!p) return;
    setMetaState({
      title: p.title, slug: p.slug, category: p.category, status: p.status, metaTitle: p.metaTitle || "", metaDescription: p.metaDescription || "",
      metaKeywords: p.metaKeywords || "", ogImage: p.ogImage || "", noindex: !!p.noindex,
      canonicalUrl: p.canonicalUrl || "", schemaJson: p.schemaJson || "",
    });
    setBlocksState(Array.isArray(p.blocks) ? p.blocks : []);
    setSettingsState(p.settings || {});
    history.current = { past: [], future: [] };
    setDirty(false);
  }, [q.data]);

  const setBlocks = useCallback((fn: (b: Block[]) => Block[], record = true) => {
    setBlocksState((prev) => {
      const next = fn(prev);
      if (record && next !== prev) { history.current.past.push(prev); if (history.current.past.length > 60) history.current.past.shift(); history.current.future = []; }
      return next;
    });
    setDirty(true);
  }, []);
  const undo = () => { const h = history.current; const prev = h.past.pop(); if (!prev) return; setBlocksState((cur) => { h.future.push(cur); return prev; }); setDirty(true); };
  const redo = () => { const h = history.current; const nxt = h.future.pop(); if (!nxt) return; setBlocksState((cur) => { h.past.push(cur); return nxt; }); setDirty(true); };
  const setMeta = (p: Partial<PageMeta>) => { setMetaState((m) => (m ? { ...m, ...p } : m)); setDirty(true); };
  const setSettings = (p: Partial<LandingSettings>) => { setSettingsState((s) => ({ ...s, ...p })); setDirty(true); };

  // typing in a field shouldn't create an undo step per keystroke: group edits to the same block within 800ms
  const lastEdit = useRef<{ id: string; at: number } | null>(null);
  const updateProps = (bid: string, key: string, v: any) => {
    const now = Date.now();
    const group = lastEdit.current && lastEdit.current.id === `${bid}.${key}` && now - lastEdit.current.at < 800;
    lastEdit.current = { id: `${bid}.${key}`, at: now };
    setBlocks((bs) => bs.map((b) => (b.id === bid ? { ...b, props: { ...b.props, [key]: v } } : b)), !group);
  };

  const insert = (type: BlockType, at?: number) => {
    const b = newBlock(type);
    setBlocks((bs) => { const i = at ?? (selected ? bs.findIndex((x) => x.id === selected) + 1 : bs.length); const n = [...bs]; n.splice(i < 0 ? bs.length : i, 0, b); return n; });
    setSelected(b.id);
    setRightTab("section");
  };
  const moveTo = (bid: string, at: number) => setBlocks((bs) => {
    const from = bs.findIndex((b) => b.id === bid);
    if (from < 0) return bs;
    const n = [...bs];
    const [x] = n.splice(from, 1);
    n.splice(at > from ? at - 1 : at, 0, x);
    return n;
  });
  const moveBy = (bid: string, d: number) => setBlocks((bs) => {
    const i = bs.findIndex((b) => b.id === bid); const j = i + d;
    if (i < 0 || j < 0 || j >= bs.length) return bs;
    const n = [...bs]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const duplicate = (bid: string) => {
    const nb = { ...JSON.parse(JSON.stringify(blocks.find((b) => b.id === bid))), id: Math.random().toString(36).slice(2, 10) };
    setBlocks((bs) => { const i = bs.findIndex((b) => b.id === bid); const n = [...bs]; n.splice(i + 1, 0, nb); return n; });
    setSelected(nb.id);
  };
  const remove = (bid: string) => { setBlocks((bs) => bs.filter((b) => b.id !== bid)); if (selected === bid) setSelected(null); };
  const toggleHidden = (bid: string) => setBlocks((bs) => bs.map((b) => (b.id === bid ? { ...b, hidden: !b.hidden } : b)));

  const save = async (status?: "draft" | "published") => {
    if (!meta) return;
    setSaving(true);
    try {
      const body = { ...meta, status: status || meta.status, blocks, settings };
      const r = await (await apiRequest("PUT", `/api/admin/landing/pages/${id}`, body)).json();
      setMetaState((m) => (m ? { ...m, status: r.data.status, slug: r.data.slug } : m));
      setDirty(false);
      queryClient.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/api/admin/landing/pages?") || String(x.queryKey[0]) === "/api/cms/slugs" });
      queryClient.invalidateQueries({ queryKey: ["/api/cms/slugs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cms/pages", r.data.slug] });
      toast({ title: status === "published" ? "Published" : status === "draft" && meta.status === "published" ? "Unpublished — page is offline" : "Saved", description: status === "published" ? `Live at ${window.location.host}/${r.data.slug}` : undefined });
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // keyboard: Ctrl/Cmd+S save, Ctrl+Z / Ctrl+Shift+Z
  const saveRef = useRef(save); saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); saveRef.current(); }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if (!typing && mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // canvas scale for desktop preview
  const [avail, setAvail] = useState(1000);
  const roRef = useRef<ResizeObserver | null>(null);
  const canvasRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth - 48));
    ro.observe(el);
    roRef.current = ro;
  }, []);
  const frameW = device === "desktop" ? DESKTOP_W : MOBILE_W;
  const scale = Math.min(1, avail / frameW);

  const back = () => { if (dirty && !confirm("You have unsaved changes. Leave without saving?")) return; nav("/admin/landing-pages"); };

  if (q.isLoading || (!meta && !q.error)) return <div className="fixed inset-0 z-50 grid place-items-center bg-white"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (q.error || !meta) return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-white text-center">
      <div><p className="font-medium">This page couldn't be opened.</p><Button className="mt-4" onClick={() => nav("/admin/landing-pages")}>Back to pages</Button></div>
    </div>
  );

  const sel = blocks.find((b) => b.id === selected) || null;
  const ctx = { settings, slug: meta.slug, editing: true, primary: settings.primary || "#08a957" };
  const firstFormId = blocks.find((b) => b.type === "form" && !b.hidden)?.id;
  const groups = BLOCK_TYPES.reduce<Record<string, BlockType[]>>((a, t) => { (a[BLOCKS[t].group] ||= []).push(t); return a; }, {});

  const onDragOverBlock = (e: React.DragEvent, i: number) => {
    if (!drag.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = drag.current.kind === "new" ? "copy" : "move";
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const d = drag.current; const at = dropAt ?? blocks.length;
    drag.current = null; setDropAt(null);
    if (!d) return;
    if (d.kind === "new") insert(d.type, at); else moveTo(d.id, at);
  };
  const endDrag = () => { drag.current = null; setDropAt(null); };
  const Line = () => <div className="pointer-events-none relative z-20 h-0"><div className="absolute inset-x-0 -top-[3px] h-[6px] rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,.25)]" /></div>;

  const canvasBody = (
    <div className="lp" style={landingStyle(settings)} onDragOver={(e) => drag.current && e.preventDefault()} onDrop={onDrop}>
      <LandingCss />
      {blocks.map((b, i) => {
        const node = <LandingBlock block={b} ctx={ctx as any} firstForm={b.id === firstFormId} />;
        if (preview) return b.hidden ? null : <div key={b.id}>{node}</div>;
        const isSel = b.id === selected;
        return (
          <div key={b.id}>
            {dropAt === i && <Line />}
            <div
              className={`relative group/blk ${b.hidden ? "opacity-40" : ""}`}
              onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest?.("[data-lp-toolbar]")) return;
                e.preventDefault(); e.stopPropagation(); setSelected(b.id); setRightTab("section");
              }}
              onDragOver={(e) => onDragOverBlock(e, i)}
              style={{ outline: isSel ? "2px solid #0ea5e9" : undefined, outlineOffset: -2 }}
            >
              <div className="pointer-events-none absolute inset-0 z-10 group-hover/blk:outline group-hover/blk:outline-2 group-hover/blk:-outline-offset-2 group-hover/blk:outline-sky-300" />
              <div className={`absolute left-3 top-3 z-30 flex items-center gap-0.5 rounded-lg bg-slate-900 text-white shadow-lg px-1 py-0.5 text-xs ${isSel ? "flex" : "hidden group-hover/blk:flex"}`}
                data-lp-toolbar="">
                <span draggable onDragStart={(e) => { drag.current = { kind: "move", id: b.id }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.id); }} onDragEnd={endDrag}
                  className="cursor-grab px-1 py-1 active:cursor-grabbing" title="Drag to move"><GripVertical className="h-3.5 w-3.5" /></span>
                <span className="px-1 font-medium">{BLOCKS[b.type].label}{b.hidden ? " (hidden)" : ""}</span>
                {[
                  { l: "Move up", I: ArrowUp, f: () => moveBy(b.id, -1), d: i === 0 },
                  { l: "Move down", I: ArrowDown, f: () => moveBy(b.id, 1), d: i === blocks.length - 1 },
                  { l: "Duplicate", I: Copy, f: () => duplicate(b.id) },
                  { l: b.hidden ? "Show" : "Hide", I: b.hidden ? Eye : EyeOff, f: () => toggleHidden(b.id) },
                  { l: "Delete", I: Trash2, f: () => remove(b.id) },
                ].map(({ l, I, f, d }) => (
                  <button key={l} type="button" title={l} aria-label={l} disabled={d} onClick={(e) => { e.preventDefault(); e.stopPropagation(); f(); }} className="rounded p-1 hover:bg-white/15 disabled:opacity-30"><I className="h-3.5 w-3.5" /></button>
                ))}
              </div>
              {node}
            </div>
          </div>
        );
      })}
      {!preview && dropAt === blocks.length && <Line />}
      {!preview && (
        <div onDragOver={(e) => { if (drag.current) { e.preventDefault(); setDropAt(blocks.length); } }}
          className="m-6 rounded-2xl border-2 border-dashed border-slate-300 py-10 text-center text-sm text-slate-500" style={{ fontFamily: "system-ui, sans-serif" }}>
          {blocks.length ? "Drop a section here, or click one in the left panel" : "Drag a section here to start your page"}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100">
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-white px-3">
        <Button variant="ghost" size="icon" onClick={back} aria-label="Back to pages"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="truncate font-semibold max-w-[260px]">{meta.title}</span>
            {meta.status === "published" ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Live</Badge> : <Badge variant="secondary">Draft</Badge>}
            {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}</div>
          <div className="text-xs text-muted-foreground truncate">{window.location.host}/{meta.slug}</div>
        </div>
        <div className="mx-auto flex items-center gap-1 rounded-lg border p-0.5">
          <Button size="sm" variant={device === "desktop" ? "secondary" : "ghost"} className="h-8" onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"}><Monitor className="mr-1.5 h-4 w-4" />Desktop</Button>
          <Button size="sm" variant={device === "mobile" ? "secondary" : "ghost"} className="h-8" onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"}><Smartphone className="mr-1.5 h-4 w-4" />Mobile</Button>
        </div>
        <Button size="icon" variant="ghost" onClick={undo} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={redo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 className="h-4 w-4" /></Button>
        <Button size="sm" variant={preview ? "secondary" : "outline"} onClick={() => setPreview(!preview)} aria-pressed={preview}><Eye className="mr-1.5 h-4 w-4" />{preview ? "Back to editing" : "Preview"}</Button>
        {meta.status === "published" && <Button size="icon" variant="ghost" asChild aria-label="Open live page"><a href={`/${meta.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>}
        <Button size="sm" variant="outline" onClick={() => save()} disabled={saving}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button>
        {meta.status === "published"
          ? <Button size="sm" variant="outline" onClick={() => save("draft")} disabled={saving}>Unpublish</Button>
          : null}
        <Button size="sm" onClick={() => save("published")} disabled={saving}>{meta.status === "published" ? "Update live page" : "Publish"}</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left: library + layers */}
        {!preview && (
          <aside className="w-64 shrink-0 overflow-y-auto border-r bg-white">
            <Tabs value={leftTab} onValueChange={setLeftTab}>
              <TabsList className="m-2 grid grid-cols-2"><TabsTrigger value="add">Add section</TabsTrigger><TabsTrigger value="layers">On this page</TabsTrigger></TabsList>
              <TabsContent value="add" className="mt-0 space-y-4 px-3 pb-6">
                <p className="text-xs text-muted-foreground">Drag onto the page, or click to add below the selected section.</p>
                {Object.entries(groups).map(([g, types]) => (
                  <div key={g}>
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">{g}</div>
                    <div className="space-y-1.5">
                      {types.map((t) => (
                        <button key={t} type="button" draggable
                          onDragStart={(e) => { drag.current = { kind: "new", type: t }; e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", t); }}
                          onDragEnd={endDrag} onClick={() => insert(t)}
                          className="w-full rounded-lg border bg-white px-3 py-2 text-left hover:border-[var(--brand)] hover:bg-[var(--brand-50,#eafbf2)] cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
                          <div className="flex items-center gap-1.5 text-sm font-medium"><Plus className="h-3.5 w-3.5 text-[var(--brand)]" />{BLOCKS[t].label}</div>
                          <div className="text-[11px] text-muted-foreground leading-snug">{BLOCKS[t].hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="layers" className="mt-0 px-2 pb-6">
                {!blocks.length && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No sections yet.</p>}
                <ol className="space-y-1">
                  {blocks.map((b, i) => (
                    <li key={b.id} draggable
                      onDragStart={(e) => { drag.current = { kind: "move", id: b.id }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", b.id); }}
                      onDragEnd={endDrag}
                      onDragOver={(e) => { if (!drag.current) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1); }}
                      onDrop={onDrop}
                      className={`flex items-center gap-1 rounded-md border px-1.5 py-1.5 text-sm ${selected === b.id ? "border-sky-400 bg-sky-50" : "bg-white"} ${dropAt === i ? "border-t-sky-500 border-t-2" : ""} ${dropAt === i + 1 && i === blocks.length - 1 ? "border-b-sky-500 border-b-2" : ""}`}>
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" />
                      <button type="button" className={`flex-1 truncate text-left ${b.hidden ? "text-muted-foreground line-through" : ""}`} onClick={() => { setSelected(b.id); setRightTab("section"); }}>{BLOCKS[b.type].label}</button>
                      <button type="button" aria-label={b.hidden ? "Show" : "Hide"} onClick={() => toggleHidden(b.id)} className="rounded p-1 hover:bg-muted">{b.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
                    </li>
                  ))}
                </ol>
              </TabsContent>
            </Tabs>
          </aside>
        )}

        {/* canvas */}
        <main ref={canvasRef} className="min-w-0 flex-1 overflow-auto p-6" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
          <div className={`mx-auto ${device === "mobile" ? "rounded-[28px] border-[10px] border-slate-800 overflow-hidden shadow-2xl w-fit" : "shadow-xl rounded-md overflow-hidden w-fit"}`}>
            <Frame key={device} width={frameW} scale={device === "mobile" ? 1 : scale}>{canvasBody}</Frame>
          </div>
        </main>

        {/* right: properties */}
        {!preview && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l bg-white">
            <Tabs value={rightTab} onValueChange={setRightTab}>
              <TabsList className="m-2 grid grid-cols-2"><TabsTrigger value="section">Section</TabsTrigger><TabsTrigger value="page"><Settings2 className="mr-1 h-3.5 w-3.5" />Page settings</TabsTrigger></TabsList>
              <TabsContent value="section" className="mt-0 px-4 pb-8">
                {sel ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div><div className="font-semibold">{BLOCKS[sel.type].label}</div><div className="text-xs text-muted-foreground">{BLOCKS[sel.type].hint}</div></div>
                      <Button size="icon" variant="ghost" aria-label="Delete section" onClick={() => remove(sel.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                    </div>
                    {(BLOCKS[sel.type].fields as FieldDef[]).map((f) => (
                      <Field key={`${sel.id}-${f.key}`} f={f} value={sel.props[f.key]} onChange={(v) => updateProps(sel.id, f.key, v)} uid={sel.id} />
                    ))}
                    {sel.type === "form" && <p className="rounded-md bg-muted p-2.5 text-[11px] text-muted-foreground">Name and phone are always asked. Leads go to Landing Pages → Leads and you get a notification.</p>}
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    <ImagePlus className="mx-auto mb-2 h-6 w-6" />Click a section on the page to edit its text, images and buttons.
                  </div>
                )}
              </TabsContent>
              <TabsContent value="page" className="mt-0 px-4 pb-8">
                <PageSettings meta={meta} setMeta={setMeta} settings={settings} setSettings={setSettings} blocks={blocks} />
              </TabsContent>
            </Tabs>
          </aside>
        )}
      </div>
    </div>
  );
}
