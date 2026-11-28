import { describe, expect, it } from "vitest";
import { captionFor, countHashtags, normaliseTags, validateFor } from "../services/social/planner.service";

const img = { url: "/a.jpg", kind: "image" as const, width: 1080, height: 1350 };
const vid = { url: "/a.mp4", kind: "video" as const, duration: 12 };

describe("captions", () => {
  it("normalises hashtags", () => {
    expect(normaliseTags("diwali, #kurta  sale")).toBe("#diwali #kurta #sale");
    expect(normaliseTags("")).toBe("");
  });
  it("joins caption + tags per platform", () => {
    const p = { igCaption: "Hi", igHashtags: "a b", fbCaption: "Hello", fbHashtags: null };
    expect(captionFor(p, "instagram")).toBe("Hi\n\n#a #b");
    expect(captionFor(p, "facebook")).toBe("Hello");
  });
  it("counts hashtags incl. Hindi", () => {
    expect(countHashtags("#one two #दिवाली #x_y")).toBe(3);
  });
});

describe("platform rules", () => {
  it("Instagram needs media and the right count", () => {
    expect(validateFor("instagram", { postType: "text", media: [] })).toContain("Instagram needs a photo or video.");
    expect(validateFor("instagram", { postType: "image", media: [img] })).toEqual([]);
    expect(validateFor("instagram", { postType: "carousel", media: [img] }).length).toBe(1);
    expect(validateFor("instagram", { postType: "reel", media: [vid] })).toEqual([]);
    expect(validateFor("instagram", { postType: "reel", media: [{ ...vid, duration: 1 }] }).length).toBe(1);
  });
  it("Instagram hashtag + length limits", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(validateFor("instagram", { postType: "image", media: [img], igHashtags: tags }).join(" ")).toMatch(/30 hashtags/);
    expect(validateFor("instagram", { postType: "image", media: [img], igCaption: "x".repeat(2300) }).join(" ")).toMatch(/2,200/);
  });
  it("Facebook allows text posts, not stories", () => {
    expect(validateFor("facebook", { postType: "text", media: [], fbCaption: "Hello" })).toEqual([]);
    expect(validateFor("facebook", { postType: "text", media: [] }).length).toBe(1);
    expect(validateFor("facebook", { postType: "story", media: [img] }).length).toBe(1);
    expect(validateFor("facebook", { postType: "carousel", media: [img, img] })).toEqual([]);
  });
});
