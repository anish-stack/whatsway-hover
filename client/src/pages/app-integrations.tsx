/**
 * Integrations hub — connect Shopify, WooCommerce, Google Sheets and any CRM.
 * Inbound: store/CRM/sheet events → send an approved WhatsApp template.
 * Outbound: WhatsApp messages / Flow replies → Google Sheet or CRM URL.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity, ArrowRight, Check, ChevronDown, ChevronUp, Copy, Pause, Play, Plug, Plus, RefreshCw,
  Send, Settings2, Sheet, ShoppingBag, ShoppingCart, Trash2, Users, Webhook, Zap,
} from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Type = "shopify" | "woocommerce" | "google_sheets" | "crm_webhook";

const APPS: Record<Type, { title: string; blurb: string; icon: any; tone: string; examples: string }> = {
  shopify: { title: "Shopify", blurb: "Order confirmations, shipping updates and abandoned-cart reminders on WhatsApp.", icon: ShoppingBag, tone: "from-emerald-500 to-lime-500", examples: "Order placed · Shipped · Cancelled · Abandoned checkout" },
  woocommerce: { title: "WooCommerce", blurb: "Send WhatsApp updates for every WordPress store order status.", icon: ShoppingCart, tone: "from-violet-500 to-purple-600", examples: "Order placed · Processing · Completed · On hold" },
  google_sheets: { title: "Google Sheets", blurb: "Send WhatsApp to new rows and log every incoming chat & form reply in a sheet.", icon: Sheet, tone: "from-green-500 to-emerald-600", examples: "Row added → template · Messages → sheet" },
  crm_webhook: { title: "CRM & Webhooks", blurb: "Zoho, HubSpot, LeadSquared, Pabbly, Zapier, Make — anything that can call a URL.", icon: Users, tone: "from-sky-500 to-blue-600", examples: "New lead · Deal won · Any custom event" },
};

const SUGGEST: Record<Type, Array<{ path: string; label: string }>> = {
  shopify: [
    { path: "customer.first_name", label: "Customer first name" },
    { path: "name", label: "Order number (#1001)" },
    { path: "total_price", label: "Order total" },
    { path: "currency", label: "Currency" },
    { path: "line_items.0.title", label: "First product" },
    { path: "fulfillments.0.tracking_number", label: "Tracking number" },
    { path: "fulfillments.0.tracking_url", label: "Tracking link" },
    { path: "order_status_url", label: "Order status link" },
    { path: "abandoned_checkout_url", label: "Cart recovery link" },
    { path: "shipping_address.city", label: "Shipping city" },
  ],
  woocommerce: [
    { path: "billing.first_name", label: "Customer first name" },
    { path: "number", label: "Order number" },
    { path: "total", label: "Order total" },
    { path: "currency", label: "Currency" },
    { path: "status", label: "Order status" },
    { path: "line_items.0.name", label: "First product" },
    { path: "payment_method_title", label: "Payment method" },
    { path: "shipping.city", label: "Shipping city" },
  ],
  google_sheets: [
    { path: "row.name", label: "Column “name”" },
    { path: "row.amount", label: "Column “amount”" },
    { path: "row.date", label: "Column “date”" },
    { path: "row.link", label: "Column “link”" },
  ],
  crm_webhook: [
    { path: "name", label: "name" },
    { path: "email", label: "email" },
    { path: "company", label: "company" },
    { path: "data.amount", label: "data.amount" },
  ],
};

const STEPS: Record<Type, string[]> = {
  shopify: [
    "Shopify admin → Settings → Notifications → scroll to Webhooks → Create webhook.",
    "Event: pick e.g. “Order creation”. Format: JSON. URL: paste your HoverChat URL below. API version: latest.",
    "Copy the signing secret Shopify shows (“Your webhooks will be signed with …”) and paste it into “Signing secret” for extra security.",
    "Add an automation below for the same event and choose which approved template to send.",
  ],
  woocommerce: [
    "WordPress → WooCommerce → Settings → Advanced → Webhooks → Add webhook.",
    "Status: Active. Topic: “Order created” (or “Order updated” for status changes). Delivery URL: your HoverChat URL.",
    "Secret: copy the secret from WooCommerce into “Signing secret” so HoverChat can verify requests.",
    "Add automations below — use “Order completed / shipped” etc. for status updates.",
  ],
  google_sheets: [
    "Open your sheet → Extensions → Apps Script → paste the script below → Save.",
    "Deploy → New deployment → Web app → Execute as Me, access Anyone → Deploy. Paste the Web app URL into “Sheet web app URL”.",
    "Add a trigger for sendNewRows (every minute). Rows need a “phone” column; other columns become variables (row.<column>).",
    "Add an automation for “New row added to sheet” and pick a template.",
  ],
  crm_webhook: [
    "In your CRM / Zapier / Pabbly / Make, add a “Webhook” or “HTTP request” action (POST, JSON).",
    "URL: your HoverChat URL. Body must include the customer's phone, e.g. {\"event\":\"lead.created\",\"phone\":\"9198…\",\"name\":\"Rahul\"}.",
    "Optional: set a secret below and sign the body with HMAC-SHA256 in header X-HoverChat-Signature.",
    "To push WhatsApp chats into your CRM, set the Outbound URL and pick events.",
  ],
};

function CopyField({ value, label, mono = true }: { value: string; label?: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-1.5">
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <div className="flex gap-2">
        <Input readOnly value={value} className={mono ? "font-mono text-xs" : ""} onFocus={(e) => e.target.select()} />
        <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>
          {done ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

const statusTone: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800", delivered: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700", skipped: "bg-amber-100 text-amber-800", received: "bg-sky-100 text-sky-800",
};

export default function AppIntegrationsPage() {
  const { toast } = useToast();
  const [creating, setCreating] = useState<Type | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const catalog = useQuery<any>({ queryKey: ["/api/integrations/catalog"], queryFn: async () => (await apiRequest("GET", "/api/integrations/catalog")).json() });
  const list = useQuery<any>({ queryKey: ["/api/integrations"], queryFn: async () => (await apiRequest("GET", "/api/integrations")).json() });
  const items: any[] = list.data?.data || [];
  const counts = useMemo(() => items.reduce((a: any, i: any) => ({ ...a, [i.type]: (a[i.type] || 0) + 1 }), {}), [items]);

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Integrations" subtitle="Connect your store, sheets and CRM to WhatsApp" />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        <Card className="overflow-hidden rounded-2xl border-0 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900 text-white">
          <CardContent className="flex flex-col gap-4 p-6 sm:p-8 sm:pt-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl space-y-2">
              <Badge className="bg-white/15 text-white hover:bg-white/15"><Zap className="mr-1 h-3 w-3" /> Automations</Badge>
              <h2 className="text-2xl font-bold sm:text-3xl">Every order, lead and row → the right WhatsApp message</h2>
              <p className="text-sm text-white/75">Pick an app, paste one URL, choose an approved template. HoverChat fills the variables from your data and sends it automatically.</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-2xl font-bold">{items.length}</p><p className="text-xs text-white/70">Connected</p></div>
              <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-2xl font-bold">{items.reduce((a, i) => a + (i.rules?.length || 0), 0)}</p><p className="text-xs text-white/70">Automations</p></div>
              <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-2xl font-bold">{items.reduce((a, i) => a + (i.eventCount || 0), 0)}</p><p className="text-xs text-white/70">Events</p></div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(APPS) as Type[]).map((t) => {
            const a = APPS[t];
            return (
              <Card key={t} className="group rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-5">
                  <div className="flex items-start justify-between">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${a.tone} text-white shadow-md`}><a.icon className="h-6 w-6" /></span>
                    {counts[t] ? <Badge variant="secondary">{counts[t]} connected</Badge> : null}
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="text-sm text-muted-foreground">{a.blurb}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.examples}</p>
                  <Button className="mt-auto" variant={counts[t] ? "outline" : "default"} onClick={() => setCreating(t)}>
                    <Plus className="mr-1.5 h-4 w-4" /> {counts[t] ? "Add another" : "Connect"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Plug className="h-4 w-4" /> Your integrations</h3>
          {list.isLoading ? (
            <div className="h-24 animate-pulse rounded-2xl bg-muted" />
          ) : items.length === 0 ? (
            <Card className="rounded-2xl border-dashed"><CardContent className="p-8 text-center text-sm text-muted-foreground sm:p-8">Nothing connected yet. Pick an app above to start.</CardContent></Card>
          ) : (
            items.map((it) => (
              <IntegrationCard key={it.id} it={it} catalog={catalog.data} open={openId === it.id} onToggle={() => setOpenId(openId === it.id ? null : it.id)} />
            ))
          )}
        </div>
      </main>

      {creating && (
        <CreateDialog
          type={creating}
          channels={catalog.data?.channels || []}
          onClose={() => setCreating(null)}
          onCreated={(row) => {
            setCreating(null);
            setOpenId(row.id);
            queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
            toast({ title: `${APPS[creating].title} added`, description: "Follow the setup steps, then add an automation." });
          }}
        />
      )}
    </div>
  );
}

function CreateDialog({ type, channels, onClose, onCreated }: { type: Type; channels: any[]; onClose: () => void; onCreated: (row: any) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(`${APPS[type].title} store`);
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const create = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/integrations", { type, name, channelId })).json(),
    onSuccess: (r) => onCreated(r.data),
    onError: (e: Error) => toast({ title: "Could not connect", description: e.message, variant: "destructive" }),
  });
  const A = APPS[type];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <span className={`mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${A.tone} text-white`}><A.icon className="h-6 w-6" /></span>
          <DialogTitle>Connect {A.title}</DialogTitle>
          <DialogDescription>{A.blurb}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Send from WhatsApp number</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue placeholder="Select number" /></SelectTrigger>
              <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.phoneNumber}</SelectItem>)}</SelectContent>
            </Select>
            {channels.length === 0 && <p className="text-xs text-amber-700">Connect a WhatsApp number in Settings first.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!name || !channelId || create.isPending} onClick={() => create.mutate()}>Connect <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationCard({ it, catalog, open, onToggle }: { it: any; catalog: any; open: boolean; onToggle: () => void }) {
  const { toast } = useToast();
  const A = APPS[it.type as Type];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
  const patch = useMutation({
    mutationFn: async (body: any) => (await apiRequest("PATCH", `/api/integrations/${it.id}`, body)).json(),
    onSuccess: () => { refresh(); toast({ title: "Saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/integrations/${it.id}`),
    onSuccess: () => { refresh(); toast({ title: "Integration removed" }); },
  });
  const rotate = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/integrations/${it.id}/rotate`),
    onSuccess: () => { refresh(); toast({ title: "New URL created", description: "Update the URL in your app — the old one stops working." }); },
  });
  const active = it.status === "active";

  return (
    <Card className="overflow-hidden rounded-2xl">
      <button onClick={onToggle} className="flex w-full items-center gap-4 p-4 text-left sm:p-5">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${A?.tone} text-white`}>{A && <A.icon className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{it.name}</span>
            <Badge variant="outline" className="text-[10px]">{A?.title}</Badge>
            <span className={`inline-flex items-center gap-1 text-xs ${active ? "text-emerald-600" : "text-amber-600"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-amber-500"}`} />{active ? "Active" : "Paused"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {it.rules?.length || 0} automation(s) · {it.eventCount || 0} events{it.lastEventAt ? ` · last ${new Date(it.lastEventAt).toLocaleString()}` : ""}
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t bg-muted/20 p-4 sm:p-5">
          <Tabs defaultValue="setup">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="setup"><Settings2 className="mr-1.5 h-3.5 w-3.5" />Setup</TabsTrigger>
                <TabsTrigger value="rules"><Zap className="mr-1.5 h-3.5 w-3.5" />Automations</TabsTrigger>
                <TabsTrigger value="logs"><Activity className="mr-1.5 h-3.5 w-3.5" />Activity</TabsTrigger>
              </TabsList>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => patch.mutate({ status: active ? "paused" : "active" })}>
                  {active ? <><Pause className="mr-1 h-3.5 w-3.5" />Pause</> : <><Play className="mr-1 h-3.5 w-3.5" />Resume</>}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(`Remove ${it.name}?`) && del.mutate()}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <TabsContent value="setup"><SetupTab it={it} catalog={catalog} onSave={(b) => patch.mutate(b)} onRotate={() => rotate.mutate()} /></TabsContent>
            <TabsContent value="rules"><RulesTab it={it} catalog={catalog} /></TabsContent>
            <TabsContent value="logs"><LogsTab it={it} /></TabsContent>
          </Tabs>
        </div>
      )}
    </Card>
  );
}

function SetupTab({ it, catalog, onSave, onRotate }: { it: any; catalog: any; onSave: (b: any) => void; onRotate: () => void }) {
  const t = it.type as Type;
  const [secret, setSecret] = useState(it.config?.signingSecret || "");
  const [cc, setCc] = useState(it.config?.defaultCountryCode || "91");
  const [outUrl, setOutUrl] = useState(it.config?.outboundUrl || "");
  const [outEvents, setOutEvents] = useState<string[]>(it.config?.outboundEvents || []);
  const showOutbound = t === "google_sheets" || t === "crm_webhook";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <CopyField label="Your HoverChat URL (keep it private)" value={it.hookUrl} />
        <ol className="space-y-2.5">
          {STEPS[t].map((s, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-xs font-semibold text-white">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <Button size="sm" variant="outline" onClick={() => confirm("Create a new URL? The current one will stop working.") && onRotate()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />New URL</Button>
      </div>
      <div className="space-y-4 rounded-xl border bg-background p-4">
        <div className="space-y-1.5">
          <Label>Signing secret {t === "shopify" ? "(from Shopify)" : t === "woocommerce" ? "(same as in WooCommerce)" : "(optional)"}</Label>
          <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Paste secret to verify requests" />
        </div>
        <div className="space-y-1.5">
          <Label>Default country code</Label>
          <Input value={cc} onChange={(e) => setCc(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-28" />
          <p className="text-xs text-muted-foreground">Added to numbers without a country code (91 = India).</p>
        </div>
        {showOutbound && (
          <>
            <div className="space-y-1.5">
              <Label>{t === "google_sheets" ? "Sheet web app URL (WhatsApp → Sheet)" : "Outbound URL (WhatsApp → CRM)"}</Label>
              <Input value={outUrl} onChange={(e) => setOutUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
            </div>
            <div className="space-y-2">
              <Label>Send these events</Label>
              {(catalog?.outboundEvents || []).map((e: any) => (
                <label key={e.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={outEvents.includes(e.key)} onCheckedChange={(v) => setOutEvents(v ? [...outEvents, e.key] : outEvents.filter((x) => x !== e.key))} />
                  {e.label}
                </label>
              ))}
            </div>
          </>
        )}
        <Button onClick={() => onSave({ config: { signingSecret: secret, defaultCountryCode: cc || "91", ...(showOutbound ? { outboundUrl: outUrl, outboundEvents: outEvents } : {}) } })}>Save settings</Button>
      </div>
      {it.appsScript && (
        <div className="space-y-2 lg:col-span-2">
          <div className="flex items-center justify-between">
            <Label>Google Apps Script (paste in Extensions → Apps Script)</Label>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(it.appsScript)}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy script</Button>
          </div>
          <pre className="max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{it.appsScript}</pre>
        </div>
      )}
    </div>
  );
}

function countVars(text?: string | null) {
  const m = String(text || "").match(/\{\{(\d+)\}\}/g) || [];
  return m.reduce((mx, v) => Math.max(mx, Number(v.replace(/\D/g, ""))), 0);
}

function RulesTab({ it, catalog }: { it: any; catalog: any }) {
  const { toast } = useToast();
  const t = it.type as Type;
  const events: Array<{ key: string; label: string }> = catalog?.events?.[t] || [];
  const tpls = useQuery<any[]>({ queryKey: ["/api/integrations", it.id, "templates"], queryFn: async () => (await (await apiRequest("GET", `/api/integrations/${it.id}/templates`)).json()).data });
  const [form, setForm] = useState<any>(null);
  const [testPhone, setTestPhone] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });

  const save = useMutation({
    mutationFn: async (r: any) => (await apiRequest(r.id ? "PUT" : "POST", r.id ? `/api/integrations/${it.id}/rules/${r.id}` : `/api/integrations/${it.id}/rules`, r)).json(),
    onSuccess: () => { refresh(); setForm(null); toast({ title: "Automation saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({ mutationFn: async (id: string) => apiRequest("DELETE", `/api/integrations/${it.id}/rules/${id}`), onSuccess: refresh });
  const toggle = useMutation({ mutationFn: async (r: any) => apiRequest("PUT", `/api/integrations/${it.id}/rules/${r.id}`, { isActive: !r.isActive }), onSuccess: refresh });
  const test = useMutation({
    mutationFn: async (r: any) => (await apiRequest("POST", `/api/integrations/${it.id}/rules/${r.id}/test`, { phone: testPhone, payload: samplePayload(t, r) })).json(),
    onSuccess: () => toast({ title: "Test message sent", description: "Check WhatsApp on the test number." }),
    onError: (e: Error) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  const tpl = (tpls.data || []).find((x) => x.name === form?.templateName);
  const nVars = countVars(tpl?.body);
  const urlBtnDynamic = Array.isArray(tpl?.buttons) && tpl.buttons.some((b: any) => b.type === "URL" && String(b.url || "").includes("{{"));
  const headerVar = /\{\{1\}\}/.test(String(tpl?.header || ""));

  return (
    <div className="space-y-4">
      {(it.rules || []).length === 0 && !form && (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No automations yet. Add one to start sending WhatsApp messages automatically.</div>
      )}
      {(it.rules || []).map((r: any) => (
        <div key={r.id} className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              When <span className="text-[var(--brand)]">{events.find((e) => e.key === r.event)?.label || r.event}</span> → send <span className="font-mono">{r.templateName}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">{(r.variables || []).map((v: string, i: number) => `{{${i + 1}}}=${v}`).join(" · ") || "No variables"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={r.isActive} onCheckedChange={() => toggle.mutate(r)} />
            <Input placeholder="Test number" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="h-8 w-32 text-xs" />
            <Button size="sm" variant="outline" disabled={!testPhone || test.isPending} onClick={() => test.mutate(r)}><Send className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setForm({ ...r })}>Edit</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}

      {form ? (
        <div className="space-y-4 rounded-xl border bg-background p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>When this happens</Label>
              <Select value={form.event} onValueChange={(v) => setForm({ ...form, event: v })}>
                <SelectTrigger><SelectValue placeholder="Choose event" /></SelectTrigger>
                <SelectContent>{events.map((e) => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Send this approved template</Label>
              <Select value={form.templateName} onValueChange={(v) => {
                const x = (tpls.data || []).find((y) => y.name === v);
                setForm({ ...form, templateName: v, language: x?.language || "en_US", variables: Array(countVars(x?.body)).fill("") });
              }}>
                <SelectTrigger><SelectValue placeholder={tpls.isLoading ? "Loading…" : "Choose template"} /></SelectTrigger>
                <SelectContent>{(tpls.data || []).map((x) => <SelectItem key={x.id} value={x.name}>{x.name} ({x.category})</SelectItem>)}</SelectContent>
              </Select>
              {(tpls.data || []).length === 0 && !tpls.isLoading && <p className="text-xs text-amber-700">No approved templates on this number yet.</p>}
            </div>
          </div>
          {tpl && <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{tpl.body}</p>}
          {nVars > 0 && (
            <div className="space-y-2">
              <Label>Fill the variables from your data</Label>
              {Array.from({ length: nVars }).map((_, i) => (
                <VarInput key={i} label={`{{${i + 1}}}`} type={t} value={form.variables?.[i] || ""} onChange={(v) => {
                  const vars = [...(form.variables || [])]; vars[i] = v; setForm({ ...form, variables: vars });
                }} />
              ))}
            </div>
          )}
          {headerVar && <VarInput label="Header {{1}}" type={t} value={form.headerVariable || ""} onChange={(v) => setForm({ ...form, headerVariable: v })} />}
          {urlBtnDynamic && <VarInput label="Button link ending" type={t} value={form.buttonVariable || ""} onChange={(v) => setForm({ ...form, buttonVariable: v })} />}
          <div className="space-y-1.5">
            <Label>Customer phone field (optional)</Label>
            <Input value={form.phonePath || ""} onChange={(e) => setForm({ ...form, phonePath: e.target.value })} placeholder="Auto-detect (customer.phone, billing.phone, row.phone…)" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            <Button disabled={!form.event || !form.templateName || save.isPending} onClick={() => save.mutate({ ...form, variables: (form.variables || []).slice(0, nVars || undefined) })}>Save automation</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setForm({ event: events[0]?.key, templateName: "", variables: [] })}><Plus className="mr-1.5 h-4 w-4" />Add automation</Button>
      )}
    </div>
  );
}

function VarInput({ label, type, value, onChange }: { label: string; type: Type; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{label}</span>
      <Select value={SUGGEST[type].some((s) => s.path === value) ? value : "__custom"} onValueChange={(v) => v !== "__custom" && onChange(v)}>
        <SelectTrigger className="sm:w-56"><SelectValue placeholder="Pick a field" /></SelectTrigger>
        <SelectContent>
          {SUGGEST[type].map((s) => <SelectItem key={s.path} value={s.path}>{s.label}</SelectItem>)}
          <SelectItem value="__custom">Custom field / fixed text…</SelectItem>
        </SelectContent>
      </Select>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. customer.first_name or static:Hover Store" className="font-mono text-xs" />
    </div>
  );
}

function samplePayload(t: Type, r: any) {
  const base: Record<Type, any> = {
    shopify: { name: "#1001", total_price: "1499.00", currency: "INR", customer: { first_name: "Rahul", phone: "" }, line_items: [{ title: "Running Shoes" }], fulfillments: [{ tracking_number: "TRK12345", tracking_url: "https://track.example/TRK12345" }], order_status_url: "https://shop.example/orders/1001", abandoned_checkout_url: "https://shop.example/cart/abc", shipping_address: { city: "Delhi" } },
    woocommerce: { number: "1001", total: "1499.00", currency: "INR", status: "processing", billing: { first_name: "Rahul" }, line_items: [{ name: "Running Shoes" }], payment_method_title: "UPI", shipping: { city: "Delhi" } },
    google_sheets: { row: { name: "Rahul", amount: "1499", date: "24 Nov", link: "https://example.com" } },
    crm_webhook: { name: "Rahul", email: "rahul@example.com", company: "Acme", data: { amount: "1499" } },
  };
  const p = JSON.parse(JSON.stringify(base[t]));
  // fill any custom paths with a readable placeholder
  for (const path of [...(r.variables || []), r.headerVariable, r.buttonVariable].filter(Boolean)) {
    if (String(path).startsWith("static:")) continue;
    const parts = String(path).split("|")[0].split(".");
    let cur = p;
    parts.forEach((k: string, i: number) => {
      if (i === parts.length - 1) { if (cur[k] == null || cur[k] === "") cur[k] = `Sample ${k}`; }
      else { cur[k] = cur[k] ?? (/^\d+$/.test(parts[i + 1]) ? [] : {}); cur = cur[k]; }
    });
  }
  return p;
}

function LogsTab({ it }: { it: any }) {
  const logs = useQuery<any[]>({ queryKey: ["/api/integrations", it.id, "logs"], queryFn: async () => (await (await apiRequest("GET", `/api/integrations/${it.id}/logs`)).json()).data, refetchInterval: 15000 });
  const rows = logs.data || [];
  return (
    <div className="space-y-2">
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => logs.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button></div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"><Webhook className="mx-auto mb-2 h-5 w-5" />No events yet. Trigger a test from your app.</div>
      ) : (
        <div className="divide-y rounded-xl border bg-background">
          {rows.map((l) => (
            <div key={l.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:gap-4">
              <span className="w-40 shrink-0 text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</span>
              <span className="w-10 shrink-0 text-xs uppercase text-muted-foreground">{l.direction}</span>
              <span className="w-44 shrink-0 font-mono text-xs">{l.event}</span>
              <span className={`w-fit rounded px-2 py-0.5 text-xs font-medium ${statusTone[l.status] || "bg-muted"}`}>{l.status}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{l.phone ? `${l.phone} · ` : ""}{l.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
