/**
 * "Make with AI" — a short chat where the AI asks what it needs (purpose,
 * details that change per customer, buttons) and then builds a Meta-ready
 * template with numbered variables and sample values.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Link as LinkIcon, Loader2, Phone, RotateCcw, Send, Sparkles, Wand2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

export interface AiTemplateResult {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  header: string;
  headerSample: string;
  body: string;
  footer: string;
  samples: string[];
  variableNames: string[];
  buttons: Array<{ type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phoneNumber?: string }>;
}

type Msg = { role: "user" | "assistant"; content: string; options?: string[]; template?: AiTemplateResult; notes?: string[] };

const STARTERS = [
  "Order shipped update with tracking link",
  "Diwali sale – 20% off for all customers",
  "Appointment reminder for my clinic",
  "Payment due reminder with pay link",
  "Welcome message for new customers",
  "Abandoned cart reminder",
];

function Preview({ t }: { t: AiTemplateResult }) {
  const fill = (text: string, samples: string[]) =>
    text.split(/(\{\{\d+\}\})/g).map((p, i) => {
      const m = p.match(/^\{\{(\d+)\}\}$/);
      if (!m) return <span key={i}>{p}</span>;
      const n = Number(m[1]);
      return (
        <span key={i} className="rounded bg-emerald-200/70 px-1 font-medium text-emerald-900" title={t.variableNames[n - 1] || `variable ${n}`}>
          {samples[n - 1] || p}
        </span>
      );
    });
  return (
    <div className="rounded-2xl bg-[#e5ddd5] p-3 dark:bg-zinc-800">
      <div className="max-w-[320px] rounded-lg rounded-tl-none bg-white p-3 text-sm shadow-sm dark:bg-zinc-900">
        {t.header && <p className="mb-1 font-semibold">{fill(t.header, [t.headerSample])}</p>}
        <p className="whitespace-pre-wrap leading-relaxed">{fill(t.body, t.samples)}</p>
        {t.footer && <p className="mt-2 text-xs text-muted-foreground">{t.footer}</p>}
      </div>
      {t.buttons.length > 0 && (
        <div className="mt-1 max-w-[320px] space-y-1">
          {t.buttons.map((b, i) => (
            <div key={i} className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-xs font-medium text-sky-600 shadow-sm dark:bg-zinc-900">
              {b.type === "URL" ? <LinkIcon className="h-3 w-3" /> : b.type === "PHONE_NUMBER" ? <Phone className="h-3 w-3" /> : null}
              {b.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AiTemplateWizard({ open, onOpenChange, channelId, language, onUse }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  channelId?: string;
  language?: string;
  onUse: (t: AiTemplateResult) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (!open) { setMsgs([]); setInput(""); setError(""); } }, [open]);

  const ask = useMutation({
    mutationFn: async (history: Msg[]) => {
      const res = await apiRequest("POST", "/api/templates/ai-generate", {
        channelId,
        language,
        messages: history.map((m) => ({
          role: m.role,
          content: m.template ? `Proposed template: ${JSON.stringify(m.template)}` : m.content,
        })),
      });
      return res.json();
    },
    onSuccess: (r) => {
      setError("");
      if (r.type === "template") {
        setMsgs((m) => [...m, { role: "assistant", content: "Here's your template 👇", template: r.template, notes: r.notes }]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: r.question, options: r.options }]);
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  const send = (text: string) => {
    const v = text.trim();
    if (!v || ask.isPending) return;
    const next = [...msgs, { role: "user" as const, content: v }];
    setMsgs(next);
    setInput("");
    ask.mutate(next);
  };

  const lastTemplate = [...msgs].reverse().find((m) => m.template)?.template;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <span className="rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 p-1.5 text-white"><Sparkles className="h-4 w-4" /></span>
            Make template with AI
          </DialogTitle>
          <DialogDescription>Tell me what you want to send. I'll ask a couple of quick questions and build a Meta-ready template with variables.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {msgs.length === 0 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-violet-100 p-2 text-violet-600"><Bot className="h-4 w-4" /></span>
                <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm">
                  Hi! What message do you want to send on WhatsApp? Describe it in your own words — Hindi or English is fine.
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-11">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border bg-background px-3 py-1.5 text-xs transition-colors hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[var(--brand)] px-4 py-2.5 text-sm text-white">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-3">
                <span className="rounded-full bg-violet-100 p-2 text-violet-600"><Bot className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="w-fit max-w-full rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm">{m.content}</div>
                  {m.options && m.options.length > 0 && i === msgs.length - 1 && (
                    <div className="flex flex-wrap gap-2">
                      {m.options.map((o) => (
                        <button key={o} onClick={() => send(o)} className="rounded-full border bg-background px-3 py-1.5 text-xs hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30">{o}</button>
                      ))}
                    </div>
                  )}
                  {m.template && (
                    <div className="space-y-3 rounded-2xl border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{m.template.name}</span>
                        <Badge variant="secondary">{m.template.category}</Badge>
                        <Badge variant="outline">{m.template.language}</Badge>
                      </div>
                      <Preview t={m.template} />
                      {m.template.samples.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Variables</p>
                          <div className="flex flex-wrap gap-1.5">
                            {m.template.samples.map((s, k) => (
                              <span key={k} className="rounded-md bg-muted px-2 py-1 text-xs">
                                <b>{`{{${k + 1}}}`}</b> {m.template!.variableNames[k]} · <i>{s}</i>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {!!m.notes?.length && (
                        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                          {m.notes.map((n, k) => <li key={k}>{n}</li>)}
                        </ul>
                      )}
                      {i === msgs.length - 1 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" onClick={() => { onUse(m.template!); onOpenChange(false); }}>
                            <Wand2 className="mr-1.5 h-4 w-4" /> Use this template
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setInput("Change: ")}>Change something</Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {ask.isPending && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="rounded-full bg-violet-100 p-2 text-violet-600"><Bot className="h-4 w-4" /></span>
              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</span>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={() => ask.mutate(msgs)} disabled={!msgs.length}>Retry</Button>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t p-4">
          <div className="flex items-end gap-2">
            <Textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder={lastTemplate ? "Ask for changes, e.g. 'make it shorter' or 'add a call button'" : "e.g. Order confirmation for my bakery with delivery date"}
              className="max-h-32 min-h-[44px] resize-none"
            />
            {msgs.length > 0 && (
              <Button variant="ghost" size="icon" title="Start over" onClick={() => { setMsgs([]); setError(""); }}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" onClick={() => send(input)} disabled={!input.trim() || ask.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
