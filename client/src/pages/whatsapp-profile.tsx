import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiRequestFormData } from "@/lib/queryClient";
import { useChannelContext } from "@/contexts/channel-context";
import { Camera, Clock, Loader2, Plus, ShieldCheck, Store, X } from "lucide-react";

const j = async (method: string, url: string, body?: any) => (await apiRequest(method, url, body)).json();

const VERTICAL_LABEL: Record<string, string> = {
  UNDEFINED: "Not set", OTHER: "Other", AUTO: "Automotive", BEAUTY: "Beauty, spa & salon", APPAREL: "Clothing & apparel", EDU: "Education",
  ENTERTAIN: "Entertainment", EVENT_PLAN: "Event planning", FINANCE: "Finance & banking", GROCERY: "Food & grocery", GOVT: "Public service",
  HOTEL: "Hotel & lodging", HEALTH: "Medical & health", NONPROFIT: "Non-profit", PROF_SERVICES: "Professional services", RETAIL: "Shopping & retail",
  TRAVEL: "Travel & transportation", RESTAURANT: "Restaurant", NOT_A_BIZ: "Not a business",
};
const DAYS: Array<[string, string]> = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
const QUALITY: Record<string, string> = { GREEN: "High", YELLOW: "Medium", RED: "Low" };
const TIERS: Record<string, string> = { TIER_50: "50", TIER_250: "250", TIER_1K: "1,000", TIER_10K: "10,000", TIER_100K: "100,000", TIER_UNLIMITED: "Unlimited" };

export default function WhatsAppProfilePage() {
  const { selectedChannel } = useChannelContext() as any;
  const channelId: string | undefined = selectedChannel?.id;
  const q = useQuery<any>({
    queryKey: ["/api/whatsapp-profile", channelId],
    queryFn: () => j("GET", `/api/whatsapp-profile/${channelId}`),
    enabled: !!channelId,
    retry: false,
  });
  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="WhatsApp Profile" subtitle="What customers see when they open your business on WhatsApp" />
      <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        {!channelId ? <Card><CardContent className="p-8 text-center text-muted-foreground sm:p-8">Select a WhatsApp number first.</CardContent></Card>
          : q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" />
            : q.error ? <Card><CardContent className="p-6 text-sm text-destructive sm:p-6">{(q.error as any).message}</CardContent></Card>
              : <ProfileEditor key={channelId} channelId={channelId} data={q.data} onSaved={() => q.refetch()} />}
      </main>
    </div>
  );
}

