import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Facebook, Instagram } from "lucide-react";

export type Platform = "instagram" | "facebook";
export type Mode = "instagram" | "facebook" | "both";
export type PostType = "image" | "carousel" | "video" | "reel" | "story" | "text";
export interface Media { url: string; kind: "image" | "video"; mime?: string; size?: number; width?: number; height?: number; duration?: number; thumbUrl?: string; name?: string }
export interface Target {
  id: string; postId: string; platform: Platform; accountId: string; scheduledAt: string | null; status: string;
  attempts: number; lastError: string | null; remoteId: string | null; permalink: string | null; publishedAt: string | null;
  accountName: string; accountPic: string | null;
}
export interface Post {
  id: string; mode: Mode; postType: PostType; media: Media[]; igCaption: string | null; igHashtags: string | null;
  fbCaption: string | null; fbHashtags: string | null; fbLink: string | null; firstComment: string | null; notes: string | null;
  scheduledAt: string | null; status: string; createdAt: string; targets: Target[];
}

export const j = async (method: string, url: string, body?: any) => (await apiRequest(method, url, body)).json();

export function useSocialAccounts() {
  return useQuery<{ instagram: any[]; facebook: any[]; fbConfigured: boolean; limits?: { instagram: any; facebook: any } }>({ queryKey: ["/api/social/accounts"] });
}

export const STATUS_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  draft: { label: "Draft", cls: "border-border bg-muted text-muted-foreground", dot: "bg-slate-400" },
  scheduled: { label: "Scheduled", cls: "border-blue-200 bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  publishing: { label: "Publishing", cls: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  published: { label: "Published", cls: "border-green-200 bg-green-50 text-green-700", dot: "bg-green-600" },
  partial: { label: "Partly published", cls: "border-orange-200 bg-orange-50 text-orange-700", dot: "bg-orange-500" },
  failed: { label: "Failed", cls: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-600" },
  cancelled: { label: "Paused", cls: "border-border bg-muted text-muted-foreground", dot: "bg-slate-400" },
};

export const TYPE_LABEL: Record<PostType, string> = { image: "Photo", carousel: "Carousel", video: "Video", reel: "Reel", story: "Story", text: "Text" };

export function PlatformIcon({ platform, className = "h-3.5 w-3.5" }: { platform: Platform; className?: string }) {
  return platform === "instagram"
    ? <Instagram className={`${className} text-pink-600`} aria-label="Instagram" />
    : <Facebook className={`${className} text-[#1877F2]`} aria-label="Facebook" />;
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.draft;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}</span>;
}

/** When a post (or one platform of it) goes out. */
export function postTime(p: Post, platform?: Platform | "all") {
  const ts = p.targets.filter((t) => !platform || platform === "all" || t.platform === platform);
  const times = ts.map((t) => t.publishedAt || t.scheduledAt).filter(Boolean) as string[];
  const first = times.sort()[0] || p.scheduledAt;
  return first ? new Date(first) : null;
}

export function statusFor(p: Post, platform?: Platform | "all") {
  if (!platform || platform === "all") return p.status;
  const s = p.targets.filter((t) => t.platform === platform).map((t) => t.status);
  if (!s.length) return p.status;
  if (s.every((x) => x === "published")) return "published";
  if (s.includes("publishing")) return "publishing";
  if (s.includes("failed")) return s.includes("published") ? "partial" : "failed";
  if (s.includes("scheduled")) return "scheduled";
  return s[0];
}

export const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
export const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
export const thumbOf = (m?: Media) => (m ? (m.kind === "video" ? m.thumbUrl : m.url) : undefined);
