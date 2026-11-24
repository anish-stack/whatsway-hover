/** Right-hand properties panel of Flow Studio: block settings or screen settings. */
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, GitBranch, ImageUp, ListPlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  COMPLETE, COMPONENT_META, LIMITS, hasOptions, isInput, isMulti, isSingleChoice, slugOption,
  type FlowComponent, type FlowDefinition, type FlowIssue, type FlowScreen, type InputType,
} from "@shared/flow-studio";

function Count({ v, max }: { v?: string; max: number }) {
  const n = [...String(v || "")].length;
  return <span className={`text-[11px] tabular-nums ${n > max ? "font-medium text-red-600" : "text-muted-foreground"}`}>{n}/{max}</span>;
}

function Row({ label, htmlFor, children, counter }: { label: string; htmlFor?: string; children: React.ReactNode; counter?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between"><Label htmlFor={htmlFor} className="text-xs font-medium">{label}</Label>{counter}</div>
      {children}
    </div>
  );
}

const INPUT_TYPES: Array<{ v: InputType; l: string }> = [
  { v: "text", l: "Text" }, { v: "email", l: "Email" }, { v: "phone", l: "Phone" }, { v: "number", l: "Number" }, { v: "password", l: "Password" }, { v: "passcode", l: "PIN / code" },
];

/** Shrinks an image in the browser until it fits WhatsApp's limit; returns base64 without the data: prefix. */
async function toFlowImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    let w = Math.min(img.naturalWidth, 900);
    for (let attempt = 0; attempt < 8; attempt++) {
      const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      const q = Math.max(0.5, 0.85 - attempt * 0.05);
      const b64 = canvas.toDataURL("image/jpeg", q).split(",")[1];
      if ((b64.length * 3) / 4 <= 250 * 1024) return b64;
      w = Math.round(w * 0.8);
    }
    throw new Error("Image is too detailed — try a smaller one.");
  } finally { URL.revokeObjectURL(url); }
}