function ProfileEditor({ channelId, data, onSaved }: { channelId: string; data: any; onSaved: () => void }) {
  const { toast } = useToast();
  const p = data.profile || {};
  const [f, setF] = useState({
    about: p.about || "", description: p.description || "", address: p.address || "", email: p.email || "",
    websites: (p.websites?.length ? p.websites : [""]) as string[], vertical: p.vertical || "UNDEFINED",
  });
  const [photo, setPhoto] = useState<string | null>(p.profile_picture_url || null);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useMutation({
    mutationFn: () => j("PUT", `/api/whatsapp-profile/${channelId}`, { ...f, websites: f.websites.filter((w) => w.trim()) }),
    onSuccess: () => { toast({ title: "Profile updated on WhatsApp", description: "Changes can take a few minutes to show in the app." }); onSaved(); },
    onError: (e: any) => toast({ title: "Couldn't update profile", description: e?.message, variant: "destructive" }),
  });
  const up = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData(); fd.append("photo", file);
      return (await apiRequestFormData("POST", `/api/whatsapp-profile/${channelId}/photo`, fd)).json();
    },
    onSuccess: (r: any) => { setPhoto(r.profilePictureUrl || photo); toast({ title: "Profile photo updated" }); },
    onError: (e: any) => toast({ title: "Photo not updated", description: e?.message, variant: "destructive" }),
  });
  const pickFile = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) return toast({ title: "Use a JPG or PNG image", variant: "destructive" });
    if (file.size > 5 * 1024 * 1024) return toast({ title: "Photo must be under 5 MB", variant: "destructive" });
    up.mutate(file);
  };
  const ph = data.phone || {};
  const name = ph.verified_name || data.channel?.name;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {data.profileError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Couldn't load your current WhatsApp profile: {data.profileError} Saving will still overwrite it.
          </div>
        )}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Business profile</CardTitle>
            <CardDescription>Saved straight to WhatsApp. Shown on your profile page in the WhatsApp app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-5">
              <button type="button" onClick={() => fileRef.current?.click()} className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full border bg-muted focus-visible:outline focus-visible:outline-2" aria-label="Change profile photo">
                {photo ? <img src={photo} alt="Profile" className="h-full w-full object-cover" /> : <Store className="m-auto h-10 w-10 text-muted-foreground" />}
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition group-hover:opacity-100">
                  {up.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                </span>
              </button>
              <div className="space-y-1">
                <p className="font-medium">Profile photo (logo)</p>
                <p className="text-sm text-muted-foreground">Square JPG or PNG, at least 640×640, under 5 MB. WhatsApp crops it to a circle.</p>
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={up.isPending}>{up.isPending ? "Uploading…" : "Upload new photo"}</Button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wp-about">About</Label>
              <Input id="wp-about" maxLength={139} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} placeholder="e.g. Open 10am–7pm · Free delivery in Delhi NCR" />
              <p className="text-right text-xs text-muted-foreground">{f.about.length}/139</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-desc">Description</Label>
              <Textarea id="wp-desc" rows={4} maxLength={512} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What you sell or do, in a few lines." />
              <p className="text-right text-xs text-muted-foreground">{f.description.length}/512</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={f.vertical} onValueChange={(v) => setF({ ...f, vertical: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{(data.verticals || []).map((v: string) => <SelectItem key={v} value={v}>{VERTICAL_LABEL[v] || v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wp-email">Email</Label>
                <Input id="wp-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="hello@yourbusiness.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wp-addr">Address</Label>
              <Textarea id="wp-addr" rows={2} maxLength={256} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Websites (up to 2)</Label>
              {f.websites.map((w, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={w} onChange={(e) => setF({ ...f, websites: f.websites.map((x, k) => (k === i ? e.target.value : x)) })} placeholder="https://yourbusiness.com" aria-label={`Website ${i + 1}`} />
                  {f.websites.length > 1 && <Button size="icon" variant="ghost" aria-label="Remove website" onClick={() => setF({ ...f, websites: f.websites.filter((_, k) => k !== i) })}><X className="h-4 w-4" /></Button>}
                </div>
              ))}
              {f.websites.length < 2 && <Button size="sm" variant="outline" onClick={() => setF({ ...f, websites: [...f.websites, ""] })}><Plus className="mr-1 h-3.5 w-3.5" />Add website</Button>}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending || !f.about.trim()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save to WhatsApp"}</Button>
            </div>
          </CardContent>
        </Card>
        <HoursCard channelId={channelId} initial={data.hours} openNow={data.openNow} />
      </div>

      <div className="space-y-6">
        <Card className="overflow-hidden rounded-2xl">
          <div className="bg-[#075e54] px-5 pb-6 pt-8 text-center text-white">
            <div className="mx-auto h-20 w-20 overflow-hidden rounded-full border-2 border-white/40 bg-white/10">
              {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <Store className="m-5 h-10 w-10" />}
            </div>
            <p className="mt-3 flex items-center justify-center gap-1 text-lg font-semibold">{name}</p>
            <p className="text-sm text-white/80">{ph.display_phone_number || data.channel?.phoneNumber}</p>
          </div>
          <CardContent className="space-y-3 p-5 text-sm sm:p-5">
            <p className="text-xs text-muted-foreground">Preview</p>
            {f.about && <p>{f.about}</p>}
            {f.description && <p className="whitespace-pre-wrap text-muted-foreground">{f.description}</p>}
            {f.vertical !== "UNDEFINED" && <p><span className="text-muted-foreground">Category · </span>{VERTICAL_LABEL[f.vertical]}</p>}
            {f.address && <p><span className="text-muted-foreground">Address · </span>{f.address}</p>}
            {f.email && <p className="text-[#027eb5]">{f.email}</p>}
            {f.websites.filter(Boolean).map((w) => <p key={w} className="truncate text-[#027eb5]">{w}</p>)}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" />Number health</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {ph.error ? <p className="text-muted-foreground">{ph.error}</p> : (
              <>
                <Row l="Display name" v={<>{ph.verified_name} {ph.name_status && <Badge variant="outline" className="ml-1">{String(ph.name_status).replace(/_/g, " ").toLowerCase()}</Badge>}</>} />
                {ph.new_name_status && ph.new_name_status !== "NONE" && <Row l="Name change" v={String(ph.new_name_status).replace(/_/g, " ").toLowerCase()} />}
                <Row l="Quality" v={<span className={ph.quality_rating === "RED" ? "text-destructive" : ph.quality_rating === "YELLOW" ? "text-amber-600" : "text-green-700"}>{QUALITY[ph.quality_rating] || ph.quality_rating || "—"}</span>} />
                <Row l="Daily limit" v={`${TIERS[ph.messaging_limit_tier] || ph.messaging_limit_tier || "—"} customers`} />
                <Row l="Throughput" v={ph.throughput?.level || "—"} />
                <p className="pt-2 text-xs text-muted-foreground">To change the display name, use WhatsApp Manager — Meta reviews every new name.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ l, v }: { l: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{l}</span><span className="text-right">{v}</span></div>;
}

function HoursCard({ channelId, initial, openNow }: { channelId: string; initial: any; openNow: boolean }) {
  const { toast } = useToast();
  const [h, setH] = useState<any>(initial);
  const [open, setOpen] = useState(openNow);
  useEffect(() => setH(initial), [initial]);
  const save = useMutation({
    mutationFn: () => j("PUT", `/api/whatsapp-profile/${channelId}/hours`, h),
    onSuccess: (r: any) => { setOpen(r.openNow); toast({ title: "Business hours saved" }); },
    onError: (e: any) => toast({ title: "Couldn't save hours", description: e?.message, variant: "destructive" }),
  });
  const setDay = (d: string, slots: Array<[string, string]>) => setH({ ...h, days: { ...h.days, [d]: slots } });
  const tzs = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />Business hours & away message</CardTitle>
          <CardDescription className="mt-1">Outside these hours, people who message you get an automatic reply. {h.enabled && <b className={open ? "text-green-700" : "text-amber-700"}>{open ? "Open now." : "Closed now."}</b>}</CardDescription>
        </div>
        <Switch checked={!!h.enabled} onCheckedChange={(v) => setH({ ...h, enabled: v })} aria-label="Business hours on/off" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {DAYS.map(([k, label]) => {
            const slots: Array<[string, string]> = h.days?.[k] || [];
            const isOpenDay = slots.length > 0;
            return (
              <div key={k} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="w-24">{label}</span>
                <Switch checked={isOpenDay} onCheckedChange={(v) => setDay(k, v ? [["10:00", "19:00"]] : [])} aria-label={`${label} open`} />
                {isOpenDay ? slots.map((s, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <Input type="time" className="h-8 w-28" value={s[0]} onChange={(e) => setDay(k, slots.map((x, n) => (n === i ? [e.target.value, x[1]] : x)) as any)} aria-label={`${label} opens`} />
                    <span>–</span>
                    <Input type="time" className="h-8 w-28" value={s[1]} onChange={(e) => setDay(k, slots.map((x, n) => (n === i ? [x[0], e.target.value] : x)) as any)} aria-label={`${label} closes`} />
                  </span>
                )) : <span className="text-muted-foreground">Closed</span>}
              </div>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Time zone</Label>
            <Select value={h.timezone} onValueChange={(v) => setH({ ...h, timezone: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{tzs.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="away-cd">Repeat to the same person after</Label>
            <Select value={String(h.cooldownHours || 12)} onValueChange={(v) => setH({ ...h, cooldownHours: Number(v) })}>
              <SelectTrigger id="away-cd"><SelectValue /></SelectTrigger>
              <SelectContent>{[4, 8, 12, 24, 48].map((n) => <SelectItem key={n} value={String(n)}>{n} hours</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="away-msg">Away message</Label>
          <Textarea id="away-msg" rows={3} value={h.awayMessage || ""} onChange={(e) => setH({ ...h, awayMessage: e.target.value })} />
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save hours"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
