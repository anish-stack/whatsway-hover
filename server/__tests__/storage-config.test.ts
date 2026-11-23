import { describe, it, expect, vi } from "vitest";
vi.mock("server/db", () => ({ db: {} }));
import { buildStorageTarget, safeStorageKey } from "../config/storageConfig";

describe("storage providers", () => {
  it("R2 accepts account id, strips bucket path, exposes public host", () => {
    const a = buildStorageTarget({ provider: "r2", spaceName: "media", endpoint: "0123456789abcdef0123456789abcdef", accessKey: "k", secretKey: "s", publicUrl: "https://pub-abc.r2.dev" });
    expect(a.hosts).toEqual(["pub-abc.r2.dev"]);
    const b = buildStorageTarget({ provider: "r2", spaceName: "media", endpoint: "https://acc.r2.cloudflarestorage.com/media", accessKey: "k", secretKey: "s", publicUrl: "cdn.example.com" });
    expect(b.hosts).toEqual(["cdn.example.com"]);
  });
  it("Cloudinary and S3 hosts", () => {
    expect(buildStorageTarget({ provider: "cloudinary", spaceName: "demo", accessKey: "k", secretKey: "s" }).hosts).toEqual(["res.cloudinary.com"]);
    expect(buildStorageTarget({ provider: "s3", spaceName: "b", region: "ap-south-1", accessKey: "k", secretKey: "s" }).hosts).toContain("b.s3.ap-south-1.amazonaws.com");
  });
  it("safe keys", () => {
    expect(safeStorageKey("uploads/u1", "My Photo (1).JPG")).toMatch(/^uploads\/u1\/\d+-My-Photo-1\.jpg$/);
  });
});
