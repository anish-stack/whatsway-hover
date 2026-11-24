/**
 * Super admin: automatic WhatsApp messages from the platform's own number.
 * Pick the number, then per event an approved template and what fills each {{n}}.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MessageCircle, Send, XCircle } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type EventCfg = { enabled?: boolean; templateName?: string | null; language?: string | null; body?: string[]; header?: string | null; button?: string | null };
type Tpl = { name: string; language: string; category?: string; header?: string; body: string; footer?: string; buttons?: any; slots: { body: number; header: boolean; buttonIndex: number } };

const fill = (text: string, values: string[]) => String(text || "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => values[Number(n) - 1] || `{{${n}}}`);

export default function PlatformWhatsAppPage() {
  const { toast } = useToast();
  const q = useQuery<any>({ queryKey: ["/api/admin/platform-whatsapp"], queryFn: async () => (await apiRequest("GET", "/api/admin/platform-whatsapp")).json() });
  const [enabled, setEnabled] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, EventCfg>>({});
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (q.data && !dirty) { setEnabled(!!q.data.settings.enabled); setChannelId(q.data.settings.channelId); setEvents(q.data.settings.events || {}); }
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const tpls = useQuery<Tpl[]>({
    queryKey: ["/api/admin/platform-whatsapp/templates", channelId],
    enabled: !!channelId,
    queryFn: async () => (await apiRequest("GET", `/api/admin/platform-whatsapp/templates?channelId=${channelId}`)).json(),
  });

  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/admin/platform-whatsapp", { enabled, channelId, events })).json(),
    onSuccess: () => { setDirty(false); queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-whatsapp"] }); toast({ title: "Saved" }); },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const setEvent = (key: string, patch: Partial<EventCfg>) => { setDirty(true); setEvents((e) => ({ ...e, [key]: { ...(e[key] || {}), ...patch } })); };
  const d = q.data;

  return (
    <div className="flex-1 min-h-screen dots-bg">
      <Header title="WhatsApp notifications" subtitle="Automatic messages from your platform number to new customers and resellers" />
      <main className="mx-auto w-full max-w-[1200px] space-y-6 p-4 sm:p-6">
        {q.isLoading || !d ? <Loader2 className="h-5 w-5 animate-spin" /> : (
          <>
            <Card className="rounded-2xl">
              <CardContent className="grid gap-4 md:grid-cols-[1fr_320px] md:items-end">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]"><MessageCircle className="h-5 w-5" /></span>
                  <div>
                    <p className="font-semibold">Send from</p>
                    <p className="text-sm text-muted-foreground">Templates must be approved on this number. Messages go out through the job queue and are logged below.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Select value={channelId || ""} onValueChange={(v) => { setDirty(true); setChannelId(v); }}>
                    <SelectTrigger aria-label="Platform WhatsApp number"><SelectValue placeholder="Choose a WhatsApp number" /></SelectTrigger>
                    <SelectContent>{(d.channels || []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}{c.phoneNumber ? ` · ${c.phoneNumber}` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                  <label className="flex shrink-0 items-center gap-2 text-sm">
                    <Switch checked={enabled} onCheckedChange={(v) => { setDirty(true); setEnabled(v); }} aria-label="Enable automatic messages" />{enabled ? "On" : "Off"}
                  </label>
                </div>
              </CardContent>
            </Card>

            {Object.entries(d.events as Record<string, { label: string; hint: string }>).map(([key, meta]) => (
              <EventCard key={key} eventKey={key} meta={meta} cfg={events[key] || {}} onChange={(p) => setEvent(key, p)}
                templates={tpls.data || []} loadingTemplates={tpls.isFetching} tokens={d.tokens} sample={d.sample} hasChannel={!!channelId} dirty={dirty} />
            ))}

            <div className="sticky bottom-4 z-10 flex justify-end">
              <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="shadow-lg">{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button>
            </div>

            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-base sm:text-base">Recent messages</CardTitle></CardHeader>
              <CardContent>
                {!d.logs?.length ? <p className="text-sm text-muted-foreground">Nothing sent yet.</p> : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">Event</th><th className="px-3 py-2 font-medium">To</th><th className="px-3 py-2 font-medium">Template</th><th className="px-3 py-2 font-medium">Result</th></tr></thead>
                      <tbody className="divide-y">{d.logs.map((l: any) => (
                        <tr key={l.id}>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs">{d.events[l.event]?.label || l.event}{l.trigger !== "auto" ? <span className="ml-1 text-muted-foreground">({l.trigger})</span> : null}</td>
                          <td className="px-3 py-2 text-xs">+{l.toPhone}</td>
                          <td className="px-3 py-2 font-mono text-xs">{l.templateName || "—"}</td>
                          <td className="px-3 py-2 text-xs">{l.status === "sent" ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Sent</span> : <span className={`inline-flex items-center gap-1 ${l.status === "failed" ? "text-red-700" : "text-amber-700"}`} title={l.error}><XCircle className="h-3.5 w-3.5" />{l.status === "failed" ? "Failed" : "Skipped"}: {l.error}</span>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function EventCard({ eventKey, meta, cfg, onChange, templates, loadingTemplates, tokens, sample, hasChannel, dirty }: {
  eventKey: string; meta: { label: string; hint: string }; cfg: EventCfg; onChange: (p: Partial<EventCfg>) => void;
  templates: Tpl[]; loadingTemplates: boolean; tokens: Record<string, string>; sample: Record<string, string>; hasChannel: boolean; dirty: boolean;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const tpl = templates.find((t) => t.name === cfg.templateName && (!cfg.language || t.language === cfg.language));
  const body = cfg.body || [];
  const values = useMemo(() => Array.from({ length: tpl?.slots.body || 0 }, (_, i) => (body[i] ? sample[body[i]] : "")), [tpl, body, sample]);
  const test = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/platform-whatsapp/test", { event: eventKey, to })).json(),
    onSuccess: (r: any) => toast({ title: r.status === "sent" ? "Test sent" : "Not sent", description: r.status === "sent" ? `To +${r.to}` : r.error || r.reason }),
    onError: (e: Error) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });
  const tokenSelect = (value: string | null | undefined, set: (v: string | null) => void, label: string) => (
    <Select value={value || "__none"} onValueChange={(v) => set(v === "__none" ? null : v)}>
      <SelectTrigger aria-label={label} className="h-9"><SelectValue placeholder="Choose a value" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">— choose —</SelectItem>
        {Object.entries(tokens).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div><CardTitle className="text-base sm:text-base">{meta.label}</CardTitle><CardDescription>{meta.hint}</CardDescription></div>
        <Switch checked={!!cfg.enabled} onCheckedChange={(v) => onChange({ enabled: v })} aria-label={`Send: ${meta.label}`} />
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Approved template</Label>
            <Select value={tpl ? `${tpl.name}|${tpl.language}` : ""} disabled={!hasChannel}
              onValueChange={(v) => { const [name, language] = v.split("|"); const t = templates.find((x) => x.name === name && x.language === language); onChange({ templateName: name, language, body: Array.from({ length: t?.slots.body || 0 }, (_, i) => body[i] || ""), header: null, button: null }); }}>
              <SelectTrigger><SelectValue placeholder={!hasChannel ? "Choose the number first" : loadingTemplates ? "Loading…" : templates.length ? "Choose a template" : "No approved templates on this number"} /></SelectTrigger>
              <SelectContent>{templates.map((t) => <SelectItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} · {t.language}{t.category ? ` · ${t.category.toLowerCase()}` : ""}</SelectItem>)}</SelectContent>
            </Select>
            {cfg.templateName && !tpl && !loadingTemplates && hasChannel && <p className="text-xs text-red-600">“{cfg.templateName}” isn't approved on this number anymore.</p>}
          </div>
          {tpl && (
            <div className="space-y-3">
              {tpl.slots.header && <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Header {"{{1}}"}</Label>{tokenSelect(cfg.header, (v) => onChange({ header: v }), "Header value")}</div>}
              {Array.from({ length: tpl.slots.body }, (_, i) => (
                <div key={i} className="grid grid-cols-[90px_1fr] items-center gap-2">
                  <Label className="text-xs">Body {`{{${i + 1}}}`}</Label>
                  {tokenSelect(body[i], (v) => { const next = [...body]; next[i] = v || ""; onChange({ body: next }); }, `Body variable ${i + 1}`)}
                </div>
              ))}
              {tpl.slots.buttonIndex >= 0 && <div className="grid grid-cols-[90px_1fr] items-center gap-2"><Label className="text-xs">Button link</Label>{tokenSelect(cfg.button, (v) => onChange({ button: v }), "Button URL value")}</div>}
              {tpl.slots.body === 0 && !tpl.slots.header && <p className="text-xs text-muted-foreground">This template has no variables — it's sent as is.</p>}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="space-y-1.5"><Label htmlFor={`t-${eventKey}`} className="text-xs">Send a test to</Label><Input id={`t-${eventKey}`} className="h-9 w-48" placeholder="919876543210" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={!to || test.isPending || dirty} title={dirty ? "Save changes first" : undefined}>{test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Send test</Button>
            {dirty && <span className="text-xs text-muted-foreground">Save first to test.</span>}
          </div>
        </div>
        <div className="rounded-xl bg-[#efeae2] p-4">
          <p className="mb-2 text-[11px] text-[#667781]">Preview with sample values</p>
          {tpl ? (
            <div className="overflow-hidden rounded-lg bg-white text-[13px] shadow-sm">
              {tpl.header && <p className="px-3 pt-2 font-semibold text-[#111b21]">{fill(tpl.header, [cfg.header ? sample[cfg.header] : ""])}</p>}
              <p className="whitespace-pre-wrap px-3 py-2 text-[#111b21]">{fill(tpl.body, values)}</p>
              {tpl.footer && <p className="px-3 pb-2 text-[11px] text-[#667781]">{tpl.footer}</p>}
              {(Array.isArray(tpl.buttons) ? tpl.buttons : []).map((b: any, i: number) => <div key={i} className="border-t py-2 text-center text-[13px] font-medium text-[#027eb5]">{b.text}</div>)}
            </div>
          ) : <p className="text-sm text-[#667781]">Pick a template to preview it.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
