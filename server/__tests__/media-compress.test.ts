import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { compressUploadedFiles } from "../utils/media-compress";

const SRC = "/tmp/mc";
const RUN = fs.existsSync(SRC);
function f(name: string, mime: string) {
  const dir = fs.mkdtempSync("/tmp/mc-run-");
  const p = path.join(dir, name);
  fs.copyFileSync(path.join(SRC, name), p);
  return { path: p, originalname: `My ${name}`, mimetype: mime, size: fs.statSync(p).size, filename: name } as any;
}

describe.skipIf(!RUN)("media compression", () => {
  it("shrinks a large JPEG and caps dimensions", async () => {
    const file = f("in.jpg", "image/jpeg");
    const before = file.size;
    await compressUploadedFiles([file]);
    expect(file.size).toBeLessThan(before);
    const sharp = (await import("sharp")).default;
    const meta = await sharp(file.path).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(2048);
    expect(file.mimetype).toBe("image/jpeg");
  });
  it("converts WebM to MP4 and WAV to MP3", async () => {
    const v = f("in.webm", "video/webm");
    await compressUploadedFiles([v]);
    expect(v.mimetype).toBe("video/mp4");
    expect(v.path.endsWith(".mp4")).toBe(true);
    expect(v.originalname).toBe("My in.mp4");
    const a = f("in.wav", "audio/wav");
    await compressUploadedFiles([a]);
    expect(a.mimetype).toBe("audio/mpeg");
    expect(a.size).toBeLessThan(441078);
  }, 60_000);
  it("leaves small MP4 alone and never compresses twice", async () => {
    const v = f("in.mp4", "video/mp4");
    const size = v.size;
    await compressUploadedFiles([v]);
    expect(v.size).toBe(size);
    expect(v.compressed).toBe(true);
  });
});
