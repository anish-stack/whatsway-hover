import { describe, expect, it } from "vitest";
import { BLOCKS, BLOCK_TYPES, TEMPLATES, newBlock, normaliseBlocks, normaliseSettings, safeUrl } from "@shared/landing";

const strip = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi, "");

describe("landing blocks", () => {
  it("every template builds valid blocks", () => {
    for (const t of TEMPLATES) {
      const bs = t.blocks();
      expect(bs.length).toBeGreaterThan(0);
      for (const b of bs) expect(BLOCK_TYPES).toContain(b.type);
      expect(normaliseBlocks(bs, strip).length).toBe(bs.length);
    }
  });
  it("new blocks have every field", () => {
    for (const t of BLOCK_TYPES) { const b = newBlock(t); for (const f of BLOCKS[t].fields) expect(f.key in b.props, `${t}.${f.key}`).toBe(true); }
  });
  it("drops unknown types and fields, cleans URLs and html", () => {
    const out = normaliseBlocks([
      { type: "evil", props: {} },
      { id: "x1", type: "hero", props: { headline: "Hi", ctaLink: "javascript:alert(1)", image: "/uploads/a.webp", junk: 1, layout: "weird" } },
      { type: "text", props: { html: "<p>ok</p><script>bad()</script>" } },
      { type: "features", props: { items: [{ icon: "Bot", title: "A", text: "B", extra: 1 }] } },
    ], strip);
    expect(out.map((b) => b.type)).toEqual(["hero", "text", "features"]);
    expect(out[0].props.ctaLink).toBe("");
    expect(out[0].props.image).toBe("/uploads/a.webp");
    expect(out[0].props.layout).toBe("right");
    expect("junk" in out[0].props).toBe(false);
    expect(out[1].props.html).toBe("<p>ok</p>");
    expect(out[2].props.items[0]).toEqual({ icon: "Bot", image: "", title: "A", text: "B" });
  });
  it("caps sections", () => {
    expect(normaliseBlocks(Array.from({ length: 60 }, () => newBlock("faq")), strip).length).toBe(40);
  });
  it("safeUrl allows only safe schemes", () => {
    expect(safeUrl("https://x.com")).toBe("https://x.com");
    expect(safeUrl("/signup")).toBe("/signup");
    expect(safeUrl("#lp-form")).toBe("#lp-form");
    expect(safeUrl("tel:+911234")).toBe("tel:+911234");
    expect(safeUrl("//evil.com")).toBe("");
    expect(safeUrl("data:text/html,x")).toBe("");
    expect(safeUrl("javascript:1")).toBe("");
  });
});

describe("landing settings", () => {
  it("keeps only valid tracking IDs", () => {
    const s = normaliseSettings({
      googleAdsId: "AW-123456789", googleAdsLabel: "Ab_c-12", ga4Id: "G-ABC123", metaPixelId: "123456789012",
      primary: "#112233", whatsappNumber: "+91 98765-43210", notifyEmails: "a@b.com, bad, c@d.in", hideChrome: 1,
    });
    expect(s).toMatchObject({ googleAdsId: "AW-123456789", googleAdsLabel: "Ab_c-12", ga4Id: "G-ABC123", metaPixelId: "123456789012", primary: "#112233", whatsappNumber: "919876543210", notifyEmails: "a@b.com,c@d.in", hideChrome: true });
    const bad = normaliseSettings({ googleAdsId: "AW-1'><script>", ga4Id: "UA-1", metaPixelId: "abc", primary: "red", thankYouUrl: "javascript:x" });
    expect(bad.googleAdsId).toBeUndefined();
    expect(bad.ga4Id).toBeUndefined();
    expect(bad.metaPixelId).toBeUndefined();
    expect(bad.primary).toBeUndefined();
    expect(bad.thankYouUrl).toBeUndefined();
  });
});

import { buildJsonLd, firstImage, autoDescription } from "@shared/landing";
import { FULL_TEMPLATES } from "@shared/landing-seeds";

describe("complete sample pages", () => {
  it("are valid, have images with alt text and SEO", () => {
    for (const t of FULL_TEMPLATES) {
      const bs = normaliseBlocks(t.blocks(), strip);
      expect(bs.length).toBe(t.blocks().length);
      expect(bs.filter((x) => x.type === "hero")).toHaveLength(1);
      expect(bs.some((x) => x.type === "gallery")).toBe(true);
      expect(bs.some((x) => x.type === "form")).toBe(true);
      expect(firstImage(bs)).toMatch(/^\/landing\/.+\.webp$/);
      for (const x of bs) {
        if (x.props.image && x.type !== "logos") expect(x.props.imageAlt || x.props.alt, `${t.key}.${x.type}`).toBeTruthy();
        if (x.type === "gallery") for (const it of x.props.items) expect(it.alt).toBeTruthy();
      }
      expect(t.seo.metaTitle.length).toBeLessThanOrEqual(70);
      expect(t.seo.metaDescription.length).toBeLessThanOrEqual(170);
    }
  });
  it("builds JSON-LD with WebPage + FAQPage and merges custom schema", () => {
    const t = FULL_TEMPLATES[0];
    const j = JSON.parse(buildJsonLd({ title: "T", slug: t.seo.slug, blocks: t.blocks(), schemaJson: '{"@context":"https://schema.org","@type":"Organization","name":"Hover"}' }, "https://x.com"));
    const types = j["@graph"].map((g: any) => g["@type"]);
    expect(types).toEqual(["WebPage", "FAQPage", "Organization"]);
    expect(j["@graph"][0].url).toBe(`https://x.com/${t.seo.slug}`);
    expect(j["@graph"][0].image).toMatch(/^https:\/\/x\.com\/landing\//);
    expect(j["@graph"][1].mainEntity.length).toBeGreaterThan(2);
    expect(autoDescription(t.blocks()).length).toBeGreaterThan(20);
  });
  it("ignores broken custom schema", () => {
    const j = JSON.parse(buildJsonLd({ title: "T", slug: "a", blocks: [], schemaJson: "{nope" }, "https://x.com"));
    expect(j["@graph"]).toHaveLength(1);
  });
});
