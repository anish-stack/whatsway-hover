/**
 * Media for social posts. Users upload their own photos / videos (AI never makes media).
 *  - photos → JPEG (Instagram only takes JPEG), max 1440 px wide
 *  - videos → MP4 (H.264/AAC) when needed; duration + size probed; poster frame for previews
 *  - stored in the configured cloud storage, else /uploads/social/<owner>/
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import sharp from "sharp";
import type { SocialMedia } from "@shared/schema";
import { compressVideo, ffmpegPath, runFfmpeg } from "../../utils/media-compress";
import { getStorageTarget, safeStorageKey } from "../../config/storageConfig";

export const MAX_IMAGE_MB = 8;
export const MAX_VIDEO_MB = 500;

export async function probeVideo(file: string): Promise<{ duration?: number; width?: number; height?: number }> {
  const bin = await ffmpegPath();
  if (!bin) return {};
  return new Promise((resolve) => {
    const p = spawn(bin, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { if (err.length < 20000) err += d.toString(); });
    const done = () => {
      const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      const v = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(err);
      let width = v ? Number(v[1]) : undefined, height = v ? Number(v[2]) : undefined;
      if (/rotate\s*:\s*-?(90|270)/.test(err) || /displaymatrix: rotation of -?90/.test(err)) [width, height] = [height, width];
      resolve({ duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : undefined, width, height });
    };
    p.on("close", done);
    p.on("error", () => resolve({}));
  });
}

async function store(localPath: string, ownerId: string, mime: string): Promise<string> {
  const target = await getStorageTarget().catch(() => null);
  if (target) {
    try {
      const key = safeStorageKey(`uploads/social/${ownerId.replace(/[^a-zA-Z0-9_-]/g, "")}`, path.basename(localPath));
      const url = await target.upload(fs.readFileSync(localPath), key, mime);
      if (url) { try { fs.unlinkSync(localPath); } catch { /* ignore */ } return url; }
    } catch (e) { console.warn("[Social] cloud upload failed, keeping local file:", (e as Error).message); }
  }
  return "/" + localPath.split(path.sep).join("/");
}

/** Turns one uploaded file into a stored SocialMedia item. Throws with a friendly message. */
export async function processUpload(file: Express.Multer.File, ownerId: string): Promise<SocialMedia> {
  const mime = file.mimetype.toLowerCase();
  const base = file.path.replace(/\.[^./\\]+$/, "");
  if (mime.startsWith("image/")) {
    if (file.size > 30 * 1024 * 1024) throw new Error(`${file.originalname}: photo is too large (max 30 MB before compression)`);
    const out = `${base}.jpg`;
    const info = await sharp(file.path, { failOn: "none" }).rotate().resize({ width: 1440, withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
    if (out !== file.path) { try { fs.unlinkSync(file.path); } catch { /* ignore */ } }
    if (info.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`${file.originalname}: photo is over ${MAX_IMAGE_MB} MB after compression`);
    const url = await store(out, ownerId, "image/jpeg");
    return { url, kind: "image", mime: "image/jpeg", size: info.size, width: info.width, height: info.height, name: file.originalname };
  }
  if (mime.startsWith("video/")) {
    const f: any = { ...file };
    if (mime !== "video/mp4") await compressVideo(f); // MOV / WebM → MP4
    if (f.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`${file.originalname}: video is over ${MAX_VIDEO_MB} MB`);
    const meta = await probeVideo(f.path);
    let thumbUrl: string | undefined;
    try {
      const thumb = `${f.path.replace(/\.[^./\\]+$/, "")}-poster.jpg`;
      await runFfmpeg(["-ss", meta.duration && meta.duration > 2 ? "1" : "0", "-i", f.path, "-frames:v", "1", "-vf", "scale=480:-2", thumb], 30_000);
      thumbUrl = await store(thumb, ownerId, "image/jpeg");
    } catch { /* poster is optional */ }
    const url = await store(f.path, ownerId, "video/mp4");
    return { url, kind: "video", mime: "video/mp4", size: f.size, ...meta, thumbUrl, name: file.originalname };
  }
  try { fs.unlinkSync(file.path); } catch { /* ignore */ }
  throw new Error(`${file.originalname}: only photos and videos can be posted`);
}
