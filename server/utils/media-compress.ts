/**
 * Shrinks uploads before they are stored or sent to WhatsApp.
 *
 *  Images (sharp):  auto-rotate from EXIF, fit inside IMAGE_MAX_DIM (2048px),
 *                   re-encode JPEG (mozjpeg) / PNG (palette) / WebP / AVIF.
 *                   Format is kept so WhatsApp + template headers still accept it.
 *  Video  (ffmpeg): H.264 + AAC MP4 (WhatsApp's format), max 1280px wide,
 *                   web-optimised. WebM / MOV / AVI / OGG are converted to MP4
 *                   because WhatsApp rejects them.
 *  Audio  (ffmpeg): WAV (not accepted by WhatsApp) and large files → MP3.
 *  Documents / GIF / icons: left untouched.
 *
 * A file is only replaced when the result is smaller, or when conversion is
 * required for WhatsApp. Any failure keeps the original file.
 *
 * Env: MEDIA_COMPRESSION=off · IMAGE_MAX_DIM=2048 · IMAGE_QUALITY=80
 *      VIDEO_CRF=28 · VIDEO_MAX_WIDTH=1280 · VIDEO_COMPRESS_MIN_MB=3 · FFMPEG_PATH
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import sharp from "sharp";

type UploadFile = Express.Multer.File & { cloudUrl?: string; compressed?: boolean };

const ENABLED = () => String(process.env.MEDIA_COMPRESSION || "on").toLowerCase() !== "off";
const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

let ffmpegBin: string | null | undefined;
export async function ffmpegPath(): Promise<string | null> {
  if (ffmpegBin !== undefined) return ffmpegBin;
  if (process.env.FFMPEG_PATH) return (ffmpegBin = process.env.FFMPEG_PATH);
  try {
    const mod: any = await import("ffmpeg-static");
    const p = mod?.default || mod;
    if (p && fs.existsSync(p)) return (ffmpegBin = p);
  } catch { /* not installed */ }
  return (ffmpegBin = "ffmpeg"); // system ffmpeg if present
}

export function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const bin = await ffmpegPath();
    if (!bin) return reject(new Error("ffmpeg not available"));
    const p = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { if (err.length < 4000) err += d.toString(); });
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`ffmpeg timed out after ${timeoutMs / 1000}s`)); }, timeoutMs);
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg exited ${code}`)); });
  });
}

function swapExt(name: string, ext: string) {
  return name.replace(/\.[^./\\]+$/, "") + ext;
}

function replaceFile(file: UploadFile, outPath: string, newMime?: string, newExt?: string) {
  const finalPath = newExt ? swapExt(file.path, newExt) : file.path;
  if (finalPath !== file.path) { try { fs.unlinkSync(file.path); } catch { /* ignore */ } }
  fs.renameSync(outPath, finalPath);
  file.path = finalPath;
  file.filename = path.basename(finalPath);
  if (newExt) file.originalname = swapExt(file.originalname, newExt);
  if (newMime) file.mimetype = newMime;
  file.size = fs.statSync(finalPath).size;
}

export async function compressImage(file: UploadFile): Promise<string | null> {
  const mime = file.mimetype.toLowerCase();
  if (!/^image\/(jpe?g|png|webp|avif)$/.test(mime)) return null;
  const maxDim = num(process.env.IMAGE_MAX_DIM, 2048);
  const q = Math.min(Math.max(num(process.env.IMAGE_QUALITY, 80), 40), 95);
  const out = `${file.path}.cmp`;
  let img = sharp(file.path, { failOn: "none" }).rotate().resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true });
  if (mime.includes("png")) img = img.png({ compressionLevel: 9, palette: true, quality: q, effort: 8 });
  else if (mime.includes("webp")) img = img.webp({ quality: q, effort: 5 });
  else if (mime.includes("avif")) img = img.avif({ quality: Math.max(q - 25, 30) });
  else img = img.jpeg({ quality: q, mozjpeg: true, progressive: true });
  await img.toFile(out);
  const before = file.size || fs.statSync(file.path).size;
  const after = fs.statSync(out).size;
  if (after < before) {
    replaceFile(file, out);
    return `${kb(before)} → ${kb(after)}`;
  }
  fs.unlinkSync(out);
  return null;
}

export async function compressVideo(file: UploadFile): Promise<string | null> {
  const mime = file.mimetype.toLowerCase();
  if (!mime.startsWith("video/")) return null;
  const mustConvert = !["video/mp4", "video/3gpp"].includes(mime); // WhatsApp accepts only MP4 / 3GP
  const before = file.size || fs.statSync(file.path).size;
  if (!mustConvert && before < num(process.env.VIDEO_COMPRESS_MIN_MB, 3) * 1024 * 1024) return null;
  const out = `${file.path}.cmp.mp4`;
  const width = num(process.env.VIDEO_MAX_WIDTH, 1280);
  await runFfmpeg([
    "-i", file.path,
    "-vf", `scale='min(${width},iw)':-2`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", String(num(process.env.VIDEO_CRF, 28)),
    "-profile:v", "main", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-ac", "2",
    "-movflags", "+faststart",
    out,
  ], 180_000);
  const after = fs.statSync(out).size;
  if (mustConvert || after < before) {
    replaceFile(file, out, "video/mp4", mustConvert ? ".mp4" : undefined);
    return `${kb(before)} → ${kb(after)}${mustConvert ? " (converted to MP4)" : ""}`;
  }
  fs.unlinkSync(out);
  return null;
}

export async function compressAudio(file: UploadFile): Promise<string | null> {
  const mime = file.mimetype.toLowerCase();
  if (!mime.startsWith("audio/")) return null;
  const isWav = /wav/.test(mime);
  const before = file.size || fs.statSync(file.path).size;
  if (!isWav && before < 5 * 1024 * 1024) return null;
  const out = `${file.path}.cmp.mp3`;
  await runFfmpeg(["-i", file.path, "-vn", "-c:a", "libmp3lame", "-b:a", "128k", out], 120_000);
  const after = fs.statSync(out).size;
  if (isWav || after < before) {
    replaceFile(file, out, "audio/mpeg", ".mp3");
    return `${kb(before)} → ${kb(after)}${isWav ? " (converted to MP3)" : ""}`;
  }
  fs.unlinkSync(out);
  return null;
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** Compress every uploaded file in place (disk storage). Never throws. */
export async function compressUploadedFiles(files: UploadFile[]): Promise<void> {
  if (!ENABLED()) return;
  for (const file of files) {
    if (!file?.path || file.compressed || !fs.existsSync(file.path)) continue;
    file.compressed = true;
    try {
      const r = (await compressImage(file)) || (await compressVideo(file)) || (await compressAudio(file));
      if (r) console.log(`🗜️  ${file.originalname}: ${r}`);
    } catch (e) {
      console.warn(`[Compress] kept original ${file.originalname}: ${(e as Error).message}`);
      for (const suffix of [".cmp", ".cmp.mp4", ".cmp.mp3"]) { try { fs.unlinkSync(file.path + suffix); } catch { /* ignore */ } }
    }
  }
}