export function BlockInspector({ c, onChange, issues, onClose }: { c: FlowComponent; onChange: (patch: Partial<FlowComponent>) => void; issues: FlowIssue[]; onClose: () => void }) {
  const meta = COMPONENT_META[c.type];
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [imgErr, setImgErr] = useState("");
  const [bulk, setBulk] = useState<string | null>(null);
  const labelMax = LIMITS.label[c.type];

  const setOptions = (options: NonNullable<FlowComponent["options"]>) => onChange({ options });
  const opts = c.options || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><p className="text-sm font-semibold">{meta?.label}</p><p className="text-xs text-muted-foreground">{meta?.hint}</p></div>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose} aria-label="Close block settings"><X className="h-4 w-4" /></Button>
      </div>

      {["TextHeading", "TextSubheading", "TextBody", "TextCaption"].includes(c.type) ? (
        <Row label="Text" htmlFor="b-text" counter={<Count v={c.text} max={(LIMITS as any)[c.type]} />}>
          <Textarea id="b-text" rows={c.type === "TextBody" ? 6 : 2} value={c.text || ""} onChange={(e) => onChange({ text: e.target.value })} />
          {c.type === "TextBody" && <p className="text-[11px] text-muted-foreground">Use *bold* and _italic_.</p>}
        </Row>
      ) : null}

      {c.type === "Image" && (
        <>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
              setBusy(true); setImgErr("");
              try { onChange({ src: await toFlowImage(f) }); } catch (err: any) { setImgErr(err.message || "Couldn't read that image"); } finally { setBusy(false); }
            }} />
            <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageUp className="mr-2 h-4 w-4" />}{c.src ? "Replace image" : "Upload image"}</Button>
            <p className="text-[11px] text-muted-foreground">Resized automatically to fit WhatsApp's 300 KB limit.</p>
            {imgErr && <p className="text-xs text-red-600">{imgErr}</p>}
          </div>
          <Row label="Description for screen readers" htmlFor="b-alt"><Input id="b-alt" maxLength={100} value={c.altText || ""} onChange={(e) => onChange({ altText: e.target.value })} /></Row>
          <Row label={`Height · ${c.height || 160}px`} htmlFor="b-h"><input id="b-h" type="range" min={80} max={400} step={10} value={c.height || 160} onChange={(e) => onChange({ height: Number(e.target.value) })} className="w-full accent-[var(--brand)]" /></Row>
        </>
      )}

      {isInput(c) && (
        <>
          <Row label="Question" htmlFor="b-label" counter={labelMax ? <Count v={c.label} max={labelMax} /> : undefined}>
            <Input id="b-label" value={c.label || ""} onChange={(e) => onChange({ label: e.target.value })} />
          </Row>
          {c.type === "TextInput" && (
            <Row label="Answer type">
              <Select value={c.inputType || "text"} onValueChange={(v) => onChange({ inputType: v as InputType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INPUT_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
            </Row>
          )}
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <Label htmlFor="b-req" className="text-sm">{c.type === "OptIn" ? "Must be ticked" : "Required"}</Label>
            <Switch id="b-req" checked={!!c.required} onCheckedChange={(v) => onChange({ required: v })} />
          </div>
          {["TextInput", "TextArea", "DatePicker"].includes(c.type) && (
            <Row label="Helper text" htmlFor="b-help" counter={<Count v={c.helperText} max={LIMITS.helperText} />}>
              <Input id="b-help" placeholder="Shown under the field" value={c.helperText || ""} onChange={(e) => onChange({ helperText: e.target.value })} />
            </Row>
          )}
          {(c.type === "TextInput" || c.type === "TextArea") && (
            <div className="grid grid-cols-2 gap-3">
              {c.type === "TextInput" && <Row label="Min length" htmlFor="b-min"><Input id="b-min" type="number" min={0} value={c.minChars ?? ""} onChange={(e) => onChange({ minChars: e.target.value ? Number(e.target.value) : undefined })} /></Row>}
              <Row label="Max length" htmlFor="b-max"><Input id="b-max" type="number" min={0} value={c.maxChars ?? ""} onChange={(e) => onChange({ maxChars: e.target.value ? Number(e.target.value) : undefined })} /></Row>
            </div>
          )}
          {c.type === "DatePicker" && (
            <div className="grid grid-cols-2 gap-3">
              <Row label="Earliest" htmlFor="b-d1"><Input id="b-d1" type="date" value={c.minDate || ""} onChange={(e) => onChange({ minDate: e.target.value || undefined })} /></Row>
              <Row label="Latest" htmlFor="b-d2"><Input id="b-d2" type="date" value={c.maxDate || ""} onChange={(e) => onChange({ maxDate: e.target.value || undefined })} /></Row>
            </div>
          )}

          {hasOptions(c.type) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Options · {opts.length}/{LIMITS.options[c.type][1]}</Label>
                <button type="button" className="text-xs font-medium text-[var(--brand)] hover:underline" onClick={() => setBulk(bulk === null ? opts.map((o) => o.title).join("\n") : null)}>{bulk === null ? "Paste a list" : "Back to editor"}</button>
              </div>
              {bulk !== null ? (
                <div className="space-y-2">
                  <Textarea rows={8} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="One option per line" />
                  <Button size="sm" className="w-full" onClick={() => {
                    const ids: string[] = [];
                    const titles = bulk.split("\n").map((t) => t.trim()).filter(Boolean).slice(0, LIMITS.options[c.type][1]);
                    setOptions(titles.map((t) => { const keep = opts.find((o) => o.title === t); const id = keep && !ids.includes(keep.id) ? keep.id : slugOption(t, ids); ids.push(id); return { id, title: t, description: keep?.description }; }));
                    setBulk(null);
                  }}><ListPlus className="mr-2 h-4 w-4" />Use these options</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {opts.map((o, i) => (
                    <div key={o.id + i} className="rounded-lg border p-2">
                      <div className="flex items-center gap-1">
                        <Input aria-label={`Option ${i + 1}`} className="h-8" value={o.title} onChange={(e) => setOptions(opts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={i === 0} onClick={() => { const n = [...opts]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setOptions(n); }} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" disabled={i === opts.length - 1} onClick={() => { const n = [...opts]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setOptions(n); }} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-red-600" onClick={() => setOptions(opts.filter((_, j) => j !== i))} aria-label="Remove option"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                      {c.type !== "ChipsSelector" && (
                        <Input className="mt-1.5 h-7 text-xs" placeholder="Description (optional)" value={o.description || ""} onChange={(e) => setOptions(opts.map((x, j) => (j === i ? { ...x, description: e.target.value || undefined } : x)))} />
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">Saved as <code>{o.id}</code></p>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="w-full" disabled={opts.length >= LIMITS.options[c.type][1]} onClick={() => {
                    const t = `Option ${opts.length + 1}`; setOptions([...opts, { id: slugOption(t, opts.map((o) => o.id)), title: t }]);
                  }}><Plus className="mr-2 h-4 w-4" />Add option</Button>
                </div>
              )}
              {isMulti(c.type) && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Row label="Min picks" htmlFor="b-ms"><Input id="b-ms" type="number" min={0} value={c.minSelected ?? ""} onChange={(e) => onChange({ minSelected: e.target.value ? Number(e.target.value) : undefined })} /></Row>
                  <Row label="Max picks" htmlFor="b-mx"><Input id="b-mx" type="number" min={0} value={c.maxSelected ?? ""} onChange={(e) => onChange({ maxSelected: e.target.value ? Number(e.target.value) : undefined })} /></Row>
                </div>
              )}
            </div>
          )}

          <Row label="Field key" htmlFor="b-key">
            <Input id="b-key" className="font-mono text-xs" value={c.name || ""} onChange={(e) => onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 80) })} />
            <p className="text-[11px] text-muted-foreground">Column name in responses and exports.</p>
          </Row>
        </>
      )}

      {issues.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {issues.map((i, k) => <li key={k}>{i.message.replace(/^Screen \d+ · [^:]+: /, "")}</li>)}
        </ul>
      )}
    </div>
  );
}

