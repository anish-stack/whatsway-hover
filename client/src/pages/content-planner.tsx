import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { CalendarDays, Facebook, Instagram, Loader2, Plus, RefreshCw, Unplug, Users } from "lucide-react";
import { PlannerCalendar } from "@/components/social/PlannerCalendar";
import { j, useSocialAccounts } from "@/components/social/planner-shared";

export default function ContentPlannerPage() {
  const { toast } = useToast();
  const initialTab = new URLSearchParams(window.location.search).get("tab") || "all";
  const [tab, setTab] = useState(initialTab);
  const acc = useSocialAccounts();
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("fbConnected")) toast({ title: `${p.get("fbConnected")} Facebook Page(s) connected` });
    if (p.get("fbSkipped")) toast({ title: `${p.get("fbSkipped")} Page(s) not added`, description: "Your plan's Facebook Page limit is reached. Remove a Page or upgrade to add more.", variant: "destructive" });
    if (p.get("error")) toast({ title: "Facebook not connected", description: p.get("error")!, variant: "destructive" });
    if (p.get("fbConnected") || p.get("error") || p.get("tab")) window.history.replaceState({}, "", "/content-planner");
  }, [toast]);
  const none = !acc.isLoading && !(acc.data?.instagram?.length || acc.data?.facebook?.length);

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Content Planner" subtitle="Plan, schedule and auto-publish to Instagram and Facebook" />
      <main className="mx-auto w-full max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
        {none && tab !== "accounts" && (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-5">
              <p className="text-sm">Connect an Instagram account or a Facebook Page to start scheduling.</p>
              <Button onClick={() => setTab("accounts")}><Plus className="mr-1.5 h-4 w-4" />Connect accounts</Button>
            </CardContent>
          </Card>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all"><CalendarDays className="mr-1.5 h-4 w-4" />All channels</TabsTrigger>
            <TabsTrigger value="instagram"><Instagram className="mr-1.5 h-4 w-4 text-pink-600" />Instagram</TabsTrigger>
            <TabsTrigger value="facebook"><Facebook className="mr-1.5 h-4 w-4 text-[#1877F2]" />Facebook</TabsTrigger>
            <TabsTrigger value="accounts"><Users className="mr-1.5 h-4 w-4" />Accounts</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4"><PlannerCalendar platform="all" /></TabsContent>
          <TabsContent value="instagram" className="mt-4"><PlannerCalendar platform="instagram" /></TabsContent>
          <TabsContent value="facebook" className="mt-4"><PlannerCalendar platform="facebook" /></TabsContent>
          <TabsContent value="accounts" className="mt-4"><Accounts /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Accounts() {
  const { toast } = useToast();
  const acc = useSocialAccounts();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/social/accounts"] });
  const connectFb = useMutation({
    mutationFn: () => j("GET", "/api/social/facebook/connect"),
    onSuccess: (r: any) => { window.location.href = r.url; },
    onError: (e: any) => toast({ title: "Can't connect Facebook yet", description: e?.message, variant: "destructive" }),
  });
  const connectIg = useMutation({
    mutationFn: () => j("GET", "/api/instagram/connect"),
    onSuccess: (r: any) => { window.location.href = r.url; },
    onError: (e: any) => toast({ title: "Can't connect Instagram yet", description: e?.message, variant: "destructive" }),
  });
  const syncFb = useMutation({ mutationFn: (id: string) => j("POST", `/api/social/facebook/pages/${id}/sync`), onSuccess: () => { refresh(); toast({ title: "Page refreshed" }); }, onError: (e: any) => toast({ title: "Refresh failed", description: e?.message, variant: "destructive" }) });
  const dropFb = useMutation({ mutationFn: (id: string) => j("DELETE", `/api/social/facebook/pages/${id}`), onSuccess: () => { refresh(); toast({ title: "Page disconnected" }); } });
  const dropIg = useMutation({ mutationFn: (id: string) => j("DELETE", `/api/instagram/accounts/${id}`), onSuccess: () => { refresh(); toast({ title: "Instagram disconnected" }); } });
  if (acc.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  const igs = acc.data?.instagram || [], fbs = acc.data?.facebook || [];
  // plan limit text: "2 of 3 on your plan" (limit 0 / no plan → "Not in your plan")
  const capText = (l: any, used: number) => {
    if (!l) return null;
    if (l.limit === "unlimited") return `${used} connected · unlimited on your plan`;
    if (l.reason === "NO_SUBSCRIPTION" || l.reason === "EXPIRED") return "Needs an active plan";
    if (!Number(l.limit) && l.reason === "NOT_IN_PLAN") return "Not included in your plan";
    return `${used} of ${l.limit} on your plan`;
  };
  const capFull = (l: any, used: number) => !!l && l.limit !== "unlimited" && used >= Number(l.limit || 0);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Instagram className="h-5 w-5 text-pink-600" />Instagram accounts</CardTitle>
            <CardDescription className="mt-1">Business or Creator accounts.{capText(acc.data?.limits?.instagram, igs.length) && <span className={`ml-1 ${capFull(acc.data?.limits?.instagram, igs.length) ? "text-amber-700" : ""}`}>{capText(acc.data?.limits?.instagram, igs.length)}</span>}</CardDescription>
          </div>
          <Button size="sm" onClick={() => connectIg.mutate()} disabled={connectIg.isPending} title={capFull(acc.data?.limits?.instagram, igs.length) ? "Plan limit reached — upgrade to add more" : undefined}><Plus className="mr-1 h-4 w-4" />Connect</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {igs.length === 0 ? <p className="text-sm text-muted-foreground">No Instagram accounts yet.</p> : igs.map((a: any) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
              {a.profilePic ? <img src={a.profilePic} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Instagram className="h-4 w-4" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">@{a.username}</p>
                <p className="text-xs text-muted-foreground">{a.followers != null ? `${a.followers.toLocaleString()} followers` : a.accountType}{a.status !== "active" && <span className="ml-2 text-destructive">Connection expired</span>}</p>
              </div>
              {a.status !== "active" && <Button size="sm" variant="outline" onClick={() => connectIg.mutate()}>Reconnect</Button>}
              <a href="/instagram" className="text-sm text-[var(--brand)] hover:underline">Manage</a>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Disconnect @${a.username}`} onClick={() => confirm(`Disconnect @${a.username}? Scheduled posts to it will fail.`) && dropIg.mutate(a.id)}><Unplug className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Facebook className="h-5 w-5 text-[#1877F2]" />Facebook Pages</CardTitle>
            <CardDescription className="mt-1">Log in with Facebook and tick the Pages you want to post to.{capText(acc.data?.limits?.facebook, fbs.length) && <span className={`ml-1 ${capFull(acc.data?.limits?.facebook, fbs.length) ? "text-amber-700" : ""}`}>{capText(acc.data?.limits?.facebook, fbs.length)}</span>}</CardDescription>
          </div>
          <Button size="sm" onClick={() => connectFb.mutate()} disabled={connectFb.isPending || !acc.data?.fbConfigured}><Plus className="mr-1 h-4 w-4" />{fbs.length ? "Add Pages" : "Connect"}</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!acc.data?.fbConfigured && <p className="text-sm text-amber-700">Facebook isn't switched on for this platform yet. Ask your admin to add the Facebook app in Instagram & Ads apps.</p>}
          {fbs.length === 0 ? <p className="text-sm text-muted-foreground">No Pages yet.</p> : fbs.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
              {p.picture ? <img src={p.picture} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Facebook className="h-4 w-4" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{[p.category, p.followers != null ? `${p.followers.toLocaleString()} followers` : null].filter(Boolean).join(" · ")}{p.status !== "active" && <span className="ml-2 text-destructive">Connection expired</span>}</p>
              </div>
              {p.status !== "active" && <Button size="sm" variant="outline" onClick={() => connectFb.mutate()}>Reconnect</Button>}
              <Button size="icon" variant="ghost" aria-label={`Refresh ${p.name}`} onClick={() => syncFb.mutate(p.id)}><RefreshCw className={`h-4 w-4 ${syncFb.isPending && syncFb.variables === p.id ? "animate-spin" : ""}`} /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Disconnect ${p.name}`} onClick={() => confirm(`Disconnect ${p.name}? Scheduled posts to it will fail.`) && dropFb.mutate(p.id)}><Unplug className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
