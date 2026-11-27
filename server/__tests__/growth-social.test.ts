import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, totpAt, verifyTotp } from "../services/security/two-factor.service";
import { ruleMatches, signState, readState, verifySignature } from "../services/instagram/instagram.service";
import { normaliseUrl, randomCode } from "../services/growth/links.service";
import { fillVars } from "../services/growth/send";
import { summarise } from "../services/ads/ads.service";
import { open, seal } from "../utils/secret-box";
import crypto from "crypto";

describe("TOTP (RFC 6238 SHA-1 vectors)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("base32 round-trips", () => {
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("matches published codes", () => {
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(secret, Math.floor(2000000000 / 30))).toBe("279037");
  });
  it("accepts ±1 step and blocks replay", () => {
    const now = 1111111109 * 1000;
    const step = Math.floor(now / 30000);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step), now, step)).toBeNull();
    expect(verifyTotp(secret, "000000", now)).toBeNull();
  });
});

describe("secret box", () => {
  it("seals and opens", () => {
    const s = seal("token-123");
    expect(s.startsWith("v1:")).toBe(true);
    expect(open(s)).toBe("token-123");
    expect(open(s.replace(/.$/, "A"))).toBe("");
  });
});

describe("Instagram comment rules", () => {
  const base = { mediaId: null, matchMode: "contains" as const };
  it("matches whole words, any case", () => {
    expect(ruleMatches({ ...base, keywords: ["shop"] }, "m1", "SHOP please 🔥")).toBe(true);
    expect(ruleMatches({ ...base, keywords: ["shop"] }, "m1", "workshop was great")).toBe(false);
    expect(ruleMatches({ ...base, keywords: ["price"] }, "m1", "what's the price?")).toBe(true);
  });
  it("exact mode and media filter", () => {
    expect(ruleMatches({ ...base, matchMode: "exact", keywords: ["link"] }, "m1", "Link!")).toBe(true);
    expect(ruleMatches({ ...base, matchMode: "exact", keywords: ["link"] }, "m1", "send link")).toBe(false);
    expect(ruleMatches({ ...base, mediaId: "m2", keywords: [] }, "m1", "hi")).toBe(false);
    expect(ruleMatches({ ...base, keywords: [] }, "m1", "anything")).toBe(true);
  });
  it("Hindi keywords work", () => {
    expect(ruleMatches({ ...base, keywords: ["कीमत"] }, "m", "कीमत क्या है")).toBe(true);
  });
  it("oauth state is signed and expires", () => {
    const st = signState("owner-1", "sec");
    expect(readState(st, "sec")).toBe("owner-1");
    expect(readState(st, "other")).toBeNull();
    expect(readState(st + "x", "sec")).toBeNull();
  });
  it("webhook signature", () => {
    const raw = Buffer.from('{"a":1}');
    const sig = "sha256=" + crypto.createHmac("sha256", "s").update(raw).digest("hex");
    expect(verifySignature(raw, sig, "s")).toBe(true);
    expect(verifySignature(raw, sig, "t")).toBe(false);
  });
});

describe("short links + vars", () => {
  it("normalises urls", () => {
    expect(normaliseUrl("shop.in/a?b=1")).toBe("https://shop.in/a?b=1");
    expect(() => normaliseUrl("javascript:alert(1)")).toThrow();
  });
  it("random codes", () => {
    const c = randomCode();
    expect(c).toMatch(/^[A-Za-z0-9]{6}$/);
  });
  it("fills {{name}}", () => {
    expect(fillVars("Hi {{name}}, {{items}}", { name: "", items: "2 × Tee" })).toBe("Hi there, 2 × Tee");
  });
});

describe("ads summary", () => {
  it("counts WhatsApp conversations and cost per chat", () => {
    const s = summarise({ spend: "300", impressions: "10000", clicks: "200", ctr: "2", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" }, { action_type: "link_click", value: "150" }] });
    expect(s.conversations).toBe(12);
    expect(s.costPerConversation).toBe(25);
    expect(s.linkClicks).toBe(150);
  });
});

describe("business hours", async () => {
  const { isOpen, localTime } = await import("../services/growth/business-hours.service");
  // 2026-11-27 is a Friday. 05:30 UTC = 11:00 IST
  const fri11 = new Date("2026-11-27T05:30:00Z");
  const fri22 = new Date("2026-11-27T16:30:00Z"); // 22:00 IST
  const cfg = { enabled: true, timezone: "Asia/Kolkata", days: { fri: [["10:00", "19:00"]] as Array<[string, string]> } };
  it("local time in zone", () => {
    expect(localTime("Asia/Kolkata", fri11)).toEqual({ day: "fri", minutes: 660 });
  });
  it("open / closed", () => {
    expect(isOpen(cfg, fri11)).toBe(true);
    expect(isOpen(cfg, fri22)).toBe(false);
    expect(isOpen({ ...cfg, days: {} }, fri11)).toBe(false);
    expect(isOpen({ ...cfg, enabled: false }, fri22)).toBe(true);
  });
  it("overnight slot", () => {
    expect(isOpen({ ...cfg, days: { fri: [["20:00", "02:00"]] } }, fri22)).toBe(true);
  });
});
