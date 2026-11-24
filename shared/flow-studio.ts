/**
 * Flow Studio — the no-code model behind WhatsApp Flows.
 *
 * The builder edits a small, safe model (screens → components). This file turns
 * that model into Meta's Flow JSON (static "navigate" flows, no endpoint needed),
 * validates it against WhatsApp's limits before anything is sent to Meta, reads
 * simple Flow JSON back into the model (import), and ships ready-made starters.
 *
 * Shared by the server (compile/validate on save + publish) and the client
 * (live preview, inline errors).
 */

export const FLOW_JSON_VERSION = "7.3";
export const COMPLETE = "__complete";
export const MAX_SCREENS = 15;

export const FLOW_CATEGORIES = [
  { id: "LEAD_GENERATION", label: "Lead generation" },
  { id: "APPOINTMENT_BOOKING", label: "Appointment booking" },
  { id: "SIGN_UP", label: "Sign up" },
  { id: "SIGN_IN", label: "Sign in" },
  { id: "CONTACT_US", label: "Contact us" },
  { id: "CUSTOMER_SUPPORT", label: "Customer support" },
  { id: "SURVEY", label: "Survey" },
  { id: "OTHER", label: "Other" },
] as const;
export type FlowCategory = (typeof FLOW_CATEGORIES)[number]["id"];

export type TextKind = "TextHeading" | "TextSubheading" | "TextBody" | "TextCaption";
export type InputKind = "TextInput" | "TextArea" | "Dropdown" | "RadioButtonsGroup" | "CheckboxGroup" | "ChipsSelector" | "DatePicker" | "OptIn";
export type ComponentKind = TextKind | InputKind | "Image";
export type InputType = "text" | "number" | "email" | "phone" | "password" | "passcode";

export interface OptionItem { id: string; title: string; description?: string }

export interface FlowComponent {
  id: string;
  type: ComponentKind;
  text?: string;
  name?: string;
  label?: string;
  required?: boolean;
  helperText?: string;
  inputType?: InputType;
  minChars?: number;
  maxChars?: number;
  options?: OptionItem[];
  minSelected?: number;
  maxSelected?: number;
  minDate?: string;
  maxDate?: string;
  /** Image: base64 (no data: prefix), JPEG/PNG */
  src?: string;
  altText?: string;
  height?: number;
}

export interface FlowBranch { field: string; equals: string; goTo: string }

export interface FlowScreen {
  id: string;
  title: string;
  components: FlowComponent[];
  footerLabel: string;
  /** Next screen id, or COMPLETE to finish the flow */
  next: string;
  /** Optional: if <field> equals <option id>, go to <goTo> instead of `next` */
  branch?: FlowBranch | null;
}

export interface FlowDefinition {
  version: 1;
  screens: FlowScreen[];
  /** Imported Flow JSON the visual builder can't represent — edited as JSON */
  raw?: any;
}

export interface FlowSettings {
  /** Field whose answer becomes the contact's name */
  saveName?: string;
  /** Field whose answer becomes the contact's email */
  saveEmail?: string;
  /** Tags added to the contact when the form is submitted */
  tags?: string[];
  /** Message sent back on WhatsApp after submission ({{name}} = contact name) */
  thankYou?: string;
  /** In-app notification to the account owner on every submission */
  notifyTeam?: boolean;
}

export interface FlowIssue { level: "error" | "warning"; message: string; screenId?: string; componentId?: string }

// ───────────────────────── component catalogue ─────────────────────────

export const TEXT_KINDS: TextKind[] = ["TextHeading", "TextSubheading", "TextBody", "TextCaption"];
export const INPUT_KINDS: InputKind[] = ["TextInput", "TextArea", "Dropdown", "RadioButtonsGroup", "CheckboxGroup", "ChipsSelector", "DatePicker", "OptIn"];
export const isInput = (c: FlowComponent) => (INPUT_KINDS as string[]).includes(c.type);
export const hasOptions = (t: ComponentKind) => t === "Dropdown" || t === "RadioButtonsGroup" || t === "CheckboxGroup" || t === "ChipsSelector";
export const isMulti = (t: ComponentKind) => t === "CheckboxGroup" || t === "ChipsSelector";
export const isSingleChoice = (t: ComponentKind) => t === "Dropdown" || t === "RadioButtonsGroup";

export const COMPONENT_META: Record<ComponentKind, { label: string; hint: string; group: "Text" | "Input" | "Choice" | "Media" }> = {
  TextHeading: { label: "Heading", hint: "Large title", group: "Text" },
  TextSubheading: { label: "Subheading", hint: "Section title", group: "Text" },
  TextBody: { label: "Paragraph", hint: "Body text, supports *bold*", group: "Text" },
  TextCaption: { label: "Caption", hint: "Small grey text", group: "Text" },
  Image: { label: "Image", hint: "JPEG or PNG banner", group: "Media" },
  TextInput: { label: "Short answer", hint: "Name, email, phone, number", group: "Input" },
  TextArea: { label: "Long answer", hint: "Multi-line text", group: "Input" },
  DatePicker: { label: "Date", hint: "Calendar picker", group: "Input" },
  Dropdown: { label: "Dropdown", hint: "Pick one from a list", group: "Choice" },
  RadioButtonsGroup: { label: "Single choice", hint: "Radio buttons", group: "Choice" },
  CheckboxGroup: { label: "Multiple choice", hint: "Checkboxes", group: "Choice" },
  ChipsSelector: { label: "Chips", hint: "Tap-to-select tags", group: "Choice" },
  OptIn: { label: "Consent", hint: "Checkbox to agree", group: "Input" },
};

