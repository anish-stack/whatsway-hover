export interface CannedMessage {
  id: string; title: string; shortcut: string; category: string; content: string; shared: boolean;
  usageCount: number; createdBy: string; editable?: boolean;
}

export const CANNED_VARS: Array<{ key: string; label: string }> = [
  { key: "customer_name", label: "Customer name" },
  { key: "customer_first_name", label: "Customer first name" },
  { key: "customer_phone", label: "Customer phone" },
  { key: "agent_name", label: "Your name" },
  { key: "business_name", label: "Business name" },
  { key: "today", label: "Today's date" },
];

/** Replaces {{vars}}; unknown or empty ones stay as typed so the agent sees what to fill. */
export function fillCanned(text: string, v: Record<string, string | null | undefined>) {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => {
    const val = v[k];
    return val == null || val === "" ? m : String(val);
  });
}
