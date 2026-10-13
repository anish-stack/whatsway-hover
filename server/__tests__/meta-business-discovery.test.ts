import { describe, it, expect, vi } from "vitest";
import {
  discoverWabaViaBusinessPortfolio,
  describeBusinessDiscoveryFailure,
} from "../services/meta-business-discovery";

const mk = (...bodies: any[]) => {
  const fn = vi.fn();
  for (const b of bodies) fn.mockResolvedValueOnce({ json: async () => b });
  return fn;
};

describe("discoverWabaViaBusinessPortfolio", () => {
  it("returns WABA and sends token via header, not URL", async () => {
    const f = mk({ businesses: { data: [{ id: "B1" }] } }, { data: [{ id: "W1" }] });
    const r = await discoverWabaViaBusinessPortfolio(f as any, "v25.0", "SECRET");
    expect(r).toEqual({ wabaId: "W1", businessId: "B1" });
    for (const call of f.mock.calls) {
      expect(call[0]).not.toContain("SECRET");
      expect(call[1].headers.Authorization).toBe("Bearer SECRET");
    }
  });

  it("maps missing permission to permission_denied", async () => {
    const f = mk({ error: { code: 200, message: "Requires business_management permission" } });
    const r = await discoverWabaViaBusinessPortfolio(f as any, "v25.0", "t");
    expect(r.failure).toBe("permission_denied");
    expect(describeBusinessDiscoveryFailure(r)).toContain("business_management");
  });

  it("maps code 190 to token_invalid", async () => {
    const f = mk({ error: { code: 190, message: "expired" } });
    expect((await discoverWabaViaBusinessPortfolio(f as any, "v25.0", "t")).failure).toBe("token_invalid");
  });

  it("does not use /me user id as business id", async () => {
    const f = mk({ id: "USER1" });
    const r = await discoverWabaViaBusinessPortfolio(f as any, "v25.0", "t");
    expect(r.failure).toBe("no_business");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("no_waba when business owns none; permission error on 2nd call classified", async () => {
    const f1 = mk({ businesses: { data: [{ id: "B1" }] } }, { data: [] });
    expect((await discoverWabaViaBusinessPortfolio(f1 as any, "v25.0", "t")).failure).toBe("no_waba");
    const f2 = mk({ businesses: { data: [{ id: "B1" }] } }, { error: { code: 10, message: "denied" } });
    expect((await discoverWabaViaBusinessPortfolio(f2 as any, "v25.0", "t")).failure).toBe("permission_denied");
  });

  it("network throw → graph_error", async () => {
    const f = vi.fn().mockRejectedValue(new Error("boom"));
    expect((await discoverWabaViaBusinessPortfolio(f as any, "v25.0", "t")).failure).toBe("graph_error");
  });
});

import { hasGrantedScope } from "../services/meta-business-discovery";
import fs from "fs";
import path from "path";

describe("hasGrantedScope", () => {
  it("true/false/unknown", () => {
    expect(hasGrantedScope(["a", "business_management"], "business_management")).toBe(true);
    expect(hasGrantedScope(["a"], "business_management")).toBe(false);
    expect(hasGrantedScope(undefined, "business_management")).toBeUndefined();
    expect(hasGrantedScope([], "business_management")).toBeUndefined();
  });
});

describe("app-owned auth code static checks", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
  const files = [
    "client/src/components/settings/ChannelSettings.tsx",
    "server/controllers/channels.controller.ts",
    "server/services/meta-business-discovery.ts",
  ];

  it("no explicit public_profile in application code", () => {
    for (const f of files) expect(read(f)).not.toContain("public_profile");
  });

  it("FB.login stays config_id driven (no scope override)", () => {
    const src = read("client/src/components/settings/ChannelSettings.tsx");
    expect(src).toContain("config_id: config.configId");
    expect(src).not.toMatch(/\bscope\s*:/);
  });

  it("core WhatsApp permissions preserved in WABA discovery list", () => {
    const src = read("server/controllers/channels.controller.ts");
    for (const p of ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"]) {
      expect(src).toContain(`"${p}"`);
    }
  });

  it("no tokens in URLs or full-body logging in fallback helper", () => {
    const src = read("server/services/meta-business-discovery.ts");
    expect(src).not.toContain("access_token=");
    expect(src).not.toContain("console.");
  });
});
