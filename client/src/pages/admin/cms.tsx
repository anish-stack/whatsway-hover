/** Super admin: website CMS — dynamic pages (Jodit editor), policy/SEO pages, header/footer navigation. */
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Pencil, Plus, Star, Trash2, Wand2 } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ICON_NAMES } from "@/hooks/useCms";
import { useTranslation } from "@/lib/i18n";

const JoditEditor = lazy(() => import("jodit-react"));

const PAGE_TYPES = [
  { v: "page", l: "Page" },
  { v: "policy", l: "Policy" },
  { v: "seo", l: "SEO landing page" },
];
const LOCATIONS = [
  { v: "header_main", l: "Header — top link" },
  { v: "header_about", l: "Header — About menu" },
  { v: "header_resources", l: "Header — Resources menu" },
  { v: "footer_product", l: "Footer — Product" },
  { v: "footer_company", l: "Footer — Company" },
  { v: "footer_resources", l: "Footer — Resources" },
  { v: "footer_legal", l: "Footer — Legal" },
  { v: "footer_bottom", l: "Footer — Bottom bar" },
];
const locLabel = (v: string) => LOCATIONS.find((l) => l.v === v)?.l || v;
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const emptyPage = {
  title: "", slug: "", pageType: "page", status: "draft", content: "", excerpt: "", template: "default", showTitle: true,
  metaTitle: "", metaDescription: "", metaKeywords: "", ogImage: "", canonicalUrl: "", noindex: false, schemaJson: "",
};
const emptyNav = { label: "", path: "/", location: "header_about", description: "", icon: "FileText", image: "", sortOrder: 0, isVisible: true, openInNewTab: false };

function invalidate() {
  ["/api/admin/cms/content", "/api/cms/content","/api/admin/cms/pages", "/api/admin/cms/nav", "/api/cms/nav", "/api/cms/slugs", "/api/cms/pages"].forEach((k) =>
    queryClient.invalidateQueries({ queryKey: [k] })
  );
}