/** WhatsApp limits (characters / counts) */
export const LIMITS = {
  screenTitle: 30,
  footerLabel: 35,
  TextHeading: 80,
  TextSubheading: 80,
  TextBody: 4096,
  TextCaption: 409,
  label: { TextInput: 20, TextArea: 20, Dropdown: 20, RadioButtonsGroup: 30, CheckboxGroup: 30, ChipsSelector: 80, DatePicker: 40, OptIn: 120 } as Record<string, number>,
  helperText: 80,
  optionTitle: 30,
  optionDescription: 300,
  options: { Dropdown: [1, 200], RadioButtonsGroup: [1, 20], CheckboxGroup: [1, 20], ChipsSelector: [2, 20] } as Record<string, [number, number]>,
  componentsPerScreen: 50,
  optInPerScreen: 5,
  imageBytes: 300 * 1024,
  fieldName: /^[a-zA-Z][a-zA-Z0-9_]{0,79}$/,
  optionId: /^[a-zA-Z0-9_]{1,80}$/,
};

// ───────────────────────── ids & factories ─────────────────────────

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
function randLetters(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return s;
}
export const uid = () => `c${Date.now().toString(36)}${randLetters(4)}`;
/** Screen ids: letters + underscore only (Meta rejects digits), never "SUCCESS". */
export const newScreenId = (taken: string[] = []) => {
  let id = "";
  do id = `SCREEN_${randLetters(6).toUpperCase()}`; while (taken.includes(id));
  return id;
};

export function slugField(label: string, taken: string[]) {
  let base = String(label || "field").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  if (!/^[a-z]/.test(base)) base = `f_${base}`.replace(/_+$/, "") || "field";
  let name = base;
  let i = 2;
  while (taken.includes(name)) name = `${base}_${i++}`;
  return name;
}

export function slugOption(title: string, taken: string[]) {
  let base = String(title || "option").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "option";
  let id = base;
  let i = 2;
  while (taken.includes(id)) id = `${base}_${i++}`;
  return id;
}

export function allFieldNames(def: FlowDefinition) {
  return def.screens.flatMap((s) => s.components.filter(isInput).map((c) => c.name || ""));
}

export function newComponent(type: ComponentKind, def: FlowDefinition): FlowComponent {
  const id = uid();
  const taken = allFieldNames(def);
  switch (type) {
    case "TextHeading": return { id, type, text: "Heading" };
    case "TextSubheading": return { id, type, text: "Subheading" };
    case "TextBody": return { id, type, text: "Write your message here." };
    case "TextCaption": return { id, type, text: "Small print" };
    case "Image": return { id, type, src: "", altText: "Banner", height: 160 };
    case "TextInput": return { id, type, name: slugField("answer", taken), label: "Your answer", required: true, inputType: "text" };
    case "TextArea": return { id, type, name: slugField("details", taken), label: "Details", required: false };
    case "DatePicker": return { id, type, name: slugField("date", taken), label: "Pick a date", required: true };
    case "OptIn": return { id, type, name: slugField("consent", taken), label: "I agree to be contacted on WhatsApp", required: true };
    default: {
      const opts = ["Option 1", "Option 2", "Option 3"];
      const ids: string[] = [];
      return {
        id, type, name: slugField("choice", taken), label: type === "ChipsSelector" ? "Select all that apply" : "Choose one", required: true,
        options: opts.map((t) => { const oid = slugOption(t, ids); ids.push(oid); return { id: oid, title: t }; }),
      };
    }
  }
}

export function newScreen(def: FlowDefinition, title = "New screen"): FlowScreen {
  return { id: newScreenId(def.screens.map((s) => s.id)), title, components: [], footerLabel: "Continue", next: COMPLETE, branch: null };
}

// ───────────────────────── graph helpers ─────────────────────────

export function screenTargets(s: FlowScreen): string[] {
  const out = [s.next];
  if (s.branch?.goTo) out.push(s.branch.goTo);
  return out.filter((t) => t && t !== COMPLETE);
}

/** For each screen: fields answered on earlier screens that can lead to it (carried forward). */
export function carriedFields(def: FlowDefinition): Record<string, FlowComponent[]> {
  const byId = new Map(def.screens.map((s) => [s.id, s] as const));
  const avail: Record<string, Map<string, FlowComponent>> = {};
  def.screens.forEach((s) => (avail[s.id] = new Map()));
  for (const s of def.screens) {
    const mine = new Map(avail[s.id]);
    for (const c of s.components) if (isInput(c) && c.name) mine.set(c.name, c);
    for (const t of screenTargets(s)) {
      if (!byId.has(t)) continue;
      for (const [k, v] of mine) avail[t].set(k, v);
    }
  }
  return Object.fromEntries(Object.entries(avail).map(([k, m]) => [k, [...m.values()]]));
}

// ───────────────────────── compile → Flow JSON ─────────────────────────

function dataSchema(c: FlowComponent) {
  if (isMulti(c.type)) return { type: "array", items: { type: "string" }, __example__: [] as string[] };
  if (c.type === "OptIn") return { type: "boolean", __example__: true };
  return { type: "string", __example__: "" };
}
function emptyValue(c: FlowComponent) {
  if (isMulti(c.type)) return [];
  if (c.type === "OptIn") return false;
  return "";
}
const clean = (o: Record<string, any>) => {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === "" || (Array.isArray(o[k]) && !o[k].length && k !== "data-source")) delete o[k];
  return o;
};

