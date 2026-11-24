/**
 * Appointments — doctors / clinics / salons. Patients book slots on WhatsApp
 * (type "book"); staff see the day schedule, add walk-ins and manage doctors.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Copy, Loader2, MoreHorizontal, Pencil, Plus, Settings2, Stethoscope, Trash2, UserX, X,
} from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useChannelContext } from "@/contexts/channel-context";
import { WEEKDAYS, addDays, localDate, type WeeklyHours } from "@shared/appointment-slots";

const DAY_LABEL: Record<string, string> = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
const ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const STATUS: Record<string, { label: string; cls: string }> = {
  booked: { label: "Booked", cls: "bg-sky-100 text-sky-800" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Completed", cls: "bg-slate-200 text-slate-700" },
  no_show: { label: "No-show", cls: "bg-amber-100 text-amber-800" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-700 line-through" },
};
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Kathmandu", "Asia/Dhaka", "Europe/London", "America/New_York", "Australia/Sydney"];

const fmtTime = (iso: string, tz: string) => new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).toUpperCase();
const fmtLongDay = (date: string, tz: string) => new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00Z`));

export default function AppointmentsPage() {
  const { selectedChannel } = useChannelContext() as any;
  const channelId: string | undefined = selectedChannel?.id;
  const settings = useQuery<any>({
    queryKey: ["/api/appointments/settings", channelId],
    enabled: !!channelId,
    queryFn: async () => (await apiRequest("GET", `/api/appointments/settings?channelId=${channelId}`)).json(),
  });
  const providers = useQuery<any>({
    queryKey: ["/api/appointments/providers", channelId],
    enabled: !!channelId,
    queryFn: async () => (await apiRequest("GET", `/api/appointments/providers?channelId=${channelId}`)).json(),
  });
  const s = settings.data?.data;
  const tz = s?.timezone || "Asia/Kolkata";
  const link = selectedChannel?.phoneNumber ? `https://wa.me/${String(selectedChannel.phoneNumber).replace(/\D/g, "")}?text=${encodeURIComponent((s?.keywords || ["book"])[0])}` : "";

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Appointments" subtitle="Patients book time slots on WhatsApp — you manage the day here" />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {!channelId ? (
          <Card><CardContent className="text-center text-muted-foreground">Select a WhatsApp number first.</CardContent></Card>
        ) : (
          <>
            <Card className="overflow-hidden rounded-2xl border-0 bg-gradient-to-r from-sky-700 to-cyan-600 text-white">
              <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-white/85">
                    <span className={`h-2 w-2 rounded-full ${s?.enabled ? "bg-emerald-300" : "bg-amber-300"}`} />
                    {s?.enabled ? "Online booking is on" : "Online booking is off — turn it on in Settings"}
                  </div>
                  <h2 className="text-xl font-semibold sm:text-2xl">Patients type “{(s?.keywords || ["book"])[0]}” to book a slot</h2>
                  <p className="text-sm text-white/75">They pick the {String(s?.providerLabel || "doctor").toLowerCase()}, day and time, and can reschedule or cancel themselves.</p>
                </div>
                {link && (
                  <div className="flex w-full max-w-md gap-2">
                    <Input readOnly value={link} className="border-white/20 bg-white/10 text-white" onFocus={(e) => e.target.select()} />
                    <Button variant="secondary" className="bg-white text-sky-700 hover:bg-white/90" onClick={() => navigator.clipboard.writeText(link)}><Copy className="h-4 w-4" /></Button>
                  </div>
                )}
              </CardContent>
            </Card>
            <Tabs defaultValue="schedule">
              <TabsList>
                <TabsTrigger value="schedule"><CalendarDays className="mr-1.5 h-4 w-4" />Schedule</TabsTrigger>
                <TabsTrigger value="doctors"><Stethoscope className="mr-1.5 h-4 w-4" />{s?.providerLabel === "Doctor" || !s ? "Doctors" : `${s.providerLabel}s`}</TabsTrigger>
                <TabsTrigger value="settings"><Settings2 className="mr-1.5 h-4 w-4" />Settings</TabsTrigger>
              </TabsList>
              <TabsContent value="schedule" className="mt-4"><ScheduleTab channelId={channelId} tz={tz} providers={providers.data?.data || []} /></TabsContent>
              <TabsContent value="doctors" className="mt-4"><DoctorsTab channelId={channelId} rows={providers.data?.data || []} loading={providers.isLoading} /></TabsContent>
              <TabsContent value="settings" className="mt-4">{settings.data ? <SettingsTab channelId={channelId} data={settings.data} /> : <Loader2 className="h-5 w-5 animate-spin" />}</TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

/* ───────────── Schedule ───────────── */

