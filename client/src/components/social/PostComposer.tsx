import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequestFormData, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, ArrowRight, Copy, ExternalLink, Film, ImagePlus, Loader2, Pause, RotateCcw, Sparkles, Trash2, X,
} from "lucide-react";
import {
  type Media, type Mode, type Platform, type Post, type PostType, PlatformIcon, StatusBadge, TYPE_LABEL,
  fromLocalInput, j, thumbOf, toLocalInput, useSocialAccounts,
} from "./planner-shared";

interface Props {
  post?: Post | null;
  defaultDate?: Date | null;
  defaultMode?: Mode;
  defaultAccount?: { platform: Platform; id: string } | null;
  onClose: () => void;
}

interface Dest { platform: Platform; accountId: string; custom?: string }

const countTags = (s: string) => (String(s || "").match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;

function nextSlot() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

export function PostComposer({ post, defaultDate, defaultMode = "instagram", defaultAccount, onClose }: Props) {
  const { toast } = useToast();
  const acc = useSocialAccounts();
  const igs = acc.data?.instagram || [];
  const fbs = acc.data?.facebook || [];
  const editing = !!post;
  const locked = post?.targets.filter((t) => t.status === "published") || [];

  const [mode, setMode] = useState<Mode>(post?.mode || defaultMode);
  const [type, setType] = useState<PostType>(post?.postType || "image");
  const [media, setMedia] = useState<Media[]>(post?.media || []);
  const [ig, setIg] = useState({ caption: post?.igCaption || "", tags: post?.igHashtags || "" });
  const [fb, setFb] = useState({ caption: post?.fbCaption || "", tags: post?.fbHashtags || "", link: post?.fbLink || "" });
  const [same, setSame] = useState(!post || ((post.igCaption || "") === (post.fbCaption || "")));
  const [firstComment, setFirstComment] = useState(post?.firstComment || "");
  const [notes, setNotes] = useState(post?.notes || "");
  const [when, setWhen] = useState(toLocalInput(post?.scheduledAt ? new Date(post.scheduledAt) : defaultDate && defaultDate > new Date() ? defaultDate : nextSlot()));
  const [dests, setDests] = useState<Dest[]>(() => {
    if (post) return post.targets.filter((t) => t.status !== "published").map((t) => ({
      platform: t.platform, accountId: t.accountId,
      custom: t.scheduledAt && post.scheduledAt && t.scheduledAt !== post.scheduledAt ? toLocalInput(new Date(t.scheduledAt)) : undefined,
    }));
    return defaultAccount ? [{ platform: defaultAccount.platform, accountId: defaultAccount.id }] : [];
  });
  const [ai, setAi] = useState({ brief: "", tone: "friendly", language: "English" });
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const usesIg = mode !== "facebook";
  const usesFb = mode !== "instagram";
  const types: PostType[] = (["image", "carousel", "video", "reel", "story", "text"] as PostType[]).filter((t) =>
    (t !== "story" || mode === "instagram") && (t !== "text" || mode === "facebook"));
  useEffect(() => { if (!types.includes(type)) setType(mode === "facebook" && !media.length ? "text" : "image"); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleDests = dests.filter((d) => (d.platform === "instagram" ? usesIg : usesFb));
  const toggle = (platform: Platform, accountId: string) => {
    setDests((cur) => (cur.some((d) => d.platform === platform && d.accountId === accountId)
      ? cur.filter((d) => !(d.platform === platform && d.accountId === accountId))
      : [...cur, { platform, accountId }]));
  };
  const destTime = (platform: Platform, accountId: string, v?: string) =>
    setDests((cur) => cur.map((d) => (d.platform === platform && d.accountId === accountId ? { ...d, custom: v } : d)));

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = 10 - media.length;
    if (room <= 0) return toast({ title: "Up to 10 files per post", variant: "destructive" });
    const fd = new FormData();
    Array.from(files).slice(0, room).forEach((f) => fd.append("files", f));
    setUploading(true);
    try {
      const r = await (await apiRequestFormData("POST", "/api/social/upload", fd)).json();
      const next = [...media, ...r.data];
      setMedia(next);
      if (r.errors?.length) toast({ title: "Some files were skipped", description: r.errors.join(" "), variant: "destructive" });
      // pick a sensible type from what was uploaded
      const vids = next.filter((m) => m.kind === "video").length;
      if (next.length > 1 && type !== "carousel") setType("carousel");
      else if (next.length === 1 && vids === 1 && !["video", "reel", "story"].includes(type)) setType("reel");
      else if (next.length === 1 && vids === 0 && !["image", "story"].includes(type)) setType("image");
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const move = (i: number, d: -1 | 1) => setMedia((m) => {
    const n = [...m]; const k = i + d; if (k < 0 || k >= n.length) return m; [n[i], n[k]] = [n[k], n[i]]; return n;
  });

  const aiGen = useMutation({
    mutationFn: () => j("POST", "/api/social/ai/caption", {
      brief: ai.brief, tone: ai.tone, language: ai.language, postType: type,
      platforms: [usesIg && "instagram", usesFb && !same && "facebook", usesFb && same && !usesIg && "facebook"].filter(Boolean),
      current: { instagram: ig.caption || undefined, facebook: fb.caption || undefined },
    }),
    onSuccess: (r: any) => {
      if (r.data.instagram) setIg({ caption: r.data.instagram.caption, tags: r.data.instagram.hashtags });
      if (r.data.facebook) setFb((f) => ({ ...f, caption: r.data.facebook.caption, tags: r.data.facebook.hashtags }));
      if (same && r.data.instagram && usesFb) setFb((f) => ({ ...f, caption: r.data.instagram.caption, tags: r.data.instagram.hashtags.split(" ").slice(0, 5).join(" ") }));
      toast({ title: "Caption written", description: "Edit it as you like before scheduling." });
    },
    onError: (e: any) => toast({ title: "AI couldn't write a caption", description: e?.message, variant: "destructive" }),
  });

  const fbText = same && usesIg ? ig.caption : fb.caption;
  const fbTags = same && usesIg ? fb.tags || ig.tags.split(" ").slice(0, 5).join(" ") : fb.tags;

  // client-side checks (server checks again)
  const problems = useMemo(() => {
    const p: string[] = [];
    const imgs = media.filter((m) => m.kind === "image").length, vids = media.filter((m) => m.kind === "video").length;
    if (usesIg) {
      const full = `${ig.caption}\n\n${ig.tags}`;
      if (full.length > 2200) p.push("Instagram caption is over 2,200 characters.");
      if (countTags(full) > 30) p.push("Instagram allows up to 30 hashtags.");
      if (type === "image" && (imgs !== 1 || vids)) p.push("Photo post needs exactly 1 image.");
      if (type === "carousel" && (media.length < 2 || media.length > 10)) p.push("Carousel needs 2–10 files.");
      if ((type === "video" || type === "reel") && (vids !== 1 || imgs)) p.push(`${TYPE_LABEL[type]} needs exactly 1 video.`);
      if (type === "story" && media.length !== 1) p.push("Story needs 1 photo or video.");
      const v = media.find((m) => m.kind === "video");
      if (v?.duration && (v.duration < 3 || v.duration > 900)) p.push("Instagram videos must be 3 s to 15 min.");
    }
    if (usesFb) {
      if (type === "text" && !fbText.trim() && !fb.link) p.push("Facebook text post needs text or a link.");
      if ((type === "image" || type === "carousel") && (!imgs || vids)) p.push("Facebook photo post needs only images.");
    }
    return p;
  }, [media, type, ig, fb, fbText, usesIg, usesFb]);

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (usesIg && type !== "story" && type !== "reel") {
      for (const m of media) if (m.width && m.height) {
        const r = m.width / m.height;
        if (r < 0.8 || r > 1.91) { w.push("Instagram feed photos must be between 4:5 (portrait) and 1.91:1 (landscape) — crop before posting."); break; }
      }
    }
    if ((type === "reel" || type === "story") && media[0]?.width && media[0]?.height && media[0].width > media[0].height) w.push("Reels and Stories look best vertical (9:16).");
    return w;
  }, [media, type, usesIg]);

  const save = useMutation({
    mutationFn: (action: "draft" | "schedule" | "publish_now") => {
      const body = {
        mode, postType: type, media,
        igCaption: usesIg ? ig.caption : null, igHashtags: usesIg ? ig.tags : null,
        fbCaption: usesFb ? fbText : null, fbHashtags: usesFb ? fbTags : null, fbLink: usesFb && fb.link ? fb.link : null,
        firstComment: usesIg ? firstComment || null : null, notes: notes || null,
        scheduledAt: fromLocalInput(when),
        targets: visibleDests.map((d) => ({ platform: d.platform, accountId: d.accountId, scheduledAt: d.custom ? fromLocalInput(d.custom) : fromLocalInput(when) })),
        action,
      };
      return j(editing ? "PUT" : "POST", editing ? `/api/social/posts/${post!.id}` : "/api/social/posts", body);
    },
    onSuccess: (_r, action) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social/posts"] });
      toast({ title: action === "draft" ? "Draft saved" : action === "publish_now" ? "Publishing now" : "Scheduled", description: action === "publish_now" ? "Videos can take a few minutes to process on Instagram." : undefined });
      onClose();
    },
    onError: (e: any) => setErr(e?.message || "Couldn't save"),
  });

  const retry = useMutation({ mutationFn: (id: string) => j("POST", `/api/social/targets/${id}/retry`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/social/posts"] }); toast({ title: "Retrying now" }); onClose(); } });
  const pause = useMutation({ mutationFn: (id: string) => j("POST", `/api/social/targets/${id}/pause`), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/social/posts"] }); toast({ title: "Destination paused (saved as draft)" }); onClose(); } });
  const del = useMutation({
    mutationFn: () => j("DELETE", `/api/social/posts/${post!.id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/social/posts"] }); toast({ title: "Post deleted" }); onClose(); },
  });

  const busy = save.isPending || uploading;
  const canPublish = visibleDests.length > 0 && problems.length === 0 && !busy;

  return (
    <div className="rounded-2xl border bg-background p-4 sm:p-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            {editing && post!.targets.length > 0 && (
              <section className="space-y-2 rounded-xl border p-3">
                <p className="text-sm font-medium">Where it goes</p>
                {post!.targets.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <PlatformIcon platform={t.platform} />
                    <span className="font-medium">{t.platform === "instagram" ? `@${t.accountName}` : t.accountName}</span>
                    <StatusBadge status={t.status} />
                    <span className="text-xs text-muted-foreground">
                      {t.publishedAt ? `Published ${new Date(t.publishedAt).toLocaleString()}` : t.scheduledAt ? new Date(t.scheduledAt).toLocaleString() : "No time set"}
                    </span>
                    <span className="ml-auto flex gap-1">
                      {t.permalink && <a href={t.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline">View<ExternalLink className="h-3 w-3" /></a>}
                      {t.status === "failed" && <Button size="sm" variant="outline" className="h-7" onClick={() => retry.mutate(t.id)} disabled={retry.isPending}><RotateCcw className="mr-1 h-3.5 w-3.5" />Retry</Button>}
                      {t.status === "scheduled" && <Button size="sm" variant="ghost" className="h-7" onClick={() => pause.mutate(t.id)}><Pause className="mr-1 h-3.5 w-3.5" />Pause</Button>}
                    </span>
                    {t.lastError && <p className="w-full text-xs text-destructive">{t.lastError}</p>}
                  </div>
                ))}
                {locked.length > 0 && <p className="text-xs text-muted-foreground">Published destinations stay as they are; changes below apply to the rest.</p>}
              </section>
            )}

            <section className="space-y-2">
              <Label>Publish to</Label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Platforms">
                {([["instagram", "Instagram only"], ["facebook", "Facebook only"], ["both", "Facebook + Instagram"]] as const).map(([m, l]) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm ${mode === m ? "border-[var(--brand)] bg-[var(--brand)]/10 font-medium" : "hover:bg-muted"}`}>
                    {m !== "facebook" && <PlatformIcon platform="instagram" />}{m !== "instagram" && <PlatformIcon platform="facebook" />}{l}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <Label>Accounts and Pages</Label>
              {acc.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <div className="space-y-2">
                  {usesIg && (igs.length ? igs.map((a: any) => (
                    <DestRow key={a.id} platform="instagram" name={`@${a.username}`} pic={a.profilePic} disabled={a.status !== "active"}
                      dest={dests.find((d) => d.platform === "instagram" && d.accountId === a.id)} onToggle={() => toggle("instagram", a.id)}
                      onTime={(v) => destTime("instagram", a.id, v)} defaultTime={when} />
                  )) : <p className="text-sm text-muted-foreground">No Instagram account connected. <a className="text-[var(--brand)] underline" href="/instagram">Connect one</a>.</p>)}
                  {usesFb && (fbs.length ? fbs.map((p: any) => (
                    <DestRow key={p.id} platform="facebook" name={p.name} pic={p.picture} disabled={p.status !== "active"}
                      dest={dests.find((d) => d.platform === "facebook" && d.accountId === p.id)} onToggle={() => toggle("facebook", p.id)}
                      onTime={(v) => destTime("facebook", p.id, v)} defaultTime={when} />
                  )) : <p className="text-sm text-muted-foreground">No Facebook Page connected. <a className="text-[var(--brand)] underline" href="/content-planner?tab=accounts">Connect Pages</a>.</p>)}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <Label>Post type</Label>
              <div className="flex flex-wrap gap-2">
                {types.map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t}
                    className={`rounded-full border px-3 py-1 text-sm ${type === t ? "border-[var(--brand)] bg-[var(--brand)]/10 font-medium text-[var(--brand)]" : "hover:bg-muted"}`}>{TYPE_LABEL[t]}</button>
                ))}
              </div>
            </section>

            {type !== "text" && (
              <section className="space-y-2">
                <Label>Photos and videos</Label>
                <div className="flex flex-wrap gap-3">
                  {media.map((m, i) => (
                    <div key={m.url} className="group relative h-28 w-24 overflow-hidden rounded-lg border bg-muted">
                      {thumbOf(m) ? <img src={thumbOf(m)} alt={m.name || ""} className="h-full w-full object-cover" /> : <Film className="m-auto mt-10 h-6 w-6 text-muted-foreground" />}
                      {m.kind === "video" && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{m.duration ? `${Math.round(m.duration)}s` : "video"}</span>}
                      <button type="button" aria-label="Remove" onClick={() => setMedia(media.filter((_, k) => k !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"><X className="h-3.5 w-3.5" /></button>
                      {media.length > 1 && (
                        <div className="absolute bottom-1 right-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                          <button type="button" aria-label="Move left" onClick={() => move(i, -1)} className="rounded bg-black/60 p-0.5 text-white"><ArrowLeft className="h-3 w-3" /></button>
                          <button type="button" aria-label="Move right" onClick={() => move(i, 1)} className="rounded bg-black/60 p-0.5 text-white"><ArrowRight className="h-3 w-3" /></button>
                        </div>
                      )}
                    </div>
                  ))}
                  {media.length < 10 && (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
                      className="flex h-28 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs text-muted-foreground hover:border-[var(--brand)]">
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                      {uploading ? "Uploading…" : "Add or drop"}
                    </button>
                  )}
                  <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" className="sr-only" onChange={(e) => upload(e.target.files)} />
                </div>
                <p className="text-xs text-muted-foreground">Your own JPG/PNG photos (converted to JPEG) or MP4/MOV videos up to 500 MB. Reels: vertical 9:16, 3 s–15 min.</p>
              </section>
            )}

            <section className="space-y-3 rounded-xl border bg-violet-50/40 p-4 dark:bg-violet-950/10">
              <p className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-violet-600" />Write caption and hashtags with AI</p>
              <Textarea rows={2} value={ai.brief} onChange={(e) => setAi({ ...ai, brief: e.target.value })} placeholder="What's this post about? e.g. New Diwali kurta collection, 20% off this week, free delivery in Delhi" />
              <div className="flex flex-wrap gap-2">
                <Select value={ai.tone} onValueChange={(v) => setAi({ ...ai, tone: v })}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{["friendly", "professional", "playful", "luxury", "urgent"].map((t) => <SelectItem key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={ai.language} onValueChange={(v) => setAi({ ...ai, language: v })}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>{["English", "Hinglish", "Hindi"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => aiGen.mutate()} disabled={aiGen.isPending || ai.brief.trim().length < 3}>
                  {aiGen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : ig.caption || fb.caption ? "Rewrite" : "Write it"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">AI writes text only. You can edit everything below.</p>
            </section>

            {usesIg && (
              <CaptionBox platform="instagram" caption={ig.caption} tags={ig.tags} onCaption={(v) => setIg({ ...ig, caption: v })} onTags={(v) => setIg({ ...ig, tags: v })} limit={2200} />
            )}
            {usesFb && usesIg && (
              <label className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>Use the Instagram caption on Facebook</span>
                <Switch checked={same} onCheckedChange={(v) => { setSame(v); if (!v && !fb.caption) setFb({ ...fb, caption: ig.caption, tags: ig.tags.split(" ").slice(0, 5).join(" ") }); }} />
              </label>
            )}
            {usesFb && (!usesIg || !same) && (
              <CaptionBox platform="facebook" caption={fb.caption} tags={fb.tags} onCaption={(v) => setFb({ ...fb, caption: v })} onTags={(v) => setFb({ ...fb, tags: v })} limit={63206} />
            )}
            {usesFb && same && usesIg && (
              <div className="space-y-1.5">
                <Label htmlFor="fb-tags-same">Facebook hashtags</Label>
                <Input id="fb-tags-same" value={fbTags} onChange={(e) => setFb({ ...fb, tags: e.target.value })} placeholder="#diwali #delhi" />
                <p className="text-xs text-muted-foreground">Facebook works best with 2–5 hashtags.</p>
              </div>
            )}
            {usesFb && type === "text" && (
              <div className="space-y-1.5"><Label htmlFor="fb-link">Link (optional)</Label><Input id="fb-link" value={fb.link} onChange={(e) => setFb({ ...fb, link: e.target.value })} placeholder="https://yourshop.com/sale" /></div>
            )}
            {usesIg && type !== "story" && (
              <div className="space-y-1.5">
                <Label htmlFor="first-comment">Instagram first comment (optional)</Label>
                <Input id="first-comment" value={firstComment} onChange={(e) => setFirstComment(e.target.value)} placeholder="Put extra hashtags or a link here" />
              </div>
            )}

            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="when">Date and time</Label>
                <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                <p className="text-xs text-muted-foreground">Your time zone. Each account can have its own time above.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Internal note</Label>
                <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only your team sees this" />
              </div>
            </section>

            {(problems.length > 0 || warnings.length > 0) && (
              <ul className="space-y-1 text-sm">
                {problems.map((p) => <li key={p} className="text-destructive">• {p}</li>)}
                {warnings.map((p) => <li key={p} className="text-amber-700">• {p}</li>)}
              </ul>
            )}
            {err && <p className="text-sm text-destructive" role="alert">{err}</p>}

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {editing && <Button variant="ghost" className="text-destructive" onClick={() => confirm("Delete this post? Already-published posts stay on Instagram/Facebook.") && del.mutate()}><Trash2 className="mr-1.5 h-4 w-4" />Delete</Button>}
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button>
                <Button variant="outline" onClick={() => { setErr(null); save.mutate("draft"); }} disabled={busy}>Save draft</Button>
                <Button variant="outline" onClick={() => { setErr(null); confirm("Publish now to the selected accounts?") && save.mutate("publish_now"); }} disabled={!canPublish}>Publish now</Button>
                <Button onClick={() => { setErr(null); save.mutate("schedule"); }} disabled={!canPublish}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Schedule${visibleDests.length ? ` to ${visibleDests.length}` : ""}`}
                </Button>
              </div>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            {usesIg && <Preview platform="instagram" media={media} caption={[ig.caption, ig.tags].filter(Boolean).join("\n\n")} type={type}
              name={igs.find((a: any) => dests.some((d) => d.platform === "instagram" && d.accountId === a.id))?.username || "your_account"} />}
            {usesFb && <Preview platform="facebook" media={media} caption={[fbText, fbTags].filter(Boolean).join("\n\n")} type={type}
              name={fbs.find((p: any) => dests.some((d) => d.platform === "facebook" && d.accountId === p.id))?.name || "Your Page"} />}
            {editing && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => {
                navigator.clipboard?.writeText([ig.caption, ig.tags].filter(Boolean).join("\n\n"));
                toast({ title: "Caption copied" });
              }}><Copy className="mr-1.5 h-4 w-4" />Copy caption</Button>
            )}
          </aside>
        </div>
    </div>
  );
}

function DestRow({ platform, name, pic, dest, onToggle, onTime, defaultTime, disabled }: {
  platform: Platform; name: string; pic?: string | null; dest?: Dest; onToggle: () => void; onTime: (v?: string) => void; defaultTime: string; disabled?: boolean;
}) {
  const on = !!dest;
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-lg border p-2.5 ${on ? "border-[var(--brand)]/50 bg-[var(--brand)]/5" : ""}`}>
      <label className="flex flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={on} onChange={onToggle} disabled={disabled && !on} className="h-4 w-4" />
        {pic ? <img src={pic} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted"><PlatformIcon platform={platform} /></span>}
        <span className="text-sm font-medium">{name}</span>
        <PlatformIcon platform={platform} />
        {disabled && <span className="text-xs text-destructive">reconnect</span>}
      </label>
      {on && (dest!.custom !== undefined ? (
        <span className="flex items-center gap-1">
          <Input type="datetime-local" className="h-8 w-52" value={dest!.custom} onChange={(e) => onTime(e.target.value)} aria-label={`Time for ${name}`} />
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Use the main time" onClick={() => onTime(undefined)}><X className="h-3.5 w-3.5" /></Button>
        </span>
      ) : (
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onTime(defaultTime)}>Different time</button>
      ))}
    </div>
  );
}

function CaptionBox({ platform, caption, tags, onCaption, onTags, limit }: { platform: Platform; caption: string; tags: string; onCaption: (v: string) => void; onTags: (v: string) => void; limit: number }) {
  const total = (caption + (tags ? `\n\n${tags}` : "")).length;
  const n = countTags(`${caption} ${tags}`);
  return (
    <section className="space-y-2">
      <Label htmlFor={`cap-${platform}`} className="flex items-center gap-1.5"><PlatformIcon platform={platform} />{platform === "instagram" ? "Instagram caption" : "Facebook text"}</Label>
      <Textarea id={`cap-${platform}`} rows={6} value={caption} onChange={(e) => onCaption(e.target.value)} placeholder={platform === "instagram" ? "Hook line…\n\nDetails…\n\nComment SHOP and we'll DM you the link 👇" : "Tell your followers what's new…"} />
      <Input value={tags} onChange={(e) => onTags(e.target.value)} placeholder="#hashtags separated by spaces" aria-label={`${platform} hashtags`} />
      <p className={`text-right text-xs ${total > limit || (platform === "instagram" && n > 30) ? "text-destructive" : "text-muted-foreground"}`}>
        {total.toLocaleString()}/{limit.toLocaleString()} characters{platform === "instagram" ? ` · ${n}/30 hashtags` : ` · ${n} hashtags`}
      </p>
    </section>
  );
}

function Preview({ platform, media, caption, type, name }: { platform: Platform; media: Media[]; caption: string; type: PostType; name: string }) {
  const first = media[0];
  const aspect = type === "reel" || type === "story" ? "aspect-[9/16]" : platform === "instagram" ? "aspect-[4/5]" : "aspect-square";
  const short = caption.length > 180 ? `${caption.slice(0, 180).trimEnd()}… more` : caption;
  return (
    <div className="overflow-hidden rounded-xl border bg-background text-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted"><PlatformIcon platform={platform} className="h-3 w-3" /></span>
        <span className="truncate font-medium">{name}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{TYPE_LABEL[type]}{media.length > 1 ? ` · ${media.length}` : ""}</span>
      </div>
      {platform === "facebook" && caption && <p className="whitespace-pre-wrap break-words px-3 pb-2">{short}</p>}
      {type !== "text" && (
        <div className={`${aspect} w-full overflow-hidden bg-muted`}>
          {first ? (first.kind === "video" ? <video src={first.url} poster={first.thumbUrl} className="h-full w-full object-cover" muted controls /> : <img src={first.url} alt="" className="h-full w-full object-cover" />)
            : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No media yet</div>}
        </div>
      )}
      {platform === "instagram" && <p className="whitespace-pre-wrap break-words px-3 py-2"><b>{name}</b> {short || <span className="text-muted-foreground">Caption…</span>}</p>}
    </div>
  );
}