function componentJson(c: FlowComponent): any {
  switch (c.type) {
    case "TextHeading": case "TextSubheading": case "TextBody": case "TextCaption":
      return { type: c.type, text: c.text || " " };
    case "Image":
      return clean({ type: "Image", src: c.src, height: c.height || 160, "scale-type": "contain", "alt-text": c.altText });
    case "TextInput":
      return clean({ type: "TextInput", name: c.name, label: c.label, "input-type": c.inputType || "text", required: !!c.required, "helper-text": c.helperText, "min-chars": c.minChars || undefined, "max-chars": c.maxChars || undefined });
    case "TextArea":
      return clean({ type: "TextArea", name: c.name, label: c.label, required: !!c.required, "helper-text": c.helperText, "max-length": c.maxChars || undefined });
    case "DatePicker":
      return clean({ type: "DatePicker", name: c.name, label: c.label, required: !!c.required, "helper-text": c.helperText, "min-date": c.minDate, "max-date": c.maxDate });
    case "OptIn":
      return { type: "OptIn", name: c.name, label: c.label, required: !!c.required };
    default: {
      const ds = (c.options || []).map((o) => clean({ id: o.id, title: o.title, description: c.type === "ChipsSelector" ? undefined : o.description }));
      const out: any = { type: c.type, name: c.name, label: c.label, required: !!c.required, "data-source": ds };
      if (isMulti(c.type)) {
        if (c.minSelected) out["min-selected-items"] = c.minSelected;
        if (c.maxSelected) out["max-selected-items"] = c.maxSelected;
      }
      return out;
    }
  }
}

export function compileFlow(def: FlowDefinition): any {
  if (def.raw) return def.raw;
  const carried = carriedFields(def);
  const own = (s: FlowScreen) => s.components.filter((c) => isInput(c) && c.name);

  const payloadFor = (s: FlowScreen, wanted: FlowComponent[]) => {
    const mine = new Set(own(s).map((c) => c.name));
    const have = new Set(carried[s.id].map((c) => c.name));
    const p: Record<string, any> = {};
    for (const f of wanted) {
      const n = f.name!;
      p[n] = mine.has(n) ? `\${form.${n}}` : have.has(n) ? `\${data.${n}}` : emptyValue(f);
    }
    return p;
  };
  const footer = (s: FlowScreen, target: string) => {
    if (target === COMPLETE) {
      const all = new Map<string, FlowComponent>();
      for (const c of carried[s.id]) all.set(c.name!, c);
      for (const c of own(s)) all.set(c.name!, c);
      return { type: "Footer", label: s.footerLabel || "Submit", "on-click-action": { name: "complete", payload: payloadFor(s, [...all.values()]) } };
    }
    const action: any = { name: "navigate", next: { type: "screen", name: target } };
    const p = payloadFor(s, carried[target] || []);
    action.payload = p;
    return { type: "Footer", label: s.footerLabel || "Continue", "on-click-action": action };
  };

  const screens = def.screens.map((s) => {
    const children: any[] = s.components.map(componentJson);
    if (s.branch?.field && s.branch.goTo && s.next !== COMPLETE) {
      children.push({
        type: "If",
        condition: `\${form.${s.branch.field}} == '${s.branch.equals}'`,
        then: [footer(s, s.branch.goTo)],
        else: [footer(s, s.next)],
      });
    } else children.push(footer(s, s.next));
    const out: any = { id: s.id, title: s.title || " " };
    if (s.next === COMPLETE) { out.terminal = true; out.success = true; }
    const data = carried[s.id];
    if (data.length) out.data = Object.fromEntries(data.map((c) => [c.name, dataSchema(c)]));
    out.layout = { type: "SingleColumnLayout", children };
    return out;
  });
  // Branching (If → two Footers): spell out every route. WhatsApp's auto-generated
  // routing model misses navigations nested inside If, and the client then refuses
  // the transition ("doesn't satisfy provided routing_model").
  if (def.screens.some((s) => s.branch)) {
    const routing_model = Object.fromEntries(def.screens.map((s) => [s.id, [...new Set(screenTargets(s))]]));
    return { version: FLOW_JSON_VERSION, routing_model, screens };
  }
  return { version: FLOW_JSON_VERSION, screens };
}

export function routeCount(def: FlowDefinition) {
  return def.screens.reduce((n, s) => n + new Set(screenTargets(s)).size, 0);
}

// ───────────────────────── validate ─────────────────────────

const len = (s?: string) => [...String(s || "")].length;

