import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { ChevronLeft, ChevronRight, Film, Images, Loader2, Plus, Type } from "lucide-react";
import {
  type Platform, type Post, PlatformIcon, STATUS_STYLE, StatusBadge, TYPE_LABEL,
  fmtTime, j, postTime, statusFor, thumbOf,
} from "./planner-shared";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

interface Props {
  platform: "all" | Platform;
  /** preselect this account in new posts (e.g. from the Instagram page) */
  account?: { platform: Platform; id: string } | null;
  /** only show posts going to this account */
  accountFilter?: string | null;
}

/** Month / week calendar of social posts. Drag a scheduled post to another day to move it. */
export function PlannerCalendar({ platform, account, accountFilter }: Props) {
  const { toast } = useToast();
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [status, setStatus] = useState("all");
  const [location, navigate] = useLocation();
  // the editor is a full page; come back here afterwards
  const setCompose = (x: { post?: Post | null; date?: Date | null }) => {
    const back = encodeURIComponent(location + (platform !== "all" && location.startsWith("/content-planner") ? `?tab=${platform}` : ""));
    if (x.post) return navigate(`/content-planner/post/${x.post.id}?back=${back}`);
    const qs = new URLSearchParams({ mode: platform === "all" ? "instagram" : platform, back: decodeURIComponent(back) });
    if (x.date) qs.set("date", x.date.toISOString());
    if (account) { qs.set("platform", account.platform); qs.set("account", account.id); }
    navigate(`/content-planner/new?${qs.toString()}`);
  };
  const [dragId, setDragId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "week") { const s = mondayOf(cursor); return { start: s, days: 7 }; }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const s = mondayOf(first);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const days = Math.ceil(((last.getTime() - s.getTime()) / 86400000 + 1) / 7) * 7;
    return { start: s, days };
  }, [cursor, view]);
  const end = addDays(range.start, range.days);

  const q = useQuery<{ data: Post[] }>({
    queryKey: ["/api/social/posts", platform, range.start.toISOString(), status],
    queryFn: () => j("GET", `/api/social/posts?from=${range.start.toISOString()}&to=${end.toISOString()}&platform=${platform}&status=${status}`),
    refetchInterval: 30_000,
  });
  const posts = (q.data?.data || []).filter((p) => !accountFilter || p.targets.some((t) => t.accountId === accountFilter));

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) {
      const t = postTime(p, platform);
      if (!t) continue;
      const k = startOfDay(t).toDateString();
      m.set(k, [...(m.get(k) || []), p]);
    }
    for (const list of m.values()) list.sort((a, b) => (postTime(a, platform)?.getTime() || 0) - (postTime(b, platform)?.getTime() || 0));
    return m;
  }, [posts, platform]);

  const move = useMutation({
    mutationFn: (x: { post: Post; day: Date }) => {
      const old = postTime(x.post, platform) || new Date();
      const at = new Date(x.day.getFullYear(), x.day.getMonth(), x.day.getDate(), old.getHours(), old.getMinutes());
      return j("PATCH", `/api/social/posts/${x.post.id}/reschedule`, { scheduledAt: at.toISOString() });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/social/posts"] }); toast({ title: "Post moved" }); },
    onError: (e: any) => toast({ title: "Couldn't move post", description: e?.message, variant: "destructive" }),
  });

  const title = view === "week"
    ? `${range.start.toLocaleDateString([], { day: "numeric", month: "short" })} – ${addDays(range.start, 6).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`
    : cursor.toLocaleDateString([], { month: "long", year: "numeric" });
  const shift = (n: number) => setCursor(view === "week" ? addDays(cursor, 7 * n) : new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const today = startOfDay(new Date());
  const counts = posts.reduce<Record<string, number>>((a, p) => { const s = statusFor(p, platform); a[s] = (a[s] || 0) + 1; return a; }, {});

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Next" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" onClick={() => setCursor(startOfDay(new Date()))}>Today</Button>
        </div>
        <h2 className="min-w-[180px] text-lg font-semibold">{title}</h2>
        {q.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["draft", "scheduled", "publishing", "published", "partial", "failed"].map((s) => <SelectItem key={s} value={s}>{STATUS_STYLE[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border p-0.5" role="tablist" aria-label="Calendar view">
            {(["month", "week"] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded px-3 py-1 text-sm capitalize ${view === v ? "bg-muted font-medium" : ""}`}>{v}</button>
            ))}
          </div>
          <Button onClick={() => setCompose({ date: null })}><Plus className="mr-1.5 h-4 w-4" />Create post</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries(counts).map(([s, n]) => <span key={s} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${STATUS_STYLE[s]?.dot}`} />{n} {STATUS_STYLE[s]?.label.toLowerCase()}</span>)}
        {!posts.length && !q.isLoading && <span>Nothing planned in this period yet — click a day to add a post.</span>}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          {DOW.map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: range.days }, (_, i) => {
            const day = addDays(range.start, i);
            const list = byDay.get(day.toDateString()) || [];
            const outside = view === "month" && day.getMonth() !== cursor.getMonth();
            const past = day < today;
            const max = view === "week" ? 12 : 3;
            return (
              <div key={i}
                onDragOver={(e) => { if (dragId && !past) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); const p = posts.find((x) => x.id === dragId); setDragId(null); if (p && !past) move.mutate({ post: p, day }); }}
                className={`group relative border-b border-r p-1.5 ${view === "week" ? "min-h-[420px]" : "min-h-[120px]"} ${outside ? "bg-muted/30" : ""}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${sameDay(day, today) ? "bg-[var(--brand)] font-semibold text-white" : outside ? "text-muted-foreground" : ""}`}>{day.getDate()}</span>
                  {!past && (
                    <button type="button" aria-label={`Add post on ${day.toDateString()}`}
                      onClick={() => setCompose({ date: new Date(day.getFullYear(), day.getMonth(), day.getDate(), sameDay(day, today) ? Math.min(new Date().getHours() + 1, 23) : 10, 0) })}
                      className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted focus:opacity-100 group-hover:opacity-100"><Plus className="h-3.5 w-3.5" /></button>
                  )}
                </div>
                <div className="space-y-1">
                  {list.slice(0, max).map((p) => <Chip key={p.id} p={p} platform={platform} onOpen={() => setCompose({ post: p })} onDrag={setDragId} />)}
                  {list.length > max && (
                    <button type="button" className="w-full rounded px-1 text-left text-[11px] text-muted-foreground hover:bg-muted" onClick={() => { setCursor(day); setView("week"); }}>+{list.length - max} more</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <DraftsAndList platform={platform} accountFilter={accountFilter} onOpen={(p) => setCompose({ post: p })} />

    </div>
  );
}

function Chip({ p, platform, onOpen, onDrag }: { p: Post; platform: "all" | Platform; onOpen: () => void; onDrag: (id: string | null) => void }) {
  const t = postTime(p, platform);
  const st = statusFor(p, platform);
  const plats = Array.from(new Set(p.targets.filter((x) => platform === "all" || x.platform === platform).map((x) => x.platform)));
  const movable = ["scheduled", "draft", "failed"].includes(st);
  const caption = (platform === "facebook" ? p.fbCaption : p.igCaption || p.fbCaption) || TYPE_LABEL[p.postType];
  const th = thumbOf(p.media[0]);
  return (
    <button type="button" draggable={movable} onDragStart={() => onDrag(p.id)} onDragEnd={() => onDrag(null)} onClick={onOpen}
      title={`${TYPE_LABEL[p.postType]} · ${STATUS_STYLE[st]?.label}${movable ? " · drag to move" : ""}`}
      className={`flex w-full items-center gap-1.5 rounded-md bg-muted/50 p-1 text-left text-[11px] hover:bg-muted ${movable ? "cursor-grab" : ""}`}>
      <span className={`h-full w-0.5 shrink-0 self-stretch rounded ${STATUS_STYLE[st]?.dot}`} />
      {th ? <img src={th} alt="" className="h-7 w-7 shrink-0 rounded object-cover" /> : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-background">
          {p.postType === "text" ? <Type className="h-3.5 w-3.5" /> : p.postType === "carousel" ? <Images className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          {t && <span className="font-medium tabular-nums">{fmtTime(t)}</span>}
          {plats.map((x) => <PlatformIcon key={x} platform={x} className="h-3 w-3" />)}
        </span>
        <span className="block truncate text-muted-foreground">{caption}</span>
      </span>
    </button>
  );
}

/** Drafts without a date + a full list (with per-destination status) below the calendar. */
function DraftsAndList({ platform, accountFilter, onOpen }: { platform: "all" | Platform; accountFilter?: string | null; onOpen: (p: Post) => void }) {
  const [tab, setTab] = useState<"upcoming" | "drafts" | "failed" | "published">("upcoming");
  const q = useQuery<{ data: Post[] }>({
    queryKey: ["/api/social/posts", platform, "list"],
    queryFn: () => j("GET", `/api/social/posts?platform=${platform}`),
    refetchInterval: 30_000,
  });
  const all = (q.data?.data || []).filter((p) => !accountFilter || p.targets.some((t) => t.accountId === accountFilter));
  const now = Date.now();
  const rows = all.filter((p) => {
    const st = statusFor(p, platform);
    if (tab === "drafts") return st === "draft";
    if (tab === "failed") return st === "failed" || st === "partial";
    if (tab === "published") return st === "published";
    return ["scheduled", "publishing"].includes(st) && (postTime(p, platform)?.getTime() || now) >= now - 3600_000;
  }).sort((a, b) => (postTime(a, platform)?.getTime() || 0) - (postTime(b, platform)?.getTime() || 0));
  const shown = (tab === "published" ? [...rows].reverse() : rows).slice(0, 30);
  return (
    <div className="rounded-2xl border bg-background">
      <div className="flex flex-wrap gap-1 border-b p-2" role="tablist">
        {([["upcoming", "Upcoming"], ["drafts", "Drafts"], ["failed", "Needs attention"], ["published", "Published"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-sm ${tab === k ? "bg-muted font-medium" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      {q.isLoading ? <div className="p-4"><Loader2 className="h-4 w-4 animate-spin" /></div> : shown.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">{tab === "failed" ? "Nothing failed. 🎉" : tab === "drafts" ? "No drafts." : tab === "published" ? "Nothing published yet." : "No upcoming posts."}</p>
      ) : (
        <ul className="divide-y">
          {shown.map((p) => {
            const t = postTime(p, platform);
            return (
              <li key={p.id}>
                <button type="button" onClick={() => onOpen(p)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50">
                  {thumbOf(p.media[0]) ? <img src={thumbOf(p.media[0])} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-xs">{TYPE_LABEL[p.postType]}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.igCaption || p.fbCaption || TYPE_LABEL[p.postType]}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {t ? t.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "No date"}
                      {p.targets.filter((x) => platform === "all" || x.platform === platform).map((x) => (
                        <span key={x.id} className="inline-flex items-center gap-1"><PlatformIcon platform={x.platform} className="h-3 w-3" />{x.platform === "instagram" ? `@${x.accountName}` : x.accountName}<StatusBadge status={x.status} /></span>
                      ))}
                    </span>
                  </span>
                  <StatusBadge status={statusFor(p, platform)} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