function ScheduleTab({ channelId, tz, providers }: { channelId: string; tz: string; providers: any[] }) {
  const { toast } = useToast();
  const [date, setDate] = useState(() => localDate(new Date(), tz));
  const [prov, setProv] = useState("all");
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<any>(null);
  const q = useQuery<any>({
    queryKey: ["/api/appointments", channelId, date, prov],
    queryFn: async () => (await apiRequest("GET", `/api/appointments?channelId=${channelId}&date=${date}&providerId=${prov}`)).json(),
    refetchInterval: 30000,
  });
  const byId = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);
  const rows: any[] = q.data?.data || [];
  const st = q.data?.stats || {};
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/appointments", channelId] });
  const update = useMutation({
    mutationFn: async (b: any) => (await apiRequest("PATCH", `/api/appointments/${b.id}`, { channelId, ...b })).json(),
    onSuccess: (r) => {
      refresh();
      if (r.notifyError) toast({ title: "Saved, patient not notified", description: r.notifyError, variant: "destructive" });
      else toast({ title: "Appointment updated", description: r.notified ? "Patient notified on WhatsApp." : undefined });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[{ l: "Today", v: st.today ?? 0 }, { l: "Upcoming", v: st.upcoming ?? 0 }, { l: "Completed (30 days)", v: st.done30 ?? 0 }, { l: "No-shows (30 days)", v: st.noShow30 ?? 0 }].map((k) => (
          <Card key={k.l} className="rounded-2xl"><CardContent><p className="text-xs text-muted-foreground">{k.l}</p><p className="mt-1 text-2xl font-bold tabular-nums">{k.v}</p></CardContent></Card>
        ))}
      </div>
      <Card className="rounded-2xl">
        <CardHeader className="gap-3 pb-3 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
            <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
            <Button size="icon" variant="outline" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setDate(localDate(new Date(), tz))}>Today</Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={prov} onValueChange={setProv}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All doctors</SelectItem>
                {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => setAdding(true)} disabled={!providers.length}><Plus className="mr-1.5 h-4 w-4" />New appointment</Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm font-medium">{fmtLongDay(date, tz)}</p>
          {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {providers.length ? "No appointments on this day." : "Add a doctor and their working hours to start taking bookings."}
            </div>
          ) : (
            <div className="divide-y rounded-xl border">
              {rows.map((a) => {
                const p = byId[a.providerId];
                const stt = STATUS[a.status] || STATUS.booked;
                return (
                  <div key={a.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
                    <span className="flex w-24 items-center gap-1.5 text-sm font-semibold tabular-nums"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{fmtTime(a.startAt, tz)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.patientName || "Patient"} <span className="font-normal text-muted-foreground">· +{a.phone}</span></p>
                      <p className="truncate text-xs text-muted-foreground">{p?.name || "Doctor"}{a.reason ? ` · ${a.reason}` : ""} · {a.ref}{a.source === "manual" ? " · added by staff" : ""}</p>
                    </div>
                    <span className={`w-fit rounded-md px-2 py-0.5 text-xs font-medium ${stt.cls}`}>{stt.label}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => update.mutate({ id: a.id, status: "confirmed" })}><Check className="mr-2 h-4 w-4" />Confirm</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => update.mutate({ id: a.id, status: "completed" })}><Check className="mr-2 h-4 w-4" />Mark completed</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => update.mutate({ id: a.id, status: "no_show" })}><UserX className="mr-2 h-4 w-4" />Mark no-show</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMoving(a)}><CalendarDays className="mr-2 h-4 w-4" />Reschedule</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => confirm(`Cancel ${a.ref}? The patient will be told on WhatsApp.`) && update.mutate({ id: a.id, status: "cancelled" })}><X className="mr-2 h-4 w-4" />Cancel</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {adding && <BookDialog channelId={channelId} tz={tz} providers={providers} initialDate={date} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
      {moving && <BookDialog channelId={channelId} tz={tz} providers={providers} initialDate={date} existing={moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); refresh(); }} />}
    </div>
  );
}