export function validateFlow(def: FlowDefinition): FlowIssue[] {
  const issues: FlowIssue[] = [];
  const err = (message: string, screenId?: string, componentId?: string) => issues.push({ level: "error", message, screenId, componentId });
  const warn = (message: string, screenId?: string, componentId?: string) => issues.push({ level: "warning", message, screenId, componentId });

  if (def.raw) {
    if (!Array.isArray(def.raw?.screens) || !def.raw.screens.length) err("Flow JSON must have at least one screen.");
    if (!def.raw?.version) err("Flow JSON needs a \"version\".");
    return issues;
  }
  const screens = def.screens || [];
  if (!screens.length) { err("Add at least one screen."); return issues; }
  if (screens.length > MAX_SCREENS) err(`A flow can have up to ${MAX_SCREENS} screens.`);

  const index = new Map(screens.map((s, i) => [s.id, i] as const));
  const names = new Map<string, string>();
  const reach = new Set<string>([screens[0].id]);

  screens.forEach((s, i) => {
    const where = `Screen ${i + 1}`;
    if (!/^[A-Za-z_]+$/.test(s.id) || s.id === "SUCCESS") err(`${where}: invalid screen id.`, s.id);
    if (!len(s.title)) err(`${where}: add a title.`, s.id);
    if (len(s.title) > LIMITS.screenTitle) err(`${where}: title is longer than ${LIMITS.screenTitle} characters.`, s.id);
    if (!len(s.footerLabel)) err(`${where}: add a button label.`, s.id);
    if (len(s.footerLabel) > LIMITS.footerLabel) err(`${where}: button label is longer than ${LIMITS.footerLabel} characters.`, s.id);
    if (!s.components.length) err(`${where}: add at least one block.`, s.id);
    if (s.components.length > LIMITS.componentsPerScreen) err(`${where}: too many blocks (max ${LIMITS.componentsPerScreen}).`, s.id);
    if (s.components.filter((c) => c.type === "OptIn").length > LIMITS.optInPerScreen) err(`${where}: max ${LIMITS.optInPerScreen} consent boxes per screen.`, s.id);

    // routing: forward only (no loops), targets must exist
    if (s.next !== COMPLETE) {
      const j = index.get(s.next);
      if (j === undefined) err(`${where}: the button goes to a screen that no longer exists.`, s.id);
      else if (j <= i) err(`${where}: the button can only go to a later screen.`, s.id);
    }
    if (s.branch) {
      const f = s.components.find((c) => c.name === s.branch!.field);
      const j = index.get(s.branch.goTo);
      if (s.next === COMPLETE) err(`${where}: a screen that finishes the flow can't branch. Point the button to a screen first.`, s.id);
      else if (!f || !isSingleChoice(f.type)) err(`${where}: the rule must use a dropdown or single-choice question on this screen.`, s.id);
      else if (!(f.options || []).some((o) => o.id === s.branch!.equals)) err(`${where}: pick the answer that triggers the rule.`, s.id);
      if (j === undefined || j <= i) err(`${where}: the rule must jump to a later screen.`, s.id);
      else if (s.branch.goTo === s.next) warn(`${where}: the rule goes to the same screen as the button.`, s.id);
    }
    if (reach.has(s.id)) for (const t of screenTargets(s)) reach.add(t);

    for (const c of s.components) {
      const label = COMPONENT_META[c.type]?.label || c.type;
      const w = `${where} · ${label}`;
      if ((TEXT_KINDS as string[]).includes(c.type)) {
        if (!len(c.text)) err(`${w}: text is empty.`, s.id, c.id);
        const max = (LIMITS as any)[c.type] as number;
        if (len(c.text) > max) err(`${w}: longer than ${max} characters.`, s.id, c.id);
        continue;
      }
      if (c.type === "Image") {
        if (!c.src) err(`${w}: upload an image.`, s.id, c.id);
        else if (Math.floor((c.src.length * 3) / 4) > LIMITS.imageBytes) err(`${w}: image is larger than 300 KB.`, s.id, c.id);
        continue;
      }
      // inputs
      if (!c.name || !LIMITS.fieldName.test(c.name)) err(`${w}: field key must start with a letter and use letters, numbers or _.`, s.id, c.id);
      else if (names.has(c.name)) err(`${w}: field key "${c.name}" is already used on ${names.get(c.name)}.`, s.id, c.id);
      else names.set(c.name, where);
      if (!len(c.label)) err(`${w}: add a label.`, s.id, c.id);
      const lmax = LIMITS.label[c.type];
      if (lmax && len(c.label) > lmax) err(`${w}: label is longer than ${lmax} characters.`, s.id, c.id);
      if (len(c.helperText) > LIMITS.helperText) err(`${w}: helper text is longer than ${LIMITS.helperText} characters.`, s.id, c.id);
      if (c.type === "TextInput" || c.type === "TextArea") {
        if (c.minChars && c.maxChars && c.minChars > c.maxChars) err(`${w}: minimum length is more than maximum.`, s.id, c.id);
      }
      if (c.type === "DatePicker") {
        for (const d of [c.minDate, c.maxDate]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) err(`${w}: dates must be YYYY-MM-DD.`, s.id, c.id);
        if (c.minDate && c.maxDate && c.minDate > c.maxDate) err(`${w}: earliest date is after latest date.`, s.id, c.id);
      }
      if (hasOptions(c.type)) {
        const opts = c.options || [];
        const [mn, mx] = LIMITS.options[c.type];
        if (opts.length < mn || opts.length > mx) err(`${w}: needs ${mn}–${mx} options.`, s.id, c.id);
        const seen = new Set<string>();
        for (const o of opts) {
          if (!len(o.title)) err(`${w}: an option has no text.`, s.id, c.id);
          if (len(o.title) > LIMITS.optionTitle) err(`${w}: option "${o.title.slice(0, 20)}…" is longer than ${LIMITS.optionTitle} characters.`, s.id, c.id);
          if (len(o.description) > LIMITS.optionDescription) err(`${w}: an option description is too long.`, s.id, c.id);
          if (!LIMITS.optionId.test(o.id) || seen.has(o.id)) err(`${w}: option ids must be unique (letters, numbers, _).`, s.id, c.id);
          seen.add(o.id);
        }
        if (isMulti(c.type)) {
          if (c.minSelected && c.minSelected > opts.length) err(`${w}: minimum selections is more than the number of options.`, s.id, c.id);
          if (c.minSelected && c.maxSelected && c.minSelected > c.maxSelected) err(`${w}: minimum selections is more than maximum.`, s.id, c.id);
        }
      }
    }
    if (!s.components.some(isInput) && s.next === COMPLETE && i === 0) warn(`${where}: this flow collects no answers.`, s.id);
  });

  screens.forEach((s, i) => { if (!reach.has(s.id)) err(`Screen ${i + 1} can't be reached from the first screen.`, s.id); });
  if (!screens.some((s) => s.next === COMPLETE)) err("At least one screen must finish the flow.");
  if (screens.some((s) => s.branch) && routeCount(def) > 10) err("Flows with rules can have at most 10 screen-to-screen connections. Remove a rule or a screen.");
  if (JSON.stringify(compileFlow(def)).length > 9.5 * 1024 * 1024) err("Flow is too large (10 MB limit). Use smaller images.");
  return issues;
}

// ───────────────────────── import Flow JSON → model ─────────────────────────

