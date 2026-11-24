/** Super admin: demo requests submitted from the website's "Book a Demo" form. */
import { Fragment, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Mail, MessageCircle, Phone, RefreshCw } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const STATUSES = ["new", "contacted", "scheduled", "closed"] as const;
const TONE: Record<string, string> = {
  new: "bg-sky-100 text-sky-800", contacted: "bg-amber-100 text-amber-800", scheduled: "bg-emerald-100 text-emerald-800", closed: "bg-slate-200 text-slate-700",
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function DemoRequestsPage() {
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<any>(null);
  const q = useQuery<any>({
    queryKey: ["/api/admin/demo-requests", status],
    queryFn: async () => (await apiRequest("GET", `/api/admin/demo-requests?status=${status}`)).json(),
    refetchInterval: 30000,
  });
  const rows: any[] = q.data?.data || [];
  const c = q.data?.counts || {};
  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Demo Requests" subtitle="People who asked for a demo from the website" />
      <main className="space-y-6 p-4 sm:p-6">
        <div className="grid grid-cols-3 gap-3">
          {[{ l: "New", v: c.new ?? 0 }, { l: "Last 7 days", v: c.week ?? 0 }, { l: "All time", v: c.total ?? 0 }].map((k) => (
            <Card key={k.l} className="rounded-2xl"><CardContent><p className="text-xs text-muted-foreground">{k.l}</p><p className="mt-1 text-2xl font-bold tabular-nums">{k.v}</p></CardContent></Card>
          ))}
        </div>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base sm:text-base">Requests</CardTitle>
            <div className="flex gap-2">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{cap(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="icon" variant="outline" onClick={() => q.refetch()} aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /></Button>
            </div>
          </CardHeader>
          <CardContent>
            {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No demo requests yet. They appear here when someone uses “Book a Demo” on the website.</div>
            ) : (
              <div className="divide-y rounded-xl border">
                {rows.map((r) => (
                  <button key={r.id} onClick={() => setOpen(r)} className="flex w-full flex-col gap-1 p-3 text-left hover:bg-muted/50 md:flex-row md:items-center md:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}{r.company ? <span className="font-normal text-muted-foreground"> · {r.company}</span> : null}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.email} · {r.phone}{r.businessType ? ` · ${r.businessType}` : ""}</p>
                    </div>
                    <span className="text-xs text-muted-foreground md:w-44">{r.preferredTime || "Any time"}</span>
                    <span className={`w-fit rounded-md px-2 py-0.5 text-xs font-medium ${TONE[r.status]}`}>{cap(r.status)}</span>
                    <span className="text-xs text-muted-foreground md:w-36">{new Date(r.createdAt).toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      {open && <DetailSheet r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DetailSheet({ r, onClose }: { r: any; onClose: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(r.status);
  const [notes, setNotes] = useState(r.notes || "");
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PATCH", `/api/admin/demo-requests/${r.id}`, { status, notes })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/demo-requests"] }); toast({ title: "Saved" }); onClose(); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const wa = String(r.phone).replace(/\D/g, "");
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>{r.name}</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-5 text-sm">
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><a href={`tel:${r.phone}`}><Phone className="mr-1.5 h-3.5 w-3.5" />Call</a></Button>
            <Button asChild size="sm" variant="outline"><a href={`https://wa.me/${wa.length === 10 ? `91${wa}` : wa}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-3.5 w-3.5" />WhatsApp</a></Button>
            <Button asChild size="sm" variant="outline"><a href={`mailto:${r.email}?subject=${encodeURIComponent("Your demo")}`}><Mail className="mr-1.5 h-3.5 w-3.5" />Email</a></Button>
          </div>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
            {[["Email", r.email], ["Phone", r.phone], ["Company", r.company], ["Business", r.businessType], ["Team", r.teamSize], ["Best time", r.preferredTime], ["Page", r.source], ["Received", new Date(r.createdAt).toLocaleString()]]
              .filter(([, v]) => v).map(([k, v]) => (<Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="col-span-2 break-words">{v}</dd></Fragment>))}
          </dl>
          {r.message && <p className="whitespace-pre-wrap rounded-lg bg-muted p-3">{r.message}</p>}
          <div className="space-y-1.5">
            <p className="font-medium">Status</p>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{cap(s)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><p className="font-medium">Notes</p><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Call summary, demo date…" /></div>
          <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
