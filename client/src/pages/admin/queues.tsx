/** Super admin: health of the message queue (campaigns) and background jobs (emails, onboarding). */
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, RotateCcw, Server } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const ENGINE: Record<string, { label: string; tone: "ok" | "warn" | "bad"; hint: string }> = {
  bullmq: { label: "BullMQ (Redis)", tone: "ok", hint: "Campaign messages are queued in Redis and sent at a steady rate." },
  "bullmq-no-worker": { label: "Redis up, no worker", tone: "bad", hint: "Messages are queued in Redis but no worker is consuming them. Restart the app (pm2 restart all)." },
  "db-polling": { label: "DB polling (fallback)", tone: "warn", hint: "Redis isn't reachable, so messages are picked from the database every few seconds. Set REDIS_URL and start Redis for queueing." },
};
const TONE = { ok: "bg-emerald-50 text-emerald-800 ring-emerald-200", warn: "bg-amber-50 text-amber-900 ring-amber-200", bad: "bg-red-50 text-red-800 ring-red-200" };

function Stat({ label, value, tone }: { label: string; value: any; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}

export default function QueuesPage() {
  const { toast } = useToast();
  const q = useQuery<any>({ queryKey: ["/api/admin/queues"], queryFn: async () => (await apiRequest("GET", "/api/admin/queues")).json(), refetchInterval: 5000 });
  const retry = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/queues/retry-failed", {})).json(),
    onSuccess: (r: any) => { toast({ title: `${r.retried} job(s) retried` }); q.refetch(); },
    onError: (e: Error) => toast({ title: "Retry failed", description: e.message, variant: "destructive" }),
  });
  const requeue = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/queues/requeue-messages", {})).json(),
    onSuccess: (r: any) => { toast({ title: `${r.requeued} message(s) pushed to the queue` }); q.refetch(); },
    onError: (e: Error) => toast({ title: "Couldn't requeue", description: e.message, variant: "destructive" }),
  });
  const d = q.data;
  const eng = d ? ENGINE[d.engine] || ENGINE["db-polling"] : null;
  const m = d?.messages || {};
  const b = m.bullmq || {};
  const queues = Object.entries(d?.jobs?.queues || {}) as Array<[string, any]>;

  return (
    <div className="flex-1 min-h-screen dots-bg">
      <Header title="Queues & background jobs" subtitle="Campaign sending, emails and onboarding messages" />
      <main className="mx-auto w-full max-w-[1300px] space-y-6 p-4 sm:p-6">
        {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : !d ? <p className="text-sm text-destructive">{(q.error as Error)?.message}</p> : (
          <>
            <div className={`flex flex-col gap-3 rounded-2xl p-4 ring-1 sm:flex-row sm:items-center ${TONE[eng!.tone]}`}>
              {eng!.tone === "ok" ? <CheckCircle2 className="h-6 w-6 shrink-0" /> : <AlertTriangle className="h-6 w-6 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Message engine: {eng!.label}{d.messageWorkers ? ` · ${d.messageWorkers} worker${d.messageWorkers > 1 ? "s" : ""}` : ""}</p>
                <p className="text-sm opacity-90">{eng!.hint}{!d.redisUrlSet && " REDIS_URL is not set in .env."}</p>
              </div>
              <Button variant="outline" size="sm" className="bg-white" onClick={() => q.refetch()}><RefreshCw className={`mr-2 h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />Refresh</Button>
            </div>

            <Card className="rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base sm:text-base">Campaign messages</CardTitle>
                {d.stuckQueued > 0 && d.engine === "bullmq" && (
                  <Button size="sm" variant="outline" onClick={() => requeue.mutate()} disabled={requeue.isPending}>{requeue.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Push {d.stuckQueued} waiting to queue</Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Queued (DB)" value={m.queued ?? 0} />
                  <Stat label="Waiting > 10 min" value={d.stuckQueued} tone={d.stuckQueued ? "warn" : undefined} />
                  <Stat label="Processing" value={m.processing ?? 0} />
                  <Stat label="Sent" value={m.sent ?? 0} />
                  <Stat label="Delivered" value={m.delivered ?? 0} />
                  <Stat label="Failed" value={m.failed ?? 0} tone={m.failed ? "bad" : undefined} />
                </div>
                {m.bullmq && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <Stat label="Redis · waiting" value={b.waiting} />
                    <Stat label="Redis · active" value={b.active} />
                    <Stat label="Redis · scheduled" value={b.delayed} />
                    <Stat label="Redis · done (recent)" value={b.completed} />
                    <Stat label="Redis · failed" value={b.failed} tone={b.failed ? "bad" : undefined} />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Speed: {d.limits.messages.concurrency} at a time, max {d.limits.messages.perSecond}/sec (BULLMQ_CONCURRENCY, BULLMQ_RATE_MAX). Scheduled campaigns start on time and are released at this pace.</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base sm:text-base">Background jobs</CardTitle>
                <Button size="sm" variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending || !d.failed?.length}>{retry.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Retry failed</Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  {queues.map(([name, c]) => (
                    <div key={name} className="rounded-xl border p-4">
                      <div className="flex items-center justify-between">
                        <p className="flex items-center gap-2 text-sm font-medium"><Server className="h-4 w-4" />{name === "hc-email" ? "Emails" : "Other jobs"} <code className="text-xs text-muted-foreground">{name}</code></p>
                        {c ? <span className={`rounded-full px-2 py-0.5 text-xs ${c.workers ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{c.workers ? `${c.workers} worker${c.workers > 1 ? "s" : ""}` : "no worker"}</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">in-process</span>}
                      </div>
                      {c ? (
                        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-sm">
                          {[["Waiting", (c.waiting || 0) + (c.prioritized || 0)], ["Active", c.active], ["Done", c.completed], ["Failed", c.failed]].map(([l, v]) => <div key={l as string}><p className="font-semibold tabular-nums">{v ?? 0}</p><p className="text-[11px] text-muted-foreground">{l}</p></div>)}
                        </div>
                      ) : <p className="mt-2 text-xs text-muted-foreground">Running inside the app without Redis (not kept across restarts).</p>}
                    </div>
                  ))}
                </div>
                {!d.jobs.redis && (
                  <p className="text-xs text-muted-foreground">In-process: {d.jobs.inProcess.pending} waiting · {d.jobs.inProcess.running} running · {d.jobs.inProcess.done} done · {d.jobs.inProcess.failed} failed (this app instance).</p>
                )}
                {d.failed?.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium">Job</th><th className="px-3 py-2 font-medium">Error</th><th className="px-3 py-2 font-medium">Tries</th><th className="px-3 py-2 font-medium">When</th></tr></thead>
                      <tbody className="divide-y">{d.failed.map((f: any) => (
                        <tr key={`${f.queue}-${f.id}`}><td className="px-3 py-2 font-mono text-xs">{f.name}</td><td className="max-w-[420px] truncate px-3 py-2 text-xs text-red-700" title={f.error}>{f.error}</td><td className="px-3 py-2 text-xs">{f.attempts}</td><td className="px-3 py-2 text-xs text-muted-foreground">{f.at ? new Date(f.at).toLocaleString() : ""}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Emails: {d.limits.email.concurrency} at a time, max {d.limits.email.perSecond}/sec (EMAIL_CONCURRENCY, EMAIL_RATE_PER_SEC). Other jobs: {d.limits.jobs.concurrency} at a time, {d.limits.jobs.perSecond}/sec.</p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