/** Best-effort: returns null when the JSON uses features the builder doesn't model (endpoints, nested forms…). */
export function parseFlowJson(json: any): FlowDefinition | null {
  try {
    if (!json || !Array.isArray(json.screens) || !json.screens.length) return null;
    if (json.data_api_version) return null; // endpoint flows
    const screens: FlowScreen[] = [];
    for (const raw of json.screens) {
      if (!raw?.id || raw.layout?.type !== "SingleColumnLayout") return null;
      let kids: any[] = raw.layout.children || [];
      if (kids.length === 1 && kids[0]?.type === "Form") kids = kids[0].children || [];
      const s: FlowScreen = { id: String(raw.id), title: String(raw.title || ""), components: [], footerLabel: "Continue", next: COMPLETE, branch: null };
      const readFooter = (f: any): { label: string; target: string } | null => {
        const a = f?.["on-click-action"];
        if (f?.type !== "Footer" || !a) return null;
        if (a.name === "complete") return { label: String(f.label || "Submit"), target: COMPLETE };
        if (a.name === "navigate" && a.next?.name) return { label: String(f.label || "Continue"), target: String(a.next.name) };
        return null;
      };
      for (const k of kids) {
        const t = k?.type;
        if (t === "Footer") {
          const f = readFooter(k); if (!f) return null;
          s.footerLabel = f.label; s.next = f.target; continue;
        }
        if (t === "If") {
          const m = /^\$\{form\.([A-Za-z0-9_]+)\}\s*==\s*'([^']*)'$/.exec(String(k.condition || "").trim());
          const a = readFooter(k.then?.[0]); const b = readFooter(k.else?.[0]);
          if (!m || !a || !b || k.then.length !== 1 || k.else.length !== 1) return null;
          s.branch = { field: m[1], equals: m[2], goTo: a.target }; s.footerLabel = b.label; s.next = b.target; continue;
        }
        const id = uid();
        if ((TEXT_KINDS as string[]).includes(t)) { s.components.push({ id, type: t, text: Array.isArray(k.text) ? k.text.join("\n") : String(k.text || "") }); continue; }
        if (t === "Image") { s.components.push({ id, type: "Image", src: String(k.src || ""), altText: k["alt-text"], height: k.height }); continue; }
        if (!(INPUT_KINDS as string[]).includes(t)) return null;
        if (typeof k.name !== "string" || (k.label && typeof k.label !== "string")) return null;
        const c: FlowComponent = { id, type: t, name: k.name, label: String(k.label || ""), required: !!k.required, helperText: k["helper-text"] };
        if (t === "TextInput") { c.inputType = k["input-type"] || "text"; c.minChars = k["min-chars"]; c.maxChars = k["max-chars"]; }
        if (t === "TextArea") c.maxChars = k["max-length"];
        if (t === "DatePicker") { c.minDate = k["min-date"]; c.maxDate = k["max-date"]; }
        if (hasOptions(t)) {
          if (!Array.isArray(k["data-source"])) return null; // dynamic ${data.x} sources not supported
          c.options = k["data-source"].map((o: any) => ({ id: String(o.id), title: String(o.title || ""), description: o.description }));
          c.minSelected = k["min-selected-items"]; c.maxSelected = k["max-selected-items"];
        }
        s.components.push(c);
      }
      screens.push(s);
    }
    return { version: 1, screens };
  } catch { return null; }
}

// ───────────────────────── responses ─────────────────────────

export interface FieldInfo { name: string; label: string; type: ComponentKind; options?: OptionItem[]; screen: string }

export function listFields(def: FlowDefinition | null | undefined): FieldInfo[] {
  if (!def) return [];
  if (def.raw) {
    const out: FieldInfo[] = [];
    const walk = (nodes: any[], screen: string) => {
      for (const n of nodes || []) {
        if (n?.name && (INPUT_KINDS as string[]).includes(n.type)) out.push({ name: n.name, label: String(n.label || n.name), type: n.type, options: Array.isArray(n["data-source"]) ? n["data-source"] : undefined, screen });
        for (const k of ["children", "then", "else"]) if (Array.isArray(n?.[k])) walk(n[k], screen);
      }
    };
    for (const s of def.raw?.screens || []) walk(s.layout?.children || [], String(s.title || s.id));
    return out;
  }
  return def.screens.flatMap((s) => s.components.filter((c) => isInput(c) && c.name).map((c) => ({ name: c.name!, label: c.label || c.name!, type: c.type, options: c.options, screen: s.title })));
}

/** Human-readable answer: option ids → titles, booleans → Yes/No. */
export function formatAnswer(field: FieldInfo | undefined, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  const title = (v: unknown) => field?.options?.find((o) => o.id === String(v))?.title || String(v);
  if (Array.isArray(value)) return value.map(title).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return title(value);
}

// ───────────────────────── starters ─────────────────────────

export interface FlowStarter { id: string; name: string; description: string; category: FlowCategory; build: () => { definition: FlowDefinition; settings: FlowSettings; cta: string; body: string } }

const opt = (titles: string[]): OptionItem[] => { const ids: string[] = []; return titles.map((t) => { const id = slugOption(t, ids); ids.push(id); return { id, title: t }; }); };
const T = (type: TextKind, text: string): FlowComponent => ({ id: uid(), type, text });
const I = (type: InputKind, name: string, label: string, extra: Partial<FlowComponent> = {}): FlowComponent => ({ id: uid(), type, name, label, required: true, ...extra });

