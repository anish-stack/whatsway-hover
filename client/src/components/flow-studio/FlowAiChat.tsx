/**
 * "Make with AI" chat for Flow Studio (Gemini). Used in two places:
 *  - AiCreateDialog (list page): describe a form → AI builds the whole flow → preview → create
 *  - the editor's "Edit with AI" panel: ask for a change → apply to the open flow (undoable)
 */
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, Bot, CheckCircle2, Flag, GitBranch, Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { COMPLETE, COMPONENT_META, isInput, type FlowDefinition, type FlowSettings } from "@shared/flow-studio";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type AiFlowResult = {
  type: "flow"; summary: string; notes: string[]; name: string; category: string; cta: string; body: string;
  definition: FlowDefinition; settings: FlowSettings;
};
type Turn = { type: "question"; question: string; options: string[] } | AiFlowResult;
type Item = { role: "user"; text: string } | { role: "assistant"; turn: Turn } | { role: "error"; text: string };

export const CREATE_IDEAS = [
  "Lead form for my digital marketing agency: name, phone, email, service, budget",
  "Clinic appointment booking with doctor, date, time slot and symptoms",
  "Restaurant feedback survey; if rating is poor ask what went wrong",
  "Real estate enquiry: buy or rent, budget, location, property type, site visit date",
  "Coaching institute admission enquiry with course, class and preferred batch",
];
export const EDIT_IDEAS = [
  "Add a screen asking for delivery address and pincode",
  "Translate the whole form to Hindi",
  "Make the email question optional",
  "Add a consent checkbox at the end",
];

export function FlowOutline({ def }: { def: FlowDefinition }) {
  const pos = new Map(def.screens.map((s, i) => [s.id, i + 1] as const));
  return (
    <ol className="space-y-1.5">
      {def.screens.map((s, i) => {
        const q = s.components.filter(isInput);
        return (
          <li key={s.id} className="rounded-lg border bg-background p-2.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[11px] font-semibold">{i + 1}</span>
              <span className="truncate">{s.title}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-normal text-muted-foreground">
                {s.branch && <><GitBranch className="h-3 w-3" />{pos.get(s.branch.goTo)} ·</>}
                {s.next === COMPLETE ? <><Flag className="h-3 w-3" />Finish</> : `→ ${pos.get(s.next)}`}
              </span>
            </div>
            {q.length > 0 && (
              <p className="mt-1 line-clamp-2 pl-7 text-xs text-muted-foreground">
                {q.map((c) => `${c.label}${c.required ? "" : " (optional)"} · ${COMPONENT_META[c.type].label.toLowerCase()}`).join(", ")}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function FlowAiChat({
  channelId, flowId, getCurrent, ideas, placeholder, intro, onResult, renderResult, className,
}: {
  channelId: string;
  flowId?: string;
  /** editor: the flow as currently on screen (unsaved edits included) */
  getCurrent?: () => { definition: FlowDefinition; name?: string; cta?: string; body?: string; settings?: FlowSettings };
  ideas: string[];
  placeholder: string;
  intro: string;
  onResult?: (r: AiFlowResult) => void;
  renderResult?: (r: AiFlowResult, isLatest: boolean) => React.ReactNode;
  className?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<AiFlowResult | null>(null); // last flow (refined on follow-ups in create mode)
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [items]);

  const history = (list: Item[]): ChatMsg[] => list.flatMap<ChatMsg>((it) => {
    if (it.role === "user") return [{ role: "user", content: it.text }];
    if (it.role === "assistant") return [{ role: "assistant", content: it.turn.type === "question" ? JSON.stringify({ type: "question", question: it.turn.question, options: it.turn.options }) : JSON.stringify({ type: "flow", summary: it.turn.summary }) }];
    return [];
  });

  const ask = useMutation({
    mutationFn: async (list: Item[]) => {
      const current = getCurrent ? getCurrent() : draft ? { definition: draft.definition, name: draft.name, cta: draft.cta, body: draft.body, settings: draft.settings } : undefined;
      return (await apiRequest("POST", "/api/flow-studio/ai", { channelId, flowId, messages: history(list), current })).json() as Promise<Turn>;
    },
    onSuccess: (turn) => {
      setItems((x) => [...x, { role: "assistant", turn }]);
      if (turn.type === "flow") { setDraft(turn); onResult?.(turn); }
    },
    onError: (e: Error) => setItems((x) => [...x, { role: "error", text: e.message }]),
  });

  const send = (msg: string) => {
    const m = msg.trim();
    if (!m || ask.isPending) return;
    const list: Item[] = [...items, { role: "user", text: m }];
    setItems(list); setText("");
    ask.mutate(list);
  };
  const lastFlowIdx = items.map((it, i) => (it.role === "assistant" && it.turn.type === "flow" ? i : -1)).filter((i) => i >= 0).pop();

  return (
    <div className={`flex min-h-0 flex-col ${className || ""}`}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <div className="flex gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)]"><Sparkles className="h-3.5 w-3.5" /></span>
          <div className="space-y-2.5 text-sm">
            <p>{intro}</p>
            {items.length === 0 && (
              <div className="flex flex-col items-start gap-1.5">
                {ideas.map((i) => <button key={i} type="button" onClick={() => send(i)} className="rounded-lg border bg-background px-2.5 py-1.5 text-left text-xs hover:border-[var(--brand)]/50 hover:bg-[var(--brand)]/5">{i}</button>)}
              </div>
            )}
          </div>
        </div>
        {items.map((it, i) => {
          if (it.role === "user") return <div key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[var(--brand)] px-3 py-2 text-sm text-white">{it.text}</div>;
          if (it.role === "error") return (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <span className="flex-1">{it.text}</span>
              <Button size="sm" variant="ghost" className="h-7 text-red-800" onClick={() => { const list = items.slice(0, i); setItems(list); ask.mutate(list); }}><RotateCcw className="mr-1 h-3.5 w-3.5" />Retry</Button>
            </div>
          );
          const t = it.turn;
          return (
            <div key={i} className="flex gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted"><Bot className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                {t.type === "question" ? (
                  <>
                    <p className="whitespace-pre-wrap">{t.question}</p>
                    {i === items.length - 1 && t.options.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">{t.options.map((o) => <button key={o} type="button" onClick={() => send(o)} className="rounded-full border px-3 py-1 text-xs hover:border-[var(--brand)] hover:bg-[var(--brand)]/5">{o}</button>)}</div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2.5 rounded-xl border bg-muted/30 p-3">
                    <p className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand)]" />{t.summary}</p>
                    <FlowOutline def={t.definition} />
                    {t.notes.map((n) => <p key={n} className="text-xs text-amber-700">{n}</p>)}
                    {renderResult?.(t, i === lastFlowIdx)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {ask.isPending && (
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted"><Wand2 className="h-3.5 w-3.5 animate-pulse" /></span>
            {items.filter((x) => x.role === "user").length > 1 || getCurrent ? "Updating the flow…" : "Designing your flow…"}
          </div>
        )}
        <div ref={end} />
      </div>
      <form className="mt-3 flex items-end gap-2 rounded-xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <Textarea aria-label="Message to AI" rows={2} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
          className="min-h-[44px] resize-none border-0 p-1.5 shadow-none focus-visible:ring-0" />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0 rounded-full" disabled={!text.trim() || ask.isPending} aria-label="Send">
          {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </form>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground">Uses the Gemini key from Settings → AI Assistant. Check the result before publishing.</p>
    </div>
  );
}