/* ───────────────────────── Pages ───────────────────────── */
function PagesTab() {
  const { toast } = useToast();
  const [type, setType] = useState("all");
  const [editing, setEditing] = useState<any | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const editorRef = useRef<any>(null);

  const list = useQuery<any>({
    queryKey: ["/api/admin/cms/pages", type],
    queryFn: async () => (await apiRequest("GET", `/api/admin/cms/pages?type=${type}`)).json(),
  });
  const rows: any[] = list.data?.data || [];

  const open = async (id?: string) => {
    if (!id) { setEditing({ ...emptyPage }); setSlugTouched(false); return; }
    const r = await (await apiRequest("GET", `/api/admin/cms/pages/${id}`)).json();
    setEditing({ ...emptyPage, ...r.data }); setSlugTouched(true);
  };

  const save = useMutation({
    mutationFn: async (p: any) => {
      const body = { ...p };
      delete body.id; delete body.createdAt; delete body.updatedAt;
      for (const k of ["excerpt", "metaTitle", "metaDescription", "metaKeywords", "ogImage", "canonicalUrl", "schemaJson"]) body[k] = body[k] || null;
      return (await apiRequest(p.id ? "PUT" : "POST", p.id ? `/api/admin/cms/pages/${p.id}` : "/api/admin/cms/pages", body)).json();
    },
    onSuccess: () => { toast({ title: "Page saved" }); setEditing(null); invalidate(); },
    onError: (e: any) => toast({ title: "Save failed", description: e.message?.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/cms/pages/${id}`),
    onSuccess: () => { toast({ title: "Page deleted" }); invalidate(); },
  });

  const config = useMemo(
    () => ({
      readonly: false, height: 480, toolbarAdaptive: true, askBeforePasteHTML: false, defaultActionOnPaste: "insert_clear_html",
      uploader: { insertImageAsBase64URI: true }, placeholder: "Write page content…",
    }),
    []
  );
  const set = (k: string, v: any) => setEditing((p: any) => ({ ...p, [k]: v }));

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Pages</CardTitle>
          <div className="flex gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {PAGE_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => open()}><Plus className="mr-1 h-4 w-4" /> New page</Button>
          </div>
        </CardHeader>
        <CardContent>
          {list.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No pages yet. Create <b>about</b>, <b>contact</b>, <b>careers</b>, <b>privacy-policy</b>… A published CMS page replaces the built-in page with the same URL.
            </div>
          ) : (
            <div className="divide-y rounded-xl border">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">/{r.slug} · {r.pageType}{r.noindex ? " · noindex" : ""}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${r.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{r.status}</span>
                  {r.status === "published" && (
                    <a href={`/${r.slug}`} target="_blank" rel="noreferrer" aria-label="View"><ExternalLink className="h-4 w-4 text-muted-foreground" /></a>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => open(r.id)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm(`Delete "${r.title}"?`) && del.mutate(r.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit page" : "New page"}</DialogTitle></DialogHeader>
          {editing && (
            <Tabs defaultValue="content">
              <TabsList>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-4 pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Title</Label>
                    <Input value={editing.title} onChange={(e) => { set("title", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} />
                  </div>
                  <div>
                    <Label>URL slug</Label>
                    <div className="flex items-center gap-1"><span className="text-sm text-muted-foreground">/</span>
                      <Input value={editing.slug} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }} /></div>
                  </div>
                </div>
                <div>
                  <Label>Content</Label>
                  <Suspense fallback={<div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
                    <JoditEditor ref={editorRef} value={editing.content} config={config as any} onBlur={(v: string) => set("content", v)} />
                  </Suspense>
                </div>
              </TabsContent>

              <TabsContent value="seo" className="space-y-4 pt-3">
                <div>
                  <Label>Meta title <span className="text-xs text-muted-foreground">({(editing.metaTitle || "").length}/60)</span></Label>
                  <Input value={editing.metaTitle || ""} onChange={(e) => set("metaTitle", e.target.value)} placeholder={editing.title} />
                </div>
                <div>
                  <Label>Meta description <span className="text-xs text-muted-foreground">({(editing.metaDescription || "").length}/160)</span></Label>
                  <Textarea rows={3} value={editing.metaDescription || ""} onChange={(e) => set("metaDescription", e.target.value)} />
                </div>
                <div><Label>Keywords (comma separated)</Label><Input value={editing.metaKeywords || ""} onChange={(e) => set("metaKeywords", e.target.value)} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label>Social image URL (og:image)</Label><Input value={editing.ogImage || ""} onChange={(e) => set("ogImage", e.target.value)} /></div>
                  <div><Label>Canonical URL</Label><Input value={editing.canonicalUrl || ""} onChange={(e) => set("canonicalUrl", e.target.value)} placeholder="https://…" /></div>
                </div>
                <div className="flex items-center gap-2"><Switch checked={editing.noindex} onCheckedChange={(v) => set("noindex", v)} /><Label>Hide from search engines (noindex)</Label></div>
                <div>
                  <Label>Structured data (JSON-LD, optional)</Label>
                  <Textarea rows={5} className="font-mono text-xs" value={editing.schemaJson || ""} onChange={(e) => set("schemaJson", e.target.value)} placeholder='{"@context":"https://schema.org","@type":"WebPage"}' />
                </div>
              </TabsContent>

              <TabsContent value="settings" className="space-y-4 pt-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Type</Label>
                    <Select value={editing.pageType} onValueChange={(v) => { set("pageType", v); if (v === "policy") set("template", "legal"); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PAGE_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Layout</Label>
                    <Select value={editing.template} onValueChange={(v) => set("template", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default (narrow)</SelectItem>
                        <SelectItem value="full">Wide</SelectItem>
                        <SelectItem value="legal">Legal / policy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={editing.status} onValueChange={(v) => set("status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="published">Published</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Short summary (shown under title)</Label><Input value={editing.excerpt || ""} onChange={(e) => set("excerpt", e.target.value)} /></div>
                <div className="flex items-center gap-2"><Switch checked={editing.showTitle} onCheckedChange={(v) => set("showTitle", v)} /><Label>Show page title on the page</Label></div>
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={save.isPending || !editing?.title || !editing?.slug}
              onClick={() => save.mutate({ ...editing, content: editorRef.current?.value ?? editing.content })}
            >
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────────────────── Navigation ───────────────────────── */
function NavTab() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<any | null>(null);
  const list = useQuery<any>({
    queryKey: ["/api/admin/cms/nav"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/cms/nav")).json(),
  });
  const rows: any[] = list.data?.data || [];
  const pages = useQuery<any>({
    queryKey: ["/api/admin/cms/pages", "all"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/cms/pages?type=all")).json(),
  });

  const save = useMutation({
    mutationFn: async (n: any) => {
      const body = { ...n }; delete body.id; delete body.createdAt; delete body.updatedAt;
      body.sortOrder = Number(body.sortOrder) || 0;
      body.description = body.description || null; body.image = body.image || null;
      return (await apiRequest(n.id ? "PUT" : "POST", n.id ? `/api/admin/cms/nav/${n.id}` : "/api/admin/cms/nav", body)).json();
    },
    onSuccess: () => { toast({ title: "Menu item saved" }); setEditing(null); invalidate(); },
    onError: (e: any) => toast({ title: "Save failed", description: e.message?.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/cms/nav/${id}`),
    onSuccess: invalidate,
  });
  const toggle = useMutation({
    mutationFn: async (n: any) => apiRequest("PUT", `/api/admin/cms/nav/${n.id}`, {
      label: n.label, path: n.path, location: n.location, description: n.description, icon: n.icon, image: n.image,
      sortOrder: n.sortOrder, isVisible: !n.isVisible, openInNewTab: n.openInNewTab,
    }),
    onSuccess: invalidate,
  });
  const seed = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/cms/nav/seed-defaults")).json(),
    onSuccess: () => { toast({ title: "Default menus imported" }); invalidate(); },
    onError: (e: any) => toast({ title: "Import failed", description: e.message?.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  const grouped = LOCATIONS.map((l) => ({ ...l, items: rows.filter((r) => r.location === l.v) })).filter((g) => g.items.length);
  const set = (k: string, v: any) => setEditing((p: any) => ({ ...p, [k]: v }));
  const isMega = editing && (editing.location === "header_about" || editing.location === "header_resources");

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Header &amp; footer navigation</CardTitle>
          <div className="flex gap-2">
            {rows.length === 0 && (
              <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}><Wand2 className="mr-1 h-4 w-4" /> Import current menus</Button>
            )}
            <Button onClick={() => setEditing({ ...emptyNav })}><Plus className="mr-1 h-4 w-4" /> Add item</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Menus are using built-in defaults. Click <b>Import current menus</b> to edit them here. Once a section has items, the website uses these instead of the defaults.
            </div>
          ) : grouped.map((g) => (
            <div key={g.v}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.l}</p>
              <div className="divide-y rounded-xl border">
                {g.items.map((n) => (
                  <div key={n.id} className="flex items-center gap-3 p-3">
                    <span className="w-8 text-center text-xs tabular-nums text-muted-foreground">{n.sortOrder}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{n.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{n.path}{n.openInNewTab ? " · new tab" : ""}</p>
                    </div>
                    <Switch checked={n.isVisible} onCheckedChange={() => toggle.mutate(n)} aria-label="Visible" />
                    <Button size="icon" variant="ghost" onClick={() => setEditing({ ...emptyNav, ...n })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => confirm(`Remove "${n.label}"?`) && del.mutate(n.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Sections with no items fall back to the built-in menu. To hide a whole section, add an item and switch it off.</p>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit menu item" : "Add menu item"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Label</Label><Input value={editing.label} onChange={(e) => set("label", e.target.value)} /></div>
              <div>
                <Label>Link</Label>
                <Input value={editing.path} onChange={(e) => set("path", e.target.value)} placeholder="/about or https://…" list="cms-page-paths" />
                <datalist id="cms-page-paths">
                  {(pages.data?.data || []).map((p: any) => <option key={p.id} value={`/${p.slug}`}>{p.title}</option>)}
                </datalist>
              </div>
              <div>
                <Label>Where</Label>
                <Select value={editing.location} onValueChange={(v) => set("location", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LOCATIONS.map((l) => <SelectItem key={l.v} value={l.v}>{l.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {isMega && (
                <>
                  <div><Label>Description</Label><Input value={editing.description || ""} onChange={(e) => set("description", e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Icon</Label>
                      <Select value={editing.icon || "FileText"} onValueChange={(v) => set("icon", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ICON_NAMES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Image URL</Label><Input value={editing.image || ""} onChange={(e) => set("image", e.target.value)} /></div>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Order</Label><Input type="number" value={editing.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></div>
                <div className="flex items-end gap-2 pb-2"><Switch checked={editing.openInNewTab} onCheckedChange={(v) => set("openInNewTab", v)} /><Label>New tab</Label></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={editing.isVisible} onCheckedChange={(v) => set("isVisible", v)} /><Label>Visible</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={save.isPending || !editing?.label || !editing?.path} onClick={() => save.mutate(editing)}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ───────────────────────── Site content: stats / FAQs / testimonials ───────────────────────── */
const GROUPS = [
  { key: "hero", kind: "stat", label: "Home — hero stats", hint: "Top of home page. Value animates when it is a number (e.g. 50000) — put the symbol in Suffix (+, %, x)." },
  { key: "testimonials_grid", kind: "stat", label: "Home — testimonials stats", hint: "Row under testimonials. Put full text in Value (e.g. 10,000+, 24/7)." },
  { key: "cta", kind: "stat", label: "Home — bottom CTA stats", hint: "Dark strip at the end of the home page." },
  { key: "about_mission", kind: "stat", label: "About page — mission stats", hint: "Two boxes in the mission section." },
  { key: "testimonials", kind: "testimonial", label: "Testimonials", hint: "Customer reviews carousel on the home page." },
  { key: "pricing", kind: "faq", label: "Pricing FAQ", hint: "FAQ under the pricing plans." },
  { key: "contact", kind: "faq", label: "Contact page FAQ", hint: "FAQ on the contact page." },
] as const;

const emptyItem = { title: "", body: "", value: "", suffix: "", role: "", company: "", image: "", rating: 5, results: "", icon: "", sortOrder: 0, isVisible: true };

function ContentTab() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [group, setGroup] = useState<string>(GROUPS[0].key);
  const [editing, setEditing] = useState<any | null>(null);
  const g = GROUPS.find((x) => x.key === group)!;

  const list = useQuery<any>({
    queryKey: ["/api/admin/cms/content", group],
    queryFn: async () => (await apiRequest("GET", `/api/admin/cms/content?group=${group}`)).json(),
  });
  const rows: any[] = list.data?.data || [];

  const save = useMutation({
    mutationFn: async (it: any) => {
      const body: any = { ...it, kind: g.kind, groupKey: group, rating: Number(it.rating) || 5, sortOrder: Number(it.sortOrder) || 0 };
      delete body.id; delete body.createdAt; delete body.updatedAt;
      for (const k of ["body", "value", "suffix", "role", "company", "image", "results", "icon"]) body[k] = body[k] || null;
      return (await apiRequest(it.id ? "PUT" : "POST", it.id ? `/api/admin/cms/content/${it.id}` : "/api/admin/cms/content", body)).json();
    },
    onSuccess: () => { toast({ title: "Saved" }); setEditing(null); invalidate(); },
    onError: (e: any) => toast({ title: "Save failed", description: e.message?.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });
  const del = useMutation({ mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/cms/content/${id}`), onSuccess: invalidate });
  const toggle = useMutation({
    mutationFn: async (r: any) => {
      const body: any = { ...r, isVisible: !r.isVisible }; delete body.id; delete body.createdAt; delete body.updatedAt;
      return apiRequest("PUT", `/api/admin/cms/content/${r.id}`, body);
    },
    onSuccess: invalidate,
  });

  // Build the site's current built-in content for this group, so the admin can edit instead of retyping.
  const defaults = (): any[] => {
    const arr = (k: string) => (t(k) as unknown as any[]) || [];
    switch (group) {
      case "hero":
        return [
          { title: t("Landing.heroSec.stats.0.label"), value: "50000", suffix: "+", icon: "Users" },
          { title: t("Landing.heroSec.stats.1.label"), value: "98", suffix: t("Landing.heroSec.stats.1.suffix"), icon: "TrendingUp" },
          { title: t("Landing.heroSec.stats.2.label"), value: "5", suffix: t("Landing.heroSec.stats.2.suffix"), icon: "Zap" },
        ];
      case "testimonials_grid": return arr("Landing.testimonialsSec.statsGrid").map((s) => ({ title: s.label, value: s.number }));
      case "cta": return arr("Landing.ctaSec.stats").map((s) => ({ title: s.label, value: s.number }));
      case "about_mission":
        return [
          { title: t("aboutUs.mission.stats.businessesLabel"), value: t("aboutUs.mission.stats.businesses") },
          { title: t("aboutUs.mission.stats.messagesLabel"), value: t("aboutUs.mission.stats.messages") },
        ];
      case "testimonials":
        return arr("Landing.testimonialsSec.testimonials").map((x) => ({ title: x.name, role: x.role, company: x.company, image: x.image, rating: x.rating, body: x.text, results: x.results }));
      case "pricing": return arr("Landing.pricingSec.faq.questions").map((x) => ({ title: x.q, body: x.a }));
      case "contact": return arr("contactUs.faq.questions").map((x) => ({ title: x.q, body: x.a }));
    }
    return [];
  };
  const importDefaults = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/cms/content/import", { groupKey: group, items: defaults() })).json(),
    onSuccess: () => { toast({ title: "Current content imported" }); invalidate(); },
    onError: (e: any) => toast({ title: "Import failed", description: e.message?.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  const set = (k: string, v: any) => setEditing((p: any) => ({ ...p, [k]: v }));
  const primary = (r: any) => (g.kind === "stat" ? `${r.value || ""}${r.suffix || ""} — ${r.title}` : r.title);

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Stats, FAQs &amp; testimonials</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{g.hint}</p>
          </div>
          <div className="flex gap-2">
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{GROUPS.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => setEditing({ ...emptyItem, sortOrder: rows.length + 1 })}><Plus className="mr-1 h-4 w-4" /> Add</Button>
          </div>
        </CardHeader>
        <CardContent>
          {list.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              <p>Website is showing built-in text for this section.</p>
              <Button className="mt-3" variant="outline" onClick={() => importDefaults.mutate()} disabled={importDefaults.isPending}>
                <Wand2 className="mr-1 h-4 w-4" /> Import current content to edit
              </Button>
            </div>
          ) : (
            <div className="divide-y rounded-xl border">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3">
                  <span className="w-8 text-center text-xs tabular-nums text-muted-foreground">{r.sortOrder}</span>
                  {g.kind === "testimonial" && r.image && <img src={r.image} alt="" className="h-9 w-9 rounded-lg object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{primary(r)}</p>
                    {g.kind === "faq" && <p className="truncate text-xs text-muted-foreground">{r.body}</p>}
                    {g.kind === "testimonial" && <p className="truncate text-xs text-muted-foreground">{r.role} · {r.company} · {"★".repeat(r.rating)}</p>}
                  </div>
                  <Switch checked={r.isVisible} onCheckedChange={() => toggle.mutate(r)} aria-label="Visible" />
                  <Button size="icon" variant="ghost" onClick={() => setEditing({ ...emptyItem, ...r })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => confirm("Delete this item?") && del.mutate(r.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">If every item in a section is deleted, the website goes back to its built-in text. To hide a section's items without that, switch them off one by one only when at least one stays visible.</p>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "Add"} — {g.label}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              {g.kind === "stat" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Value</Label><Input value={editing.value || ""} onChange={(e) => set("value", e.target.value)} placeholder="50000 or 10,000+" /></div>
                    <div><Label>Suffix</Label><Input value={editing.suffix || ""} onChange={(e) => set("suffix", e.target.value)} placeholder="+ % x" /></div>
                  </div>
                  <div><Label>Label</Label><Input value={editing.title} onChange={(e) => set("title", e.target.value)} placeholder="Active Users" /></div>
                  {group === "hero" && (
                    <div>
                      <Label>Icon</Label>
                      <Select value={editing.icon || "Users"} onValueChange={(v) => set("icon", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ICON_NAMES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
              {g.kind === "faq" && (
                <>
                  <div><Label>Question</Label><Input value={editing.title} onChange={(e) => set("title", e.target.value)} /></div>
                  <div><Label>Answer</Label><Textarea rows={5} value={editing.body || ""} onChange={(e) => set("body", e.target.value)} /></div>
                </>
              )}
              {g.kind === "testimonial" && (
                <>
                  <div><Label>Customer name</Label><Input value={editing.title} onChange={(e) => set("title", e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Role</Label><Input value={editing.role || ""} onChange={(e) => set("role", e.target.value)} /></div>
                    <div><Label>Company</Label><Input value={editing.company || ""} onChange={(e) => set("company", e.target.value)} /></div>
                  </div>
                  <div><Label>Review</Label><Textarea rows={4} value={editing.body || ""} onChange={(e) => set("body", e.target.value)} /></div>
                  <div><Label>Result badge (optional)</Label><Input value={editing.results || ""} onChange={(e) => set("results", e.target.value)} placeholder="300% increase in cart recovery" /></div>
                  <div><Label>Photo URL</Label><Input value={editing.image || ""} onChange={(e) => set("image", e.target.value)} placeholder="https://…" /></div>
                  <div>
                    <Label>Rating</Label>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" onClick={() => set("rating", n)} aria-label={`${n} stars`}>
                          <Star className={`h-5 w-5 ${n <= editing.rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Order</Label><Input type="number" value={editing.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></div>
                <div className="flex items-end gap-2 pb-2"><Switch checked={editing.isVisible} onCheckedChange={(v) => set("isVisible", v)} /><Label>Visible</Label></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={save.isPending || !editing?.title} onClick={() => save.mutate(editing)}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CmsAdminPage() {
  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Website CMS" subtitle="Pages, policies, SEO, navigation, stats, FAQs and testimonials of the public website" />
      <main className="space-y-6 p-4 sm:p-6">
        <Tabs defaultValue="pages">
          <TabsList>
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="nav">Navigation</TabsTrigger>
            <TabsTrigger value="content">Stats, FAQ &amp; Reviews</TabsTrigger>
          </TabsList>
          <TabsContent value="pages" className="pt-4"><PagesTab /></TabsContent>
          <TabsContent value="nav" className="pt-4"><NavTab /></TabsContent>
          <TabsContent value="content" className="pt-4"><ContentTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