function screens(...defs: Array<Omit<FlowScreen, "id" | "next" | "branch"> & { nextIndex?: number; branch?: { field: string; equals: string; goToIndex: number } }>): FlowScreen[] {
  const ids: string[] = [];
  const out = defs.map((d) => { const id = newScreenId(ids); ids.push(id); return { ...d, id, next: COMPLETE, branch: null } as FlowScreen; });
  out.forEach((s, i) => {
    const ni = defs[i].nextIndex ?? i + 1;
    s.next = ni < out.length ? out[ni].id : COMPLETE;
    const b = defs[i].branch;
    if (b) s.branch = { field: b.field, equals: b.equals, goTo: out[b.goToIndex].id };
  });
  return out.map((s) => { const { nextIndex, ...rest } = s as any; return rest as FlowScreen; });
}

export const FLOW_STARTERS: FlowStarter[] = [
  {
    id: "lead", name: "Lead capture", description: "Name, phone, email and what they need. Tags the contact as a lead.", category: "LEAD_GENERATION",
    build: () => ({
      cta: "Get a quote", body: "Tell us a little about what you need and we'll get back within the hour.",
      settings: { saveName: "full_name", saveEmail: "email", tags: ["lead"], thankYou: "Thanks {{name}}! Our team will reach out shortly.", notifyTeam: true },
      definition: { version: 1, screens: screens(
        { title: "Get a quote", footerLabel: "Continue", components: [
          T("TextHeading", "Let's get you a quote"),
          T("TextBody", "Takes less than a minute."),
          I("TextInput", "full_name", "Full name", { inputType: "text" }),
          I("TextInput", "email", "Email", { inputType: "email" }),
          I("TextInput", "city", "City", { inputType: "text", required: false }),
        ] },
        { title: "Your requirement", footerLabel: "Submit", components: [
          I("Dropdown", "service", "Service", { options: opt(["Website", "Mobile app", "Digital marketing", "Something else"]) }),
          I("RadioButtonsGroup", "budget", "Budget", { options: opt(["Under ₹25,000", "₹25,000 – ₹1 lakh", "Above ₹1 lakh"]) }),
          I("TextArea", "details", "Details", { required: false, helperText: "Anything we should know?" }),
          I("OptIn", "consent", "I agree to be contacted on WhatsApp about my request."),
        ] },
      ) },
    }),
  },
  {
    id: "appointment", name: "Appointment request", description: "Service, preferred date and time slot, with notes.", category: "APPOINTMENT_BOOKING",
    build: () => ({
      cta: "Book now", body: "Pick a service and a time that suits you.",
      settings: { saveName: "full_name", tags: ["appointment-request"], thankYou: "Thanks {{name}}! We've received your request and will confirm the slot soon.", notifyTeam: true },
      definition: { version: 1, screens: screens(
        { title: "Book an appointment", footerLabel: "Continue", components: [
          T("TextHeading", "Book an appointment"),
          I("Dropdown", "service", "Service", { options: opt(["Consultation", "Follow-up", "Check-up"]) }),
          I("DatePicker", "date", "Preferred date"),
          I("RadioButtonsGroup", "slot", "Preferred time", { options: opt(["Morning (10–1)", "Afternoon (1–5)", "Evening (5–8)"]) }),
        ] },
        { title: "Your details", footerLabel: "Request booking", components: [
          I("TextInput", "full_name", "Full name", { inputType: "text" }),
          I("TextArea", "notes", "Notes", { required: false, helperText: "Symptoms, questions…" }),
        ] },
      ) },
    }),
  },
  {
    id: "feedback", name: "Feedback survey", description: "Rating, what went well, and a follow-up screen only for unhappy customers.", category: "SURVEY",
    build: () => ({
      cta: "Give feedback", body: "How did we do? It takes 30 seconds.",
      settings: { tags: ["feedback"], thankYou: "Thank you for the feedback 🙏", notifyTeam: false },
      definition: { version: 1, screens: screens(
        { title: "Rate us", footerLabel: "Next", components: [
          T("TextHeading", "How was your experience?"),
          I("RadioButtonsGroup", "rating", "Your rating", { options: opt(["Excellent", "Good", "Okay", "Poor"]) }),
          I("ChipsSelector", "liked", "What stood out?", { required: false, options: opt(["Speed", "Quality", "Price", "Support", "Delivery"]) }),
        ], nextIndex: 2, branch: { field: "rating", equals: "poor", goToIndex: 1 } },
        { title: "Sorry to hear that", footerLabel: "Send", components: [
          T("TextBody", "What went wrong? A manager will read this personally."),
          I("TextArea", "issue", "What went wrong", { required: true }),
          I("OptIn", "callback", "Please call me back", { required: false }),
        ] },
        { title: "One last thing", footerLabel: "Submit", components: [
          I("TextArea", "comments", "Any other comments", { required: false }),
        ] },
      ) },
    }),
  },
  {
    id: "signup", name: "Sign up", description: "Create an account or join a list with consent.", category: "SIGN_UP",
    build: () => ({
      cta: "Sign up", body: "Join in seconds, right here on WhatsApp.",
      settings: { saveName: "full_name", saveEmail: "email", tags: ["signed-up"], thankYou: "Welcome aboard, {{name}}! 🎉", notifyTeam: false },
      definition: { version: 1, screens: screens(
        { title: "Create account", footerLabel: "Sign up", components: [
          T("TextHeading", "Join us"),
          I("TextInput", "full_name", "Full name", { inputType: "text" }),
          I("TextInput", "email", "Email", { inputType: "email" }),
          I("DatePicker", "dob", "Date of birth", { required: false }),
          I("CheckboxGroup", "interests", "Interests", { required: false, options: opt(["Offers", "New arrivals", "Events"]) }),
          I("OptIn", "terms", "I agree to the terms and privacy policy."),
        ] },
      ) },
    }),
  },
  {
    id: "support", name: "Support request", description: "Order number, issue type and description.", category: "CUSTOMER_SUPPORT",
    build: () => ({
      cta: "Raise a request", body: "Tell us what's wrong and we'll sort it out.",
      settings: { tags: ["support"], thankYou: "Got it! Ticket received — we'll reply here shortly.", notifyTeam: true },
      definition: { version: 1, screens: screens(
        { title: "Support", footerLabel: "Submit", components: [
          T("TextHeading", "How can we help?"),
          I("Dropdown", "issue_type", "Issue", { options: opt(["Order not received", "Damaged item", "Refund", "Payment issue", "Other"]) }),
          I("TextInput", "order_id", "Order number", { inputType: "text", required: false }),
          I("TextArea", "description", "Describe the issue"),
        ] },
      ) },
    }),
  },
  {
    id: "event", name: "Event registration", description: "Register attendees with ticket type and guests.", category: "SIGN_UP",
    build: () => ({
      cta: "Register", body: "Save your spot for the event.",
      settings: { saveName: "full_name", saveEmail: "email", tags: ["event-registered"], thankYou: "You're registered, {{name}}! See you there.", notifyTeam: true },
      definition: { version: 1, screens: screens(
        { title: "Register", footerLabel: "Register", components: [
          T("TextHeading", "Event registration"),
          I("TextInput", "full_name", "Full name", { inputType: "text" }),
          I("TextInput", "email", "Email", { inputType: "email" }),
          I("RadioButtonsGroup", "ticket", "Ticket", { options: opt(["General", "VIP"]) }),
          I("TextInput", "guests", "Extra guests", { inputType: "number", required: false, helperText: "0 if coming alone" }),
        ] },
      ) },
    }),
  },
  {
    id: "blank", name: "Blank", description: "Start from one empty screen.", category: "OTHER",
    build: () => ({
      cta: "Open", body: "Please fill this short form.", settings: { notifyTeam: false },
      definition: { version: 1, screens: screens({ title: "Welcome", footerLabel: "Submit", components: [T("TextHeading", "Welcome")] }) },
    }),
  },
];

