import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Lock, MessageSquareQuote, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useCanned } from "@/components/canned/CannedPicker";
import { CANNED_VARS, fillCanned, type CannedMessage } from "@/components/canned/canned";

const j = async (method: string, url: string, body?: any) => (await apiRequest(method, url, body)).json();
const PRESET_CATS = ["Sales", "Support", "Billing", "General"];
type Draft = { id?: string; title: string; shortcut: string; category: string; content: string; shared: boolean };

const STARTERS: Draft[] = [
  { title: "Welcome", shortcut: "welcome", category: "General", shared: true, content: "Hi {{customer_name}} 👋 Thanks for reaching out to {{business_name}}! I'm {{agent_name}}. How can I help you today?" },
  { title: "Thank you", shortcut: "thanks", category: "General", shared: true, content: "Thank you {{customer_first_name}}! 🙏 Let us know if you need anything else." },
  { title: "Price list", shortcut: "price", category: "Sales", shared: true, content: "Here's our latest price list, {{customer_first_name}}. Tell me what you're looking for and I'll suggest the best option." },
  { title: "Payment received", shortcut: "paid", category: "Billing", shared: true, content: "Payment received, thank you {{customer_name}}! ✅ Your receipt will reach you shortly." },
];

export default function CannedMessagesPage() {
  const { toast } = useToast();
  const list = useCanned();
  const rows: CannedMessage[] = list.data?.data || [];
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [edit, setEdit] = useState<Draft | null>(null);
  const cats = useMemo(() => ["All", ...Array.from(new Set([...rows.map((r) => r.category)]))], [rows]);
  const shown = rows.filter((r) => (cat === "All" || r.category === cat) && (!q || `${r.title} ${r.shortcut} ${r.content}`.toLowerCase().includes(q.toLowerCase())));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/canned-messages"] });
  const del = useMutation({
    mutationFn: (id: string) => j("DELETE", `/api/canned-messages/${id}`),
    onSuccess: () => { refresh(); toast({ title: "Saved reply deleted" }); },
    onError: (e: any) => toast({ title: "Couldn't delete", description: e?.message, variant: "destructive" }),
  });
  const addStarters = useMutation({
    mutationFn: async () => { for (const s of STARTERS) { try { await j("POST", "/api/canned-messages", s); } catch { /* shortcut taken */ } } },
    onSuccess: () => { refresh(); toast({ title: "Starter replies added" }); },
  });

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Saved replies" subtitle="Canned messages your team inserts in chats by typing / and a shortcut" />
      <main className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Input className="w-full sm:w-72" placeholder="Search replies" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} className={`rounded-full border px-3 py-1 text-sm ${cat === c ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]" : "bg-background"}`}>{c}</button>
            ))}
          </div>
          <Button className="ml-auto" onClick={() => setEdit({ title: "", shortcut: "", category: cat !== "All" ? cat : "General", content: "", shared: true })}><Plus className="mr-1.5 h-4 w-4" />New reply</Button>
        </div>

        {list.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
          <Card className="rounded-2xl border-dashed"><CardContent className="p-10 text-center sm:p-10">
            <MessageSquareQuote className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No saved replies yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Save answers you type again and again. In any chat, type <code>/welcome</code> and press Enter — the customer's name fills in by itself.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" onClick={() => addStarters.mutate()} disabled={addStarters.isPending}>{addStarters.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add 4 starter replies"}</Button>
              <Button onClick={() => setEdit({ title: "", shortcut: "", category: "General", content: "", shared: true })}><Plus className="mr-1.5 h-4 w-4" />New reply</Button>
            </div>
          </CardContent></Card>
        ) : (
          <Card className="rounded-2xl">
            <CardContent className="divide-y p-0 sm:p-0">
              {shown.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Nothing matches.</p> : shown.map((m) => (
                <div key={m.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
                  <div className="w-36 shrink-0">
                    <p className="font-mono text-sm text-[var(--brand)]">/{m.shortcut}</p>
                    <Badge variant="secondary" className="mt-1">{m.category}</Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">{m.title}
                      {m.shared ? <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground"><Users className="h-3 w-3" />Team</span> : <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground"><Lock className="h-3 w-3" />Only me</span>}
                    </p>
                    <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{m.content}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="mr-2 tabular-nums">{m.usageCount} uses</span>
                    {m.editable && <>
                      <Button size="icon" variant="ghost" aria-label={`Edit ${m.title}`} onClick={() => setEdit(m)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${m.title}`} onClick={() => confirm(`Delete /${m.shortcut}?`) && del.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>
                    </>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
      {edit && <Editor value={edit} categories={Array.from(new Set([...PRESET_CATS, ...rows.map((r) => r.category)]))} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
    </div>
  );
}

function Editor({ value, categories, onClose, onSaved }: { value: Draft; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<Draft>({ ...value });
  const [newCat, setNewCat] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const save = useMutation({
    mutationFn: () => j(d.id ? "PUT" : "POST", d.id ? `/api/canned-messages/${d.id}` : "/api/canned-messages", { ...d, category: newCat.trim() || d.category }),
    onSuccess: () => { toast({ title: d.id ? "Saved reply updated" : "Saved reply created", description: `Type /${d.shortcut} in any chat.` }); onSaved(); },
    onError: (e: any) => setErr(e?.message || "Couldn't save"),
  });
  const insertVar = (k: string) => {
    const el = ta.current;
    const token = `{{${k}}}`;
    if (!el) return setD({ ...d, content: d.content + token });
    const s = el.selectionStart ?? d.content.length, e = el.selectionEnd ?? s;
    const next = d.content.slice(0, s) + token + d.content.slice(e);
    setD({ ...d, content: next });
    setTimeout(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); }, 0);
  };
  const preview = fillCanned(d.content, { customer_name: "Riya Sharma", customer_first_name: "Riya", customer_phone: "919876543210", agent_name: "Aman", business_name: "Your business", today: new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{d.id ? "Edit saved reply" : "New saved reply"}</DialogTitle>
          <DialogDescription>Agents insert it by typing /{d.shortcut || "shortcut"} in a chat.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cm-title">Title</Label>
              <Input id="cm-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value, shortcut: d.id || d.shortcut ? d.shortcut : "" })}
                onBlur={() => !d.shortcut && d.title && setD({ ...d, shortcut: d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) })} placeholder="Welcome" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm-short">Shortcut</Label>
              <div className="flex items-center rounded-md border focus-within:ring-2 focus-within:ring-ring">
                <span className="pl-3 font-mono text-muted-foreground">/</span>
                <input id="cm-short" className="h-9 w-full bg-transparent px-1 font-mono text-sm outline-none" value={d.shortcut}
                  onChange={(e) => setD({ ...d, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) })} placeholder="welcome" />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button key={c} type="button" onClick={() => { setD({ ...d, category: c }); setNewCat(""); }} className={`rounded-full border px-3 py-1 text-sm ${d.category === c && !newCat ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]" : ""}`}>{c}</button>
              ))}
              <Input className="h-8 w-36" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="+ New category" aria-label="New category" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-text">Message</Label>
            <Textarea id="cm-text" ref={ta} rows={5} value={d.content} onChange={(e) => setD({ ...d, content: e.target.value })} placeholder="Hi {{customer_name}}, …" />
            <div className="flex flex-wrap gap-1">
              {CANNED_VARS.map((v) => (
                <button key={v.key} type="button" onClick={() => insertVar(v.key)} className="rounded border bg-muted/50 px-2 py-0.5 text-xs hover:bg-muted">+ {v.label}</button>
              ))}
            </div>
          </div>
          {d.content && <div className="rounded-lg bg-[#e7f8e9] p-3 text-sm dark:bg-emerald-950/30"><p className="mb-1 text-xs text-muted-foreground">Preview</p><p className="whitespace-pre-wrap">{preview}</p></div>}
          <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span><span className="block font-medium">Share with my team</span><span className="text-xs text-muted-foreground">Off = only you see this reply.</span></span>
            <Switch checked={d.shared} onCheckedChange={(v) => setD({ ...d, shared: v })} />
          </label>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setErr(null); save.mutate(); }} disabled={save.isPending || !d.title.trim() || !d.shortcut || !d.content.trim()}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : d.id ? "Save" : "Create reply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