export function ScreenInspector({ def, screen, index, onChange, onDelete, issues }: {
  def: FlowDefinition; screen: FlowScreen; index: number; onChange: (patch: Partial<FlowScreen>) => void; onDelete: () => void; issues: FlowIssue[];
}) {
  const later = def.screens.slice(index + 1);
  const choice = screen.components.filter((c) => isSingleChoice(c.type) && c.name && (c.options || []).length);
  const rule = screen.branch;
  const ruleField = choice.find((c) => c.name === rule?.field);
  const screenName = (s: FlowScreen) => `${def.screens.indexOf(s) + 1}. ${s.title || "Untitled"}`;

  return (
    <div className="space-y-5">
      <div><p className="text-sm font-semibold">Screen {index + 1}</p><p className="text-xs text-muted-foreground">Click a block on the phone to edit it.</p></div>
      <Row label="Title" htmlFor="s-title" counter={<Count v={screen.title} max={LIMITS.screenTitle} />}>
        <Input id="s-title" value={screen.title} onChange={(e) => onChange({ title: e.target.value })} />
      </Row>
      <Row label="Button label" htmlFor="s-btn" counter={<Count v={screen.footerLabel} max={LIMITS.footerLabel} />}>
        <Input id="s-btn" value={screen.footerLabel} onChange={(e) => onChange({ footerLabel: e.target.value })} />
      </Row>
      <Row label="When the button is tapped">
        <Select value={screen.next} onValueChange={(v) => onChange({ next: v, branch: v === COMPLETE ? null : screen.branch })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {later.map((s) => <SelectItem key={s.id} value={s.id}>Go to {screenName(s)}</SelectItem>)}
            <SelectItem value={COMPLETE}>Finish and submit answers</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <div className="space-y-3 rounded-xl border p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium"><GitBranch className="h-4 w-4" />Rule</p>
          <Switch
            aria-label="Use a rule"
            checked={!!rule}
            disabled={!choice.length || !later.length || screen.next === COMPLETE}
            onCheckedChange={(on) => onChange({ branch: on ? { field: choice[0].name!, equals: choice[0].options![0].id, goTo: later.find((s) => s.id !== screen.next)?.id || later[0].id } : null })}
          />
        </div>
        {!rule && (
          <p className="text-xs text-muted-foreground">
            {screen.next === COMPLETE ? "Point the button to another screen first, then send people to different screens based on an answer."
              : !choice.length ? "Add a dropdown or single-choice question to this screen to send people to different screens."
              : "Send people to a different screen based on their answer."}
          </p>
        )}
        {rule && (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <span className="text-xs text-muted-foreground">If</span>
              <Select value={rule.field} onValueChange={(v) => { const f = choice.find((c) => c.name === v)!; onChange({ branch: { ...rule, field: v, equals: f.options![0].id } }); }}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{choice.map((c) => <SelectItem key={c.name} value={c.name!}>{c.label || c.name}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">is</span>
              <Select value={rule.equals} onValueChange={(v) => onChange({ branch: { ...rule, equals: v } })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{(ruleField?.options || []).map((o) => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">go to</span>
              <Select value={rule.goTo} onValueChange={(v) => onChange({ branch: { ...rule, goTo: v } })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{later.map((s) => <SelectItem key={s.id} value={s.id}>{screenName(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Everyone else follows the button above.</p>
          </div>
        )}
      </div>

      {issues.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {issues.map((i, k) => <li key={k}>{i.message}</li>)}
        </ul>
      )}
      <Button variant="ghost" className="w-full text-red-600 hover:bg-red-50 hover:text-red-700" disabled={def.screens.length <= 1} onClick={onDelete}><Trash2 className="mr-2 h-4 w-4" />Delete screen</Button>
    </div>
  );
}