// ───────────────────────── AI format (Make with AI) ─────────────────────────
/**
 * The model writes a simple, forgiving format; we turn it into a valid
 * FlowDefinition here (unique keys, option ids, limits, forward-only routing).
 */
export interface AiFlow {
  name?: string;
  category?: string;
  message?: string;
  button?: string;
  screens: Array<{
    title?: string;
    button?: string;
    next?: number | "finish";
    rule?: { field?: string; equals?: string; goTo?: number } | null;
    blocks: Array<{ type?: string; text?: string; label?: string; key?: string; required?: boolean; input?: string; helper?: string; options?: string[]; min?: number; max?: number }>;
  }>;
  onSubmit?: { saveName?: string; saveEmail?: string; tags?: string[]; thankYou?: string; notify?: boolean };
}

const AI_TYPE: Record<string, ComponentKind> = {
  heading: "TextHeading", subheading: "TextSubheading", text: "TextBody", paragraph: "TextBody", body: "TextBody", caption: "TextCaption",
  short_answer: "TextInput", text_input: "TextInput", input: "TextInput", long_answer: "TextArea", textarea: "TextArea",
  date: "DatePicker", consent: "OptIn", optin: "OptIn", dropdown: "Dropdown", single_choice: "RadioButtonsGroup", radio: "RadioButtonsGroup",
  multiple_choice: "CheckboxGroup", checkbox: "CheckboxGroup", chips: "ChipsSelector",
};
const AI_NAME: Partial<Record<ComponentKind, string>> = {
  TextHeading: "heading", TextSubheading: "subheading", TextBody: "text", TextCaption: "caption", TextInput: "short_answer", TextArea: "long_answer",
  DatePicker: "date", OptIn: "consent", Dropdown: "dropdown", RadioButtonsGroup: "single_choice", CheckboxGroup: "multiple_choice", ChipsSelector: "chips",
};
const cut = (s: unknown, n: number) => [...String(s ?? "").trim()].slice(0, n).join("");

