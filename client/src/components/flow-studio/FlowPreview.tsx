/**
 * Phone canvas for Flow Studio. Renders a screen the way WhatsApp shows a Flow.
 *  - edit mode: click to select a block, drag blocks to reorder, drop new blocks from the palette
 *  - try mode: fill the form and walk through screens (branch rules applied)
 */
import { Fragment, useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, CalendarDays, Check, ChevronDown, Copy, GripVertical, ImageIcon, MoreVertical, Trash2, X } from "lucide-react";
import { COMPLETE, isMulti, type ComponentKind, type FlowComponent, type FlowScreen } from "@shared/flow-studio";

export const DND_NEW = "application/x-hc-flow-new";
export const DND_MOVE = "application/x-hc-flow-move";

function Rich({ text }: { text: string }) {
  // WhatsApp-style *bold* and _italic_, line breaks kept
  const parts = String(text || "").split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return <>{parts.map((p, i) => p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <b key={i}>{p.slice(1, -1)}</b> : p.startsWith("_") && p.endsWith("_") && p.length > 2 ? <i key={i}>{p.slice(1, -1)}</i> : <Fragment key={i}>{p}</Fragment>)}</>;
}

type Values = Record<string, any>;

function Field({ c, value, onChange, live }: { c: FlowComponent; value: any; onChange: (v: any) => void; live: boolean }) {
  const req = c.required ? "" : " (optional)";
  const box = "w-full rounded-lg border border-[#c7c7c7] bg-white px-3 text-[14px] text-[#111b21] outline-none focus:border-[#1daa61]";
  const lab = <p className="mb-1 text-[12px] text-[#54656f]">{c.label || "Label"}{req}</p>;
  const helper = c.helperText ? <p className="mt-1 text-[11px] text-[#667781]">{c.helperText}</p> : null;
  switch (c.type) {
    case "TextInput":
      return <div>{lab}<input disabled={!live} className={`${box} h-11`} type={c.inputType === "password" || c.inputType === "passcode" ? "password" : c.inputType === "number" ? "number" : c.inputType === "email" ? "email" : c.inputType === "phone" ? "tel" : "text"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={c.maxChars || undefined} />{helper}</div>;
    case "TextArea":
      return <div>{lab}<textarea disabled={!live} rows={3} className={`${box} py-2`} value={value ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={c.maxChars || undefined} />{helper}</div>;
    case "DatePicker":
      return (
        <div>{lab}
          <div className="relative">
            <input disabled={!live} type="date" className={`${box} h-11 pr-9`} value={value ?? ""} min={c.minDate || undefined} max={c.maxDate || undefined} onChange={(e) => onChange(e.target.value)} />
            {!live && <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54656f]" />}
          </div>{helper}
        </div>
      );
    case "Dropdown":
      return (
        <div>{lab}
          <div className="relative">
            <select disabled={!live} className={`${box} h-11 appearance-none pr-9`} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
              <option value="">Select</option>
              {(c.options || []).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#54656f]" />
          </div>
        </div>
      );
    case "RadioButtonsGroup":
    case "CheckboxGroup": {
      const multi = c.type === "CheckboxGroup";
      const cur: string[] = multi ? (Array.isArray(value) ? value : []) : value ? [value] : [];
      return (
        <div>
          <p className="mb-2 text-[14px] font-medium text-[#111b21]">{c.label || "Label"}<span className="font-normal text-[#667781]">{req}</span></p>
          <div className="divide-y divide-[#e9edef] rounded-lg border border-[#e9edef]">
            {(c.options || []).map((o) => {
              const on = cur.includes(o.id);
              return (
                <button type="button" key={o.id} disabled={!live}
                  onClick={() => onChange(multi ? (on ? cur.filter((x) => x !== o.id) : [...cur, o.id]) : o.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:cursor-default">
                  <span className="min-w-0 flex-1"><span className="block text-[14px] text-[#111b21]">{o.title}</span>{o.description && <span className="block text-[12px] text-[#667781]">{o.description}</span>}</span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${multi ? "rounded" : "rounded-full"} ${on ? "border-[#1daa61] bg-[#1daa61]" : "border-[#8696a0]"}`}>{on && (multi ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-white" />)}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case "ChipsSelector": {
      const cur: string[] = Array.isArray(value) ? value : [];
      return (
        <div>
          <p className="mb-2 text-[14px] font-medium text-[#111b21]">{c.label || "Label"}<span className="font-normal text-[#667781]">{req}</span></p>
          <div className="flex flex-wrap gap-2">
            {(c.options || []).map((o) => {
              const on = cur.includes(o.id);
              return <button type="button" key={o.id} disabled={!live} onClick={() => onChange(on ? cur.filter((x) => x !== o.id) : [...cur, o.id])} className={`rounded-full border px-3 py-1.5 text-[13px] ${on ? "border-[#1daa61] bg-[#d9fdd3] text-[#111b21]" : "border-[#c7c7c7] text-[#111b21]"}`}>{on && <Check className="-ml-0.5 mr-1 inline h-3 w-3" />}{o.title}</button>;
            })}
          </div>
        </div>
      );
    }
    case "OptIn":
      return (
        <button type="button" disabled={!live} onClick={() => onChange(!value)} className="flex w-full items-start gap-3 text-left disabled:cursor-default">
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${value ? "border-[#1daa61] bg-[#1daa61]" : "border-[#8696a0]"}`}>{value && <Check className="h-3 w-3 text-white" strokeWidth={3} />}</span>
          <span className="text-[14px] text-[#111b21]">{c.label || "I agree"}{!c.required && <span className="text-[#667781]"> (optional)</span>}</span>
        </button>
      );
    default: return null;
  }
}

export function Block({ c, value, onChange, live }: { c: FlowComponent; value?: any; onChange?: (v: any) => void; live?: boolean }) {
  switch (c.type) {
    case "TextHeading": return <h2 className="whitespace-pre-wrap text-[20px] font-bold leading-snug text-[#111b21]">{c.text || "Heading"}</h2>;
    case "TextSubheading": return <h3 className="whitespace-pre-wrap text-[16px] font-semibold text-[#111b21]">{c.text || "Subheading"}</h3>;
    case "TextBody": return <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#111b21]"><Rich text={c.text || ""} /></p>;
    case "TextCaption": return <p className="whitespace-pre-wrap text-[12px] text-[#667781]"><Rich text={c.text || ""} /></p>;
    case "Image":
      return c.src
        ? <img src={`data:image/*;base64,${c.src}`} alt={c.altText || ""} style={{ height: c.height || 160 }} className="w-full rounded-lg object-contain" />
        : <div style={{ height: c.height || 160 }} className="flex w-full flex-col items-center justify-center rounded-lg bg-[#f0f2f5] text-[12px] text-[#667781]"><ImageIcon className="mb-1 h-6 w-6" />Upload an image</div>;
    default: return <Field c={c} value={value} onChange={onChange || (() => {})} live={!!live} />;
  }
}

export interface PreviewProps {
  screen: FlowScreen;
  businessName: string;
  mode: "edit" | "try";
  selectedId?: string | null;
  errorIds?: Set<string>;
  onSelect?: (id: string | null) => void;
  onDropNew?: (type: ComponentKind, index: number) => void;
  onMove?: (id: string, index: number) => void;
  onAction?: (id: string, action: "up" | "down" | "duplicate" | "delete") => void;
  values?: Values;
  setValue?: (name: string, v: any) => void;
  onSubmit?: () => void;
  onClose?: () => void;
  footerNote?: ReactNode;
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-[340px] shrink-0 rounded-[2.75rem] border-[10px] border-[#1f2c34] bg-[#1f2c34] shadow-[0_30px_60px_-20px_rgba(17,27,33,0.45)]">
      <div className="absolute left-1/2 top-1.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[#1f2c34]" />
      <div className="relative h-[660px] overflow-hidden rounded-[2.1rem] bg-[#efeae2]">{children}</div>
    </div>
  );
}

export default function FlowPreview(p: PreviewProps) {
  const [dropAt, setDropAt] = useState<number | null>(null);
  const comps = p.screen.components;
  const edit = p.mode === "edit";

  const indexFromEvent = (e: DragEvent, i: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? i : i + 1;
  };
  const accept = (e: DragEvent) => e.dataTransfer.types.includes(DND_NEW) || e.dataTransfer.types.includes(DND_MOVE);
  const drop = (e: DragEvent, index: number) => {
    e.preventDefault(); e.stopPropagation(); setDropAt(null);
    const t = e.dataTransfer.getData(DND_NEW);
    const id = e.dataTransfer.getData(DND_MOVE);
    if (t) p.onDropNew?.(t as ComponentKind, index);
    else if (id) p.onMove?.(id, index);
  };
  const Line = ({ at }: { at: number }) => (dropAt === at ? <div className="-my-1 h-1 rounded-full bg-[#1daa61]" /> : null);

  return (
    <PhoneFrame>
      {/* status bar + dimmed chat behind the sheet */}
      <div className="flex h-8 items-end justify-between px-6 pb-1 text-[11px] font-medium text-[#111b21]"><span>9:41</span><span>●●● 5G</span></div>
      <div className="absolute inset-x-0 bottom-0 top-9 flex flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_-6px_20px_rgba(0,0,0,0.12)]">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#e9edef] px-3">
          <button type="button" onClick={p.onClose} className="rounded-full p-1.5 text-[#54656f] hover:bg-black/5" aria-label="Close"><X className="h-5 w-5" /></button>
          <p className="truncate px-2 text-[15px] font-semibold text-[#111b21]">{p.screen.title || "Screen title"}</p>
          <MoreVertical className="h-5 w-5 text-[#54656f]" />
        </div>
        <div
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
          onClick={() => edit && p.onSelect?.(null)}
          onDragOver={(e) => { if (edit && accept(e)) { e.preventDefault(); if (!comps.length) setDropAt(0); } }}
          onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropAt(null); }}
          onDrop={(e) => edit && drop(e, dropAt ?? comps.length)}
        >
          {comps.length === 0 && edit && (
            <div className={`flex h-40 items-center justify-center rounded-xl border-2 border-dashed text-center text-[13px] ${dropAt === 0 ? "border-[#1daa61] bg-[#1daa61]/5 text-[#1daa61]" : "border-[#d1d7db] text-[#667781]"}`}>
              Drag blocks here<br />or click one in the panel
            </div>
          )}
          {comps.map((c, i) => {
            const sel = edit && p.selectedId === c.id;
            const bad = p.errorIds?.has(c.id);
            return (
              <Fragment key={c.id}>
                <Line at={i} />
                <div
                  draggable={edit}
                  onDragStart={(e) => { e.dataTransfer.setData(DND_MOVE, c.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { if (edit && accept(e)) { e.preventDefault(); e.stopPropagation(); setDropAt(indexFromEvent(e, i)); } }}
                  onDrop={(e) => edit && drop(e, indexFromEvent(e, i))}
                  onClick={(e) => { if (edit) { e.stopPropagation(); p.onSelect?.(c.id); } }}
                  className={`group relative rounded-lg ${edit ? "-mx-2 cursor-pointer px-2 py-1.5 ring-offset-2 transition-shadow hover:ring-1 hover:ring-[#1daa61]/50" : ""} ${sel ? "ring-2 ring-[#1daa61]" : bad ? "ring-2 ring-red-400" : ""}`}
                >
                  {edit && (
                    <>
                      <GripVertical className="absolute -left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0] opacity-0 group-hover:opacity-100" />
                      <div className={`absolute -top-3 right-1 z-10 items-center gap-0.5 rounded-md border bg-white p-0.5 shadow-sm ${sel ? "flex" : "hidden group-hover:flex"}`}>
                        {([["up", ArrowUp, "Move up"], ["down", ArrowDown, "Move down"], ["duplicate", Copy, "Duplicate"], ["delete", Trash2, "Delete"]] as const).map(([a, Icon, label]) => (
                          <button key={a} type="button" aria-label={label} title={label} onClick={(e) => { e.stopPropagation(); p.onAction?.(c.id, a); }} className={`rounded p-1 hover:bg-[#f0f2f5] ${a === "delete" ? "text-red-600" : "text-[#54656f]"}`}><Icon className="h-3.5 w-3.5" /></button>
                        ))}
                      </div>
                      {/* block content is a picture in edit mode: inputs shouldn't steal clicks */}
                      <div className="pointer-events-none"><Block c={c} /></div>
                    </>
                  )}
                  {!edit && <Block c={c} live value={p.values?.[c.name || ""]} onChange={(v) => c.name && p.setValue?.(c.name, v)} />}
                </div>
              </Fragment>
            );
          })}
          <Line at={comps.length} />
        </div>
        <div className="shrink-0 border-t border-[#e9edef] px-4 pb-3 pt-3">
          <button type="button" onClick={() => !edit && p.onSubmit?.()} className="h-11 w-full rounded-full bg-[#1daa61] text-[15px] font-semibold text-white transition-colors hover:bg-[#15965a] disabled:opacity-60">
            {p.screen.footerLabel || (p.screen.next === COMPLETE ? "Submit" : "Continue")}
          </button>
          <p className="mt-2 text-center text-[11px] text-[#667781]">{p.footerNote || <>Managed by {p.businessName}. <span className="text-[#027eb5]">Learn more</span></>}</p>
        </div>
      </div>
    </PhoneFrame>
  );
}

/** Which required fields on this screen are still empty (try mode). */
export function missingRequired(screen: FlowScreen, values: Values) {
  return screen.components.filter((c) => {
    if (!c.required || !c.name) return false;
    const v = values[c.name];
    if (c.type === "OptIn") return !v;
    if (isMulti(c.type)) return !Array.isArray(v) || v.length === 0 || (c.minSelected ? v.length < c.minSelected : false);
    return v === undefined || v === null || String(v).trim() === "";
  });
}
