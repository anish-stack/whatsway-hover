/**
 * Templates with a FLOW button: when sending, Meta accepts an optional
 * button component carrying a flow_token. We always add one so every Flow
 * reply (nfm_reply webhook) can be traced back to the send.
 */
import { randomUUID } from "crypto";

function parseButtons(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  return [];
}

export function flowButtonIndexes(template: { buttons?: unknown } | null | undefined): number[] {
  return parseButtons(template?.buttons)
    .map((b, i) => (String(b?.type || "").toUpperCase() === "FLOW" ? i : -1))
    .filter((i) => i >= 0);
}

export function ensureFlowButton(components: any[], template: any, flowToken?: string): any[] {
  const idx = flowButtonIndexes(template);
  if (!idx.length) return components;
  const out = [...components];
  for (const i of idx) {
    const exists = out.some((c) => c?.type === "button" && c.sub_type === "flow" && String(c.index) === String(i));
    if (!exists) {
      out.push({
        type: "button",
        sub_type: "flow",
        index: String(i),
        parameters: [{ type: "action", action: { flow_token: flowToken || `hc-${randomUUID()}` } }],
      });
    }
  }
  return out;
}