export function fromAiFlow(raw: AiFlow): { name: string; category: FlowCategory; cta: string; body: string; definition: FlowDefinition; settings: FlowSettings } {
  const srcScreens = (Array.isArray(raw?.screens) ? raw.screens : []).slice(0, MAX_SCREENS);
  const ids: string[] = [];
  const screens: FlowScreen[] = srcScreens.map(() => { const id = newScreenId(ids); ids.push(id); return { id, title: "", components: [], footerLabel: "", next: COMPLETE, branch: null }; });
  const taken: string[] = [];
  const keyMap = new Map<string, string>(); // AI key → final key

  srcScreens.forEach((src, i) => {
    const s = screens[i];
    s.title = cut(src.title, LIMITS.screenTitle) || `Step ${i + 1}`;
    for (const b of (Array.isArray(src.blocks) ? src.blocks : []).slice(0, 25)) {
      const type = AI_TYPE[String(b?.type || "").toLowerCase().replace(/[\s-]/g, "_")];
      if (!type) continue;
      if ((TEXT_KINDS as string[]).includes(type)) {
        const text = cut(b.text || b.label, (LIMITS as any)[type]);
        if (text) s.components.push({ id: uid(), type, text });
        continue;
      }
      const label = cut(b.label || b.text, LIMITS.label[type] || 30) || COMPONENT_META[type].label;
      const want = String(b.key || label);
      const name = slugField(want, taken);
      taken.push(name);
      const aiKey = String(b.key || "").trim() || name;
      if (!keyMap.has(aiKey)) keyMap.set(aiKey, name); // first field wins for duplicate AI keys
      if (!keyMap.has(name)) keyMap.set(name, name);
      const c: FlowComponent = { id: uid(), type, name, label, required: b.required !== false };
      if (b.helper && ["TextInput", "TextArea", "DatePicker"].includes(type)) c.helperText = cut(b.helper, LIMITS.helperText);
      if (type === "TextInput") {
        const it = String(b.input || "text").toLowerCase();
        c.inputType = (["text", "number", "email", "phone", "password", "passcode"].includes(it) ? it : "text") as InputType;
      }
      if (hasOptions(type)) {
        const [, mx] = LIMITS.options[type];
        const oids: string[] = [];
        c.options = (Array.isArray(b.options) ? b.options : []).map((t) => cut(t, LIMITS.optionTitle)).filter(Boolean).slice(0, mx)
          .map((t) => { const id = slugOption(t, oids); oids.push(id); return { id, title: t }; });
        if (type === "ChipsSelector" && c.options.length < 2) c.type = "CheckboxGroup";
        if (!c.options.length) c.options = [{ id: "yes", title: "Yes" }, { id: "no", title: "No" }];
        if (isMulti(c.type)) {
          if (b.min && b.min > 0 && b.min <= c.options.length) c.minSelected = Math.floor(b.min);
          if (b.max && b.max > 0 && b.max <= c.options.length) c.maxSelected = Math.floor(b.max);
        }
      }
      s.components.push(c);
    }
    if (s.components.filter((c) => c.type === "OptIn").length > LIMITS.optInPerScreen) {
      let n = 0; s.components = s.components.filter((c) => c.type !== "OptIn" || ++n <= LIMITS.optInPerScreen);
    }
    if (!s.components.length) s.components.push({ id: uid(), type: "TextBody", text: s.title });
  });

  // routing: forward only; default = next screen; last = finish
  srcScreens.forEach((src, i) => {
    const s = screens[i];
    const last = i === screens.length - 1;
    let next: string = last ? COMPLETE : screens[i + 1].id;
    if (src.next === "finish" || (src as any).next === "complete") next = COMPLETE;
    else if (typeof src.next === "number") { const j = Math.floor(src.next) - 1; next = j > i && j < screens.length ? screens[j].id : next; }
    s.next = next;
    s.footerLabel = cut(src.button, LIMITS.footerLabel) || (next === COMPLETE ? "Submit" : "Continue");
    const r = src.rule;
    if (r && next !== COMPLETE && typeof r.goTo === "number") {
      const j = Math.floor(r.goTo) - 1;
      const field = s.components.find((c) => isSingleChoice(c.type) && (c.name === keyMap.get(String(r.field || "")) || c.name === r.field || c.label === r.field));
      const opt = field?.options?.find((o) => o.title.toLowerCase() === String(r.equals || "").toLowerCase() || o.id === r.equals);
      if (field && opt && j > i && j < screens.length && screens[j].id !== next) s.branch = { field: field.name!, equals: opt.id, goTo: screens[j].id };
    }
  });

  // drop screens nobody can reach (keeps the first)
  const reach = new Set<string>(screens[0] ? [screens[0].id] : []);
  for (const s of screens) if (reach.has(s.id)) for (const t of screenTargets(s)) reach.add(t);
  const kept = screens.filter((s) => reach.has(s.id));
  if (!kept.length) kept.push({ id: newScreenId(), title: "Welcome", components: [{ id: uid(), type: "TextHeading", text: "Welcome" }], footerLabel: "Submit", next: COMPLETE, branch: null });

  const fieldNames = new Set(kept.flatMap((s) => s.components.map((c) => c.name).filter(Boolean) as string[]));
  const mapKey = (k?: string) => { const v = k ? keyMap.get(k) || k : undefined; return v && fieldNames.has(v) ? v : undefined; };
  const os = raw?.onSubmit || {};
  const cat = String(raw?.category || "OTHER").toUpperCase();
  return {
    name: cut(raw?.name, 100) || "AI flow",
    category: (FLOW_CATEGORIES.some((c) => c.id === cat) ? cat : "OTHER") as FlowCategory,
    cta: cut(raw?.button, 20) || "Open",
    body: cut(raw?.message, 1024) || "Please fill this short form.",
    definition: { version: 1, screens: kept },
    settings: {
      saveName: mapKey(os.saveName), saveEmail: mapKey(os.saveEmail),
      tags: (Array.isArray(os.tags) ? os.tags : []).map((t) => cut(t, 40).toLowerCase()).filter(Boolean).slice(0, 10),
      thankYou: cut(os.thankYou, 1000) || undefined, notifyTeam: os.notify !== false,
    },
  };
}

/** Current flow in the AI format, so the model can edit it. */
export function toAiFlow(def: FlowDefinition, extra: { name?: string; cta?: string; body?: string; settings?: FlowSettings } = {}): AiFlow {
  const pos = new Map(def.screens.map((s, i) => [s.id, i + 1] as const));
  return {
    name: extra.name, message: extra.body, button: extra.cta,
    screens: def.screens.map((s) => ({
      title: s.title, button: s.footerLabel,
      next: s.next === COMPLETE ? "finish" : pos.get(s.next),
      rule: s.branch ? { field: s.branch.field, equals: s.components.find((c) => c.name === s.branch!.field)?.options?.find((o) => o.id === s.branch!.equals)?.title, goTo: pos.get(s.branch.goTo) } : null,
      blocks: s.components.filter((c) => c.type !== "Image").map((c) => (isInput(c)
        ? { type: AI_NAME[c.type], label: c.label, key: c.name, required: !!c.required, ...(c.inputType && c.inputType !== "text" ? { input: c.inputType } : {}), ...(c.helperText ? { helper: c.helperText } : {}), ...(c.options ? { options: c.options.map((o) => o.title) } : {}) }
        : { type: AI_NAME[c.type], text: c.text })),
    })),
    onSubmit: extra.settings ? { saveName: extra.settings.saveName, saveEmail: extra.settings.saveEmail, tags: extra.settings.tags, thankYou: extra.settings.thankYou, notify: extra.settings.notifyTeam } : undefined,
  };
}
