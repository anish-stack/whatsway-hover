import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LANDING_CATEGORIES } from "@shared/landing";
import { CATEGORY_ICON, LandingIcon } from "@/components/landing/LandingRenderer";
import { Copy, Download, ExternalLink, Eye, Loader2, MousePointerClick, Pencil, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80);
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const rate = (v: number, l: number) => (v ? `${((l / v) * 100).toFixed(1)}%` : "—");

function NewPageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [, nav] = useLocation();
  const { toast } = useToast();
  const tpls = useQuery<{ data: any[] }>({ queryKey: ["/api/admin/landing/templates"], enabled: open });
  const [tpl, setTpl] = useState("blank");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState("");
  useEffect(() => { if (!open) { setTpl("blank"); setTitle(""); setSlug(""); setSlugTouched(false); setCategory(""); } }, [open]);
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/landing/pages", { title, slug, category: category || null, template: tpl })).json(),
    onSuccess: (j) => { queryClient.invalidateQueries({ queryKey: ["/api/admin/landing/pages"] }); onOpenChange(false); nav(`/admin/landing-pages/${j.data.id}`); },
    onError: (e: any) => toast({ title: "Couldn't create the page", description: e.message, variant: "destructive" }),
  });
  const pick = (t: any) => {
    setTpl(t.key);
    if (t.category && t.category !== "Other") setCategory(t.category);
    const known = tpls.data?.data.some((x) => x.name === title || x.title === title);
    if (!title || known) {
      const nt = t.key === "blank" ? "" : t.title || t.name;
      setTitle(nt);
      if (!slugTouched) setSlug(t.key === "blank" ? "" : t.slug || slugify(nt));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New landing page</DialogTitle>
          <DialogDescription>Pick a starting point. Every section can be changed, moved or removed in the builder.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(tpls.data?.data || []).map((t) => (
            <button key={t.key} type="button" onClick={() => pick(t)}
              className={`text-left rounded-xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${tpl === t.key ? "border-[var(--brand)] bg-[var(--brand-50,#eafbf2)]" : "hover:border-slate-300"}`}>
              <div className="flex items-center gap-2 font-medium"><LandingIcon name={CATEGORY_ICON[t.category] || "Sparkles"} className="h-4 w-4 text-[var(--brand)]" />{t.name}</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{t.description}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{t.sections} sections{t.complete ? " · images, SEO and copy ready" : ""}</p>
            </button>
          ))}
          {tpls.isLoading && <div className="col-span-full py-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="np-title">Page name</Label>
            <Input id="np-title" value={title} onChange={(e) => { setTitle(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} placeholder="WhatsApp for clinics" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-slug">Page address</Label>
            <div className="flex items-center rounded-md border focus-within:ring-2 focus-within:ring-ring">
              <span className="pl-3 text-sm text-muted-foreground select-none">{window.location.host}/</span>
              <input id="np-slug" className="flex-1 bg-transparent px-1 py-2 text-sm outline-none" value={slug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} placeholder="whatsapp-for-clinics" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category || "none"} onValueChange={(v) => setCategory(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {LANDING_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Pages with a category appear in the "Industry pages grid" section.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || title.trim().length < 2 || slug.length < 2}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create and open builder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PagesTab() {
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const [del, setDel] = useState<any>(null);
  const params = new URLSearchParams();
  if (cat !== "all") params.set("category", cat);
  if (status !== "all") params.set("status", status);
  const pages = useQuery<{ data: any[] }>({ queryKey: [`/api/admin/landing/pages?${params}`] });
  const rows = useMemo(() => (pages.data?.data || []).filter((p) => !q || `${p.title} ${p.slug}`.toLowerCase().includes(q.toLowerCase())), [pages.data, q]);
  const totals = rows.reduce((a, p) => ({ views: a.views + p.views, leads: a.leads + p.leads, live: a.live + (p.status === "published" ? 1 : 0) }), { views: 0, leads: 0, live: 0 });
  const refresh = () => queryClient.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/api/admin/landing/pages") });
  const dup = useMutation({
    mutationFn: async (id: string) => (await apiRequest("POST", `/api/admin/landing/pages/${id}/duplicate`)).json(),
    onSuccess: () => { refresh(); toast({ title: "Copy created as a draft" }); },
    onError: (e: any) => toast({ title: "Couldn't duplicate", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/landing/pages/${id}`)).json(),
    onSuccess: () => { refresh(); setDel(null); toast({ title: "Page deleted" }); },
    onError: (e: any) => toast({ title: "Couldn't delete", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Live pages", totals.live, Eye], ["Visits", totals.views, MousePointerClick], ["Leads", totals.leads, Users]].map(([l, v, I]: any) => (
          <Card key={l} className="rounded-2xl"><CardContent className="p-4 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl grid place-items-center bg-[var(--brand-50,#eafbf2)] text-[var(--brand)]"><I className="h-5 w-5" /></span>
            <div><div className="text-2xl font-semibold tabular-nums">{Number(v).toLocaleString("en-IN")}</div><div className="text-xs text-muted-foreground">{l}{l === "Leads" && totals.views ? ` · ${rate(totals.views, totals.leads)} conversion` : ""}</div></div>
          </CardContent></Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search pages" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem>{LANDING_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="draft">Draft</SelectItem></SelectContent>
        </Select>
        <Button onClick={() => setNewOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New page</Button>
      </div>

      {pages.isLoading ? <div className="py-16 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
        : !rows.length ? (
          <Card className="rounded-2xl border-dashed"><CardContent className="py-14 text-center">
            <p className="font-medium">No landing pages yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Create pages for each industry or ad campaign — Healthcare, E-commerce, Real estate…</p>
            <Button className="mt-5" onClick={() => setNewOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Create your first page</Button>
          </CardContent></Card>
        ) : (
          <Card className="rounded-2xl overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="px-4 py-3 font-medium">Page</th><th className="px-4 py-3 font-medium">Category</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium text-right">Visits</th><th className="px-4 py-3 font-medium text-right">Leads</th><th className="px-4 py-3 font-medium text-right">Conv.</th><th className="px-4 py-3 font-medium">Updated</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <button className="font-medium hover:underline text-left" onClick={() => nav(`/admin/landing-pages/${p.id}`)}>{p.title}</button>
                      <div className="text-xs text-muted-foreground">/{p.slug}{p.hideChrome ? " · ad page (no menu)" : ""}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category || "—"}</td>
                    <td className="px-4 py-3">{p.status === "published" ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Published</Badge> : <Badge variant="secondary">Draft</Badge>}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.views.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.leads.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{rate(p.views, p.leads)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmt(p.updatedAt)}{p.updatedByName ? <div>by {p.updatedByName}</div> : null}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => nav(`/admin/landing-pages/${p.id}`)}><Pencil className="h-4 w-4" /></Button>
                        {p.status === "published" && <Button size="icon" variant="ghost" aria-label="Open live page" asChild><a href={`/${p.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>}
                        <Button size="icon" variant="ghost" aria-label="Duplicate" onClick={() => dup.mutate(p.id)} disabled={dup.isPending}><Copy className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setDel(p)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></Card>
        )}
      <NewPageDialog open={newOpen} onOpenChange={setNewOpen} />
      <AlertDialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{del?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>The page goes offline at /{del?.slug} right away. Its leads stay in the Leads tab. Ads pointing here will show a 404.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep page</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => remove.mutate(del.id)}>Delete page</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const LEAD_STATUS: Record<string, string> = { new: "New", contacted: "Contacted", won: "Won", lost: "Lost" };
function LeadsTab() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [pageId, setPageId] = useState("all");
  const [status, setStatus] = useState("all");
  const pages = useQuery<{ data: any[] }>({ queryKey: ["/api/admin/landing/pages?"] });
  const params = new URLSearchParams();
  if (pageId !== "all") params.set("pageId", pageId);
  if (status !== "all") params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  const leads = useQuery<{ data: any[] }>({ queryKey: [`/api/admin/landing/leads?${params}`] });
  const upd = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => (await apiRequest("PATCH", `/api/admin/landing/leads/${id}`, { status })).json(),
    onSuccess: () => leads.refetch(),
    onError: (e: any) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Name, phone, email, company" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={pageId} onValueChange={setPageId}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All pages</SelectItem>{(pages.data?.data || []).map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Any status</SelectItem>{Object.entries(LEAD_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" asChild><a href={`/api/admin/landing/leads.csv?${params}`}><Download className="mr-1.5 h-4 w-4" />Export CSV</a></Button>
      </div>
      {leads.isLoading ? <div className="py-16 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
        : !leads.data?.data.length ? <Card className="rounded-2xl border-dashed"><CardContent className="py-14 text-center text-sm text-muted-foreground">No leads yet. Add a "Lead form" section to a published page — every enquiry lands here and you get notified.</CardContent></Card>
        : (
          <Card className="rounded-2xl overflow-hidden"><div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="px-4 py-3 font-medium">Received</th><th className="px-4 py-3 font-medium">Contact</th><th className="px-4 py-3 font-medium">Details</th><th className="px-4 py-3 font-medium">Page & source</th><th className="px-4 py-3 font-medium">Status</th></tr>
              </thead>
              <tbody className="divide-y">
                {leads.data.data.map((l) => {
                  const u = l.utm || {};
                  const src = u.gclid ? "Google Ads" : u.fbclid ? "Meta Ads" : u.utm_source ? [u.utm_source, u.utm_medium].filter(Boolean).join(" / ") : "Direct";
                  return (
                    <tr key={l.id} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">{fmt(l.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{l.name}</div>
                        <a className="text-xs text-[var(--brand)] hover:underline" href={`https://wa.me/${String(l.phone).replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{l.phone}</a>
                        {l.email && <div className="text-xs text-muted-foreground">{l.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[280px]">
                        {[l.company, l.city, l.service].filter(Boolean).join(" · ") || "—"}
                        {l.message && <p className="mt-1 text-muted-foreground line-clamp-3">{l.message}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs"><div>{l.pageTitle || `/${l.slug}`}</div><div className="text-muted-foreground">{src}{u.utm_campaign ? ` · ${u.utm_campaign}` : ""}</div></td>
                      <td className="px-4 py-3">
                        <Select value={l.status} onValueChange={(v) => upd.mutate({ id: l.id, status: v })}>
                          <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(LEAD_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div></Card>
        )}
    </div>
  );
}

function EditorsTab() {
  const { toast } = useToast();
  const list = useQuery<{ data: any[] }>({ queryKey: ["/api/admin/landing/editors"] });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", username: "", password: "" });
  const [del, setDel] = useState<any>(null);
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/landing/editors", f)).json(),
    onSuccess: () => { list.refetch(); setOpen(false); setF({ firstName: "", lastName: "", email: "", username: "", password: "" }); toast({ title: "Editor added", description: "Share the username and password with them. They sign in on the normal login page." }); },
    onError: (e: any) => toast({ title: "Couldn't add editor", description: e.message, variant: "destructive" }),
  });
  const upd = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => (await apiRequest("PATCH", `/api/admin/landing/editors/${id}`, body)).json(),
    onSuccess: () => list.refetch(),
    onError: (e: any) => toast({ title: "Couldn't update", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/landing/editors/${id}`)).json(),
    onSuccess: (j) => { list.refetch(); setDel(null); toast({ title: j.deactivated ? "Editor deactivated" : "Editor removed" }); },
    onError: (e: any) => toast({ title: "Couldn't remove", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-xl">Editors can create, edit and publish landing pages and see leads. They can't open anything else in the admin panel.</p>
        <Button onClick={() => setOpen(true)}><UserPlus className="mr-1.5 h-4 w-4" />Add editor</Button>
      </div>
      {list.isLoading ? <div className="py-12 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
        : !list.data?.data.length ? <Card className="rounded-2xl border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">No editors yet. Add your marketing team so they can build pages for your campaigns.</CardContent></Card>
        : (
          <Card className="rounded-2xl divide-y">
            {list.data.data.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="h-10 w-10 rounded-full grid place-items-center bg-[var(--brand-50,#eafbf2)] text-[var(--brand)] font-semibold">{(u.firstName || u.username).slice(0, 1).toUpperCase()}</span>
                <div className="flex-1 min-w-[180px]">
                  <div className="font-medium">{[u.firstName, u.lastName].filter(Boolean).join(" ")} <span className="text-xs text-muted-foreground">@{u.username}</span></div>
                  <div className="text-xs text-muted-foreground">{u.email} · last sign-in {fmt(u.lastLogin)}</div>
                </div>
                {u.status === "active" ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Active</Badge> : <Badge variant="secondary">Paused</Badge>}
                <Button size="sm" variant="outline" onClick={() => upd.mutate({ id: u.id, body: { status: u.status === "active" ? "inactive" : "active" } })}>{u.status === "active" ? "Pause access" : "Restore access"}</Button>
                <Button size="icon" variant="ghost" aria-label="Remove editor" onClick={() => setDel(u)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </div>
            ))}
          </Card>
        )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add website editor</DialogTitle><DialogDescription>They sign in with this username or email and the password you set.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="ed-fn">First name</Label><Input id="ed-fn" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ed-ln">Last name</Label><Input id="ed-ln" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="ed-em">Email</Label><Input id="ed-em" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value, username: f.username || e.target.value.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "") })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ed-un">Username</Label><Input id="ed-un" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} /></div>
            <div className="space-y-1.5"><Label htmlFor="ed-pw">Password</Label><Input id="ed-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /><p className="text-[11px] text-muted-foreground">8+ characters with a letter and a number</p></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add editor</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove {del?.firstName || del?.username}?</AlertDialogTitle><AlertDialogDescription>They lose access right away. Pages they built stay.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => remove.mutate(del.id)}>Remove editor</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function LandingPagesPage() {
  const meQ = useQuery<{ data: { canManageEditors: boolean } }>({ queryKey: ["/api/admin/landing/me"] });
  const initial = new URLSearchParams(window.location.search).get("tab") || "pages";
  const [tab, setTab] = useState(initial);
  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Landing Pages" subtitle="Build industry and ad-campaign pages with drag-and-drop sections, and collect leads" />
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-5">
            <TabsTrigger value="pages">Pages</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            {meQ.data?.data.canManageEditors && <TabsTrigger value="editors">Editors</TabsTrigger>}
          </TabsList>
          <TabsContent value="pages"><PagesTab /></TabsContent>
          <TabsContent value="leads"><LeadsTab /></TabsContent>
          {meQ.data?.data.canManageEditors && <TabsContent value="editors"><EditorsTab /></TabsContent>}
        </Tabs>
      </main>
    </div>
  );
}