function BookDialog({ channelId, tz, providers, initialDate, existing, onClose, onDone }: { channelId: string; tz: string; providers: any[]; initialDate: string; existing?: any; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [providerId, setProviderId] = useState(existing?.providerId || providers.find((p) => p.isActive)?.id || providers[0]?.id || "");
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const slots = useQuery<any>({
    queryKey: ["/api/appointments/free-slots", channelId, providerId, date],
    enabled: !!providerId && !!date,
    queryFn: async () => (await apiRequest("GET", `/api/appointments/free-slots?channelId=${channelId}&providerId=${providerId}&date=${date}`)).json(),
  });
  const save = useMutation({
    mutationFn: async () => existing
      ? (await apiRequest("PATCH", `/api/appointments/${existing.id}`, { channelId, startAt: start, notify })).json()
      : (await apiRequest("POST", "/api/appointments", { channelId, providerId, startAt: start, phone, patientName: name, reason: reason || null, notify })).json(),
    onSuccess: (r) => {
      if (r.notifyError) toast({ title: "Saved, patient not notified", description: r.notifyError, variant: "destructive" });
      else toast({ title: existing ? "Appointment moved" : "Appointment booked" });
      onDone();
    },
    onError: (e: Error) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });
  const free: any[] = slots.data?.data || [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? `Reschedule ${existing.ref}` : "New appointment"}</DialogTitle>
          <DialogDescription>{existing ? `${existing.patientName || "Patient"} · +${existing.phone}` : "For walk-ins and phone bookings."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!existing && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Doctor</Label>
              <Select value={providerId} onValueChange={(v) => { setProviderId(v); setStart(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.specialty ? ` · ${p.specialty}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setStart(""); }} /></div>
          <div className="space-y-1.5">
            <Label>Time</Label>
            <Select value={start} onValueChange={setStart} disabled={!free.length}>
              <SelectTrigger><SelectValue placeholder={slots.isLoading ? "Loading…" : free.length ? "Pick a time" : "No free slots"} /></SelectTrigger>
              <SelectContent>{free.map((x) => <SelectItem key={x.start} value={x.start}>{fmtTime(x.start, tz)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!existing && (
            <>
              <div className="space-y-1.5"><Label>Patient name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>WhatsApp number</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Reason (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={notify} onCheckedChange={setNotify} />Send the details to the patient on WhatsApp</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!start || (!existing && (!name || !phone)) || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{existing ? "Move appointment" : "Book appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Doctors ───────────── */

function hoursSummary(h: WeeklyHours) {
  const on = ORDER.filter((d) => (h?.[d] || []).length);
  if (!on.length) return "No working hours set";
  return on.map((d) => `${DAY_LABEL[d].slice(0, 3)} ${(h[d] || []).map(([a, b]) => `${a}–${b}`).join(", ")}`).join(" · ");
}

function DoctorsTab({ channelId, rows, loading }: { channelId: string; rows: any[]; loading: boolean }) {
  const { toast } = useToast();
  const [edit, setEdit] = useState<any>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/appointments/providers", channelId] });
  const del = useMutation({
    mutationFn: async (p: any) => { const r = await apiRequest("DELETE", `/api/appointments/providers/${p.id}?channelId=${channelId}`); return r.json(); },
    onSuccess: () => { refresh(); toast({ title: "Doctor removed" }); },
    onError: (e: Error) => toast({ title: "Cannot remove", description: e.message, variant: "destructive" }),
  });
  const blank = { name: "", specialty: "", fee: "", slotMinutes: 15, isActive: true, daysOff: [], weeklyHours: { mon: [["10:00", "13:00"], ["17:00", "20:00"]], tue: [["10:00", "13:00"], ["17:00", "20:00"]], wed: [["10:00", "13:00"], ["17:00", "20:00"]], thu: [["10:00", "13:00"], ["17:00", "20:00"]], fri: [["10:00", "13:00"], ["17:00", "20:00"]], sat: [["10:00", "13:00"]] } };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEdit(blank)}><Plus className="mr-1.5 h-4 w-4" />Add doctor</Button></div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
        <Card className="rounded-2xl border-dashed"><CardContent className="text-center text-sm text-muted-foreground">Add your first doctor with their working hours and slot length.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((p) => (
            <Card key={p.id} className={`rounded-2xl ${p.isActive ? "" : "opacity-60"}`}>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-100 font-semibold text-sky-700">{p.name.replace(/^dr\.?\s*/i, "").slice(0, 1).toUpperCase()}</span>
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-sm text-muted-foreground">{[p.specialty, p.fee != null ? `₹${Number(p.fee).toLocaleString("en-IN")}` : null, `${p.slotMinutes} min slots`].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <div className="flex">
                    <Button size="icon" variant="ghost" onClick={() => setEdit({ ...p, fee: p.fee ?? "" })} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm(`Remove ${p.name}?`) && del.mutate(p)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{hoursSummary(p.weeklyHours)}</p>
                {!!(p.daysOff || []).length && <div className="flex flex-wrap gap-1">{p.daysOff.slice(0, 6).map((d: string) => <Badge key={d} variant="outline" className="text-[10px]">Off {d}</Badge>)}</div>}
                {!p.isActive && <Badge variant="secondary">Not taking bookings</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {edit && <DoctorDialog channelId={channelId} doc={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
    </div>
  );
}

function DoctorDialog({ channelId, doc, onClose, onSaved }: { channelId: string; doc: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<any>({ ...doc, weeklyHours: JSON.parse(JSON.stringify(doc.weeklyHours || {})), daysOff: [...(doc.daysOff || [])] });
  const [off, setOff] = useState("");
  const setDay = (d: string, ranges: any[]) => setF((x: any) => ({ ...x, weeklyHours: { ...x.weeklyHours, [d]: ranges } }));
  const save = useMutation({
    mutationFn: async () => {
      const weeklyHours = Object.fromEntries(Object.entries(f.weeklyHours).filter(([, v]: any) => Array.isArray(v) && v.length));
      const body = { channelId, name: f.name, specialty: f.specialty || null, fee: f.fee === "" ? null : Number(f.fee), slotMinutes: Number(f.slotMinutes), weeklyHours, daysOff: f.daysOff, isActive: f.isActive };
      return (await apiRequest(doc.id ? "PUT" : "POST", doc.id ? `/api/appointments/providers/${doc.id}` : "/api/appointments/providers", body)).json();
    },
    onSuccess: () => { toast({ title: doc.id ? "Doctor updated" : "Doctor added" }); onSaved(); },
    onError: (e: Error) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{doc.id ? "Edit doctor" : "Add doctor"}</DialogTitle><DialogDescription>Patients only see free slots inside these hours.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Dr. Anjali Mehta" /></div>
          <div className="space-y-1.5"><Label>Speciality</Label><Input value={f.specialty || ""} onChange={(e) => setF({ ...f, specialty: e.target.value })} placeholder="Dentist" /></div>
          <div className="space-y-1.5"><Label>Consultation fee (₹, optional)</Label><Input type="number" min={0} value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Slot length</Label>
            <Select value={String(f.slotMinutes)} onValueChange={(v) => setF({ ...f, slotMinutes: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 15, 20, 30, 45, 60, 90].map((m) => <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Weekly hours</Label>
          <div className="divide-y rounded-xl border">
            {ORDER.map((d) => {
              const ranges: any[] = f.weeklyHours[d] || [];
              return (
                <div key={d} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                  <label className="flex w-36 shrink-0 items-center gap-2 pt-1.5 text-sm">
                    <Switch checked={ranges.length > 0} onCheckedChange={(v) => setDay(d, v ? [["10:00", "13:00"]] : [])} />{DAY_LABEL[d]}
                  </label>
                  <div className="flex-1 space-y-2">
                    {ranges.length === 0 ? <p className="pt-1.5 text-sm text-muted-foreground">Closed</p> : ranges.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input type="time" value={r[0]} onChange={(e) => { const n = [...ranges]; n[i] = [e.target.value, r[1]]; setDay(d, n); }} className="w-32" />
                        <span className="text-muted-foreground">to</span>
                        <Input type="time" value={r[1]} onChange={(e) => { const n = [...ranges]; n[i] = [r[0], e.target.value]; setDay(d, n); }} className="w-32" />
                        <Button size="icon" variant="ghost" onClick={() => setDay(d, ranges.filter((_, j) => j !== i))} aria-label="Remove hours"><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    {ranges.length > 0 && ranges.length < 4 && <button type="button" className="text-xs font-medium text-sky-700" onClick={() => setDay(d, [...ranges, ["17:00", "20:00"]])}>+ Add another session</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Days off / leave</Label>
          <div className="flex gap-2"><Input type="date" value={off} onChange={(e) => setOff(e.target.value)} className="w-44" /><Button variant="outline" disabled={!off} onClick={() => { if (!f.daysOff.includes(off)) setF({ ...f, daysOff: [...f.daysOff, off].sort() }); setOff(""); }}>Add</Button></div>
          <div className="flex flex-wrap gap-1.5">{f.daysOff.map((d: string) => <button key={d} type="button" onClick={() => setF({ ...f, daysOff: f.daysOff.filter((x: string) => x !== d) })} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">{d}<X className="h-3 w-3" /></button>)}</div>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />Taking bookings</label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!f.name || save.isPending} onClick={() => save.mutate()}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save doctor</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Settings ───────────── */

function SettingsTab({ channelId, data }: { channelId: string; data: any }) {
  const { toast } = useToast();
  const d = data.data;
  const [f, setF] = useState<any>({ ...d, keywords: (d.keywords || []).join(", "), reminderTemplate: d.reminderTemplate || "" });
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/appointments/settings", {
      channelId, enabled: f.enabled, businessName: f.businessName, providerLabel: f.providerLabel,
      keywords: String(f.keywords).split(",").map((k: string) => k.trim()).filter(Boolean), welcomeText: f.welcomeText, timezone: f.timezone,
      bookingWindowDays: f.bookingWindowDays, minNoticeMinutes: f.minNoticeMinutes, askReason: f.askReason, reminderMinutes: f.reminderMinutes,
      reminderTemplate: f.reminderTemplate || null, reminderTemplateLang: (data.templates || []).find((t: any) => t.name === f.reminderTemplate)?.language || "en_US",
    })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/appointments/settings", channelId] }); toast({ title: "Settings saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-base sm:text-base">Booking</CardTitle><CardDescription>What patients see on WhatsApp.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between rounded-xl border p-3"><span><span className="font-medium">Online booking is on</span><span className="block text-xs text-muted-foreground">Runs before the store, automations and AI.</span></span><Switch checked={f.enabled} onCheckedChange={(v) => set("enabled", v)} /></label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Clinic / business name</Label><Input value={f.businessName} onChange={(e) => set("businessName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Call them</Label><Input value={f.providerLabel} onChange={(e) => set("providerLabel", e.target.value)} placeholder="Doctor" /></div>
          </div>
          <div className="space-y-1.5"><Label>Words that start booking</Label><Input value={f.keywords} onChange={(e) => set("keywords", e.target.value)} /><p className="text-xs text-muted-foreground">Comma separated. Patients can also type “my appointment”.</p></div>
          <div className="space-y-1.5"><Label>Welcome message</Label><Textarea rows={2} value={f.welcomeText} onChange={(e) => set("welcomeText", e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.askReason} onCheckedChange={(v) => set("askReason", v)} />Ask patient name and reason before confirming</label>
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-base sm:text-base">Timing & reminders</CardTitle><CardDescription>Slots are shown in this timezone.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={f.timezone} onValueChange={(v) => set("timezone", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[...new Set([f.timezone, ...TIMEZONES])].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Book up to (days ahead)</Label><Input type="number" min={1} max={60} value={f.bookingWindowDays} onChange={(e) => set("bookingWindowDays", Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Minimum notice (minutes)</Label><Input type="number" min={0} value={f.minNoticeMinutes} onChange={(e) => set("minNoticeMinutes", Number(e.target.value))} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Reminder before visit</Label>
            <Select value={String(f.reminderMinutes)} onValueChange={(v) => set("reminderMinutes", Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[[0, "No reminder"], [60, "1 hour before"], [120, "2 hours before"], [240, "4 hours before"], [720, "12 hours before"], [1440, "1 day before"]].map(([v, l]) => <SelectItem key={v} value={String(v)}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reminder template (recommended)</Label>
            <Select value={f.reminderTemplate || "__none"} onValueChange={(v) => set("reminderTemplate", v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Normal message (only if patient chatted in last 24h)</SelectItem>
                {(data.templates || []).map((t: any) => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Use an approved utility template with 3 variables: {"{{1}}"} patient name, {"{{2}}"} doctor, {"{{3}}"} date & time. Templates reach patients any time.</p>
          </div>
          <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save settings</Button>
        </CardContent>
      </Card>
    </div>
  );
}
