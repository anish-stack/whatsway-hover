/**
 * Flow Studio "Make with AI" (Gemini by default, OpenAI also works).
 * - New flow: a short interview (max 2 questions), then a complete multi-screen flow.
 * - Existing flow: the user asks for a change ("add a screen for address"), the
 *   model returns the whole updated flow.
 * The model writes a forgiving format (AiFlow); fromAiFlow() repairs it and
 * validateFlow() checks WhatsApp's rules. If errors remain we ask the model to
 * fix them once before giving the result to the builder.
 */
import { chatComplete } from "../../utils/ai-provider";
import { resolveSetting, extractJson } from "../ai-template.service";
import { fromAiFlow, toAiFlow, validateFlow, type FlowDefinition, type FlowSettings } from "@shared/flow-studio";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type AiFlowTurn =
  | { type: "question"; question: string; options: string[] }
  | ({ type: "flow"; summary: string; notes: string[] } & ReturnType<typeof fromAiFlow>);

const SYSTEM = `You are HoverChat's WhatsApp Flows designer. WhatsApp Flows are native forms that open inside a WhatsApp chat (lead forms, bookings, surveys, sign-ups, support requests). You design complete, polished flows for small businesses, mostly in India.

Conversation:
- If the request is clear enough, build the flow straight away. Otherwise ask ONE short question (max 2 questions in total), with 2-4 tappable "options".
- Useful to know: business type, goal of the form, which details to collect, and anything to branch on.
- Reply in the user's language for questions and the summary (Hinglish is fine). Form text uses the language the user asks for (default English).

Design rules:
- 1 to 4 screens (max 8). Group related questions; 2-5 questions per screen. First screen starts with a short heading.
- Ask only what the business needs. Use the right block: names/phone/email/numbers → short_answer (input: text|email|phone|number); free text → long_answer; one pick from ≤6 → single_choice; one pick from many → dropdown; several picks → multiple_choice or chips; dates → date; permission → consent (last screen).
- Limits (characters): screen title 30, button 35, heading 80, text 4096, label 20 for short_answer/long_answer/dropdown, 30 for single_choice/multiple_choice, 40 for date, 120 for consent; option 30 each; helper 80. Keep labels short like "Full name", "City", "Budget".
- Options: single_choice/multiple_choice 2-10, dropdown up to 50, chips 2-20.
- key: snake_case, unique across the whole flow (e.g. full_name, email, service).
- Routing: screens run in order. "next" is the 1-based screen number to go to, or "finish". Only forward. Optional "rule" sends people with a specific single_choice/dropdown answer on THAT screen to a different LATER screen: {"field":"key","equals":"Option text","goTo":3}. The screen with a rule must not finish.
- onSubmit: saveName/saveEmail = keys of the name/email questions (if any); tags = 1-3 lowercase tags; thankYou = short WhatsApp reply, may use {{name}}; notify = true for leads/bookings/support.
- message = chat text shown with the flow button (max 200 chars); button = the button text (max 20).
- category one of: LEAD_GENERATION, APPOINTMENT_BOOKING, SIGN_UP, SIGN_IN, CONTACT_US, CUSTOMER_SUPPORT, SURVEY, OTHER.

Output — ALWAYS a single JSON object, nothing else:
{"type":"question","question":"...","options":["...","..."]}
or
{"type":"flow","summary":"one or two sentences on what you built","flow":{"name":"","category":"LEAD_GENERATION","message":"","button":"","screens":[{"title":"","button":"Continue","next":2,"rule":null,"blocks":[{"type":"heading","text":""},{"type":"short_answer","label":"Full name","key":"full_name","input":"text","required":true,"helper":""},{"type":"single_choice","label":"","key":"","options":["",""],"required":true}]}],"onSubmit":{"saveName":"full_name","saveEmail":"","tags":["lead"],"thankYou":"","notify":true}}}
Block types: heading, subheading, text, caption, short_answer, long_answer, date, consent, dropdown, single_choice, multiple_choice, chips.`;

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

export async function aiFlowTurn(input: {
  channelId?: string;
  messages: ChatMsg[];
  current?: { definition: FlowDefinition; name?: string; cta?: string; body?: string; settings?: FlowSettings } | null;
}): Promise<AiFlowTurn> {
  const setting = await resolveSetting(input.channelId);
  if (!setting) throw Object.assign(new Error("No AI key found. Add a Gemini API key in Settings → AI Assistant."), { status: 400 });

  const history = input.messages.slice(-12).map((m) => ({ role: m.role, content: clip(m.content, 3000) }));
  const userTurns = history.filter((m) => m.role === "user").length;
  let sys = SYSTEM;
  if (input.current && !input.current.definition.raw) {
    sys += `\n\nYou are EDITING this existing flow. Apply the user's change, keep everything else (including keys) as it is, and return the COMPLETE updated flow (type=flow). Don't ask questions unless the change is truly unclear.\nCurrent flow:\n${JSON.stringify(toAiFlow(input.current.definition, input.current))}`;
  } else if (userTurns >= 3) {
    sys += "\n\nYou have enough information now. Return the complete flow (type=flow).";
  }

  const ask = async (msgs: Array<{ role: "system" | "user" | "assistant"; content: string }>) => {
    const text = await chatComplete(setting, msgs, { maxTokens: 6000, temperature: 0.4 });
    const parsed = extractJson(text);
    if (!parsed) throw Object.assign(new Error("AI returned an unexpected answer. Please try again."), { status: 502 });
    return { parsed, text };
  };

  const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [{ role: "system", content: sys }, ...history];
  let { parsed, text } = await ask(msgs);

  if (parsed.type === "question" && userTurns < 4 && !input.current) {
    return {
      type: "question",
      question: clip(parsed.question, 400) || "What should this form collect?",
      options: (Array.isArray(parsed.options) ? parsed.options : []).map((o: any) => clip(o, 60)).filter(Boolean).slice(0, 4),
    };
  }

  let rawFlow = parsed.flow || parsed;
  let built = fromAiFlow(rawFlow);
  const problems = (raw: any, def: FlowDefinition) => {
    const list = validateFlow(def).filter((i) => i.level === "error").map((e) => e.message);
    if (!Array.isArray(raw?.screens) || !raw.screens.length) list.unshift("The flow has no screens. Return the complete flow with its screens and blocks.");
    return list;
  };
  let errors = problems(rawFlow, built.definition);
  const notes: string[] = [];

  // one repair round with the exact problems
  if (errors.length) {
    try {
      const retry = await ask([...msgs, { role: "assistant", content: text }, {
        role: "user",
        content: `Fix these problems and return the complete corrected flow JSON (type=flow):\n- ${errors.slice(0, 12).join("\n- ")}`,
      }]);
      const fixed = fromAiFlow(retry.parsed.flow || retry.parsed);
      const fixedErrors = problems(retry.parsed.flow || retry.parsed, fixed.definition);
      if (fixedErrors.length < errors.length) { built = fixed; errors = fixedErrors; rawFlow = retry.parsed.flow || retry.parsed; parsed = retry.parsed; }
    } catch { /* keep first attempt */ }
  }
  if (errors.length) notes.push(`${errors.length} thing${errors.length > 1 ? "s" : ""} to fix in the builder before publishing.`);

  return {
    type: "flow",
    summary: clip(parsed.summary, 400) || `Built “${built.name}” with ${built.definition.screens.length} screen${built.definition.screens.length > 1 ? "s" : ""}.`,
    notes,
    ...built,
  };
}
