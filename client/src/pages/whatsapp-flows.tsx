/**
 * WhatsApp Flows — list Flows on the WABA, preview them, and send one as an
 * interactive message (24h window). For business-initiated sends, attach the
 * Flow to a template via a "WhatsApp Flow" button in Templates.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Eye, Loader2, RefreshCw, Send, Workflow } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useChannelContext } from "@/contexts/channel-context";

type Flow = { id: string; name: string; status: string; categories?: string[] };

const STATUS_STYLE: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  DRAFT: "bg-amber-100 text-amber-800",
  DEPRECATED: "bg-gray-200 text-gray-700",
  BLOCKED: "bg-red-100 text-red-800",
  THROTTLED: "bg-orange-100 text-orange-800",
};

export default function WhatsAppFlowsPage() {
  const { selectedChannel } = useChannelContext() as any;
  const channelId: string | undefined = selectedChannel?.id;
  const wabaId: string | undefined = selectedChannel?.whatsappBusinessAccountId;
  const { toast } = useToast();

  const flows = useQuery<Flow[]>({
    queryKey: ["/api/whatsapp/flows", channelId],
    enabled: !!channelId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/whatsapp/flows?channelId=${channelId}`);
      return (await res.json()).data || [];
    },
  });

  const [flowId, setFlowId] = useState("");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("Please fill this short form.");
  const [cta, setCta] = useState("Open form");
  const [screen, setScreen] = useState("");
  const [draft, setDraft] = useState(false);

  const details = useQuery<any>({
    queryKey: ["/api/whatsapp/flows", channelId, flowId],
    enabled: !!channelId && !!flowId,
    queryFn: async () => (await apiRequest("GET", `/api/whatsapp/flows/${flowId}?channelId=${channelId}`)).json(),
  });

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/whatsapp/flows/send", { channelId, to, flowId, cta, body, screen: screen || undefined, draft });
      return res.json();
    },
    onSuccess: () => toast({ title: "Flow sent", description: "Replies appear in Inbox as a Flow response." }),
    onError: (e: Error) => toast({ title: "Send failed", description: e.message, variant: "destructive" }),
  });

  const managerUrl = `https://business.facebook.com/wa/manage/flows/${wabaId ? `?waba_id=${wabaId}` : ""}`;
  const list = flows.data || [];
  const selected = list.find((f) => f.id === flowId);

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="WhatsApp Flows" subtitle="Forms inside WhatsApp: lead capture, bookings, surveys" />
      <main className="p-4 sm:p-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Workflow className="w-5 h-5" /> How Flows work</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm">
              <li>Build the form in <b>WhatsApp Manager → Account tools → Flows</b> (drag-and-drop or a ready template like “Sign up” or “Book appointment”).</li>
              <li><b>Publish</b> it. Draft flows can only be test-sent from this page with “Test draft” on.</li>
              <li>To message anyone at any time: in <b>Templates → Create</b>, add a button of type <b>WhatsApp Flow</b> and pick the Flow. After Meta approves it, use the template in Campaigns, API or Automations. HoverChat adds the flow token automatically.</li>
              <li>To send in a live chat (customer messaged in the last 24h): use the form below.</li>
              <li>Customer answers come back to the Inbox as a Flow response (all fields as JSON).</li>
            </ol>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <a href={managerUrl} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-2" /> Open Flows in WhatsApp Manager</a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Your Flows</CardTitle>
              <CardDescription>Pulled live from Meta for this number's WhatsApp Business Account.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => flows.refetch()} disabled={flows.isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${flows.isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {!channelId ? (
              <p className="text-sm text-muted-foreground">Select a WhatsApp number first.</p>
            ) : flows.isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : flows.error ? (
              <p className="text-sm text-destructive">{(flows.error as Error).message}</p>
            ) : list.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Flows yet. Create one in WhatsApp Manager, then click Refresh.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Category</TableHead><TableHead>ID</TableHead><TableHead /></TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell><span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLE[f.status] || "bg-muted"}`}>{f.status}</span></TableCell>
                      <TableCell className="text-xs">{(f.categories || []).join(", ") || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{f.id}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setFlowId(f.id); setScreen(""); setDraft(f.status !== "PUBLISHED"); }}>Use</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Send className="w-4 h-4" /> Send a Flow (live chat / test)</CardTitle>
            <CardDescription>Works only if this customer messaged you in the last 24 hours. Otherwise use a template with a Flow button.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Flow</Label>
              <Select value={flowId} onValueChange={(v) => { setFlowId(v); setScreen(""); const f = list.find((x) => x.id === v); setDraft(!!f && f.status !== "PUBLISHED"); }}>
                <SelectTrigger><SelectValue placeholder="Select a Flow" /></SelectTrigger>
                <SelectContent>
                  {list.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} ({f.status})</SelectItem>)}
                </SelectContent>
              </Select>
              {details.data?.previewUrl && (
                <a href={details.data.previewUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 mt-1">
                  <Eye className="w-3 h-3" /> Preview
                </a>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Customer WhatsApp number</Label>
              <Input placeholder="919876543210" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Message</Label>
              <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1024} />
            </div>
            <div className="space-y-1.5">
              <Label>Button text (max 20)</Label>
              <Input value={cta} maxLength={20} onChange={(e) => setCta(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>First screen (optional)</Label>
              <Select value={screen || "__default"} onValueChange={(v) => setScreen(v === "__default" ? "" : v)} disabled={!details.data?.screens?.length}>
                <SelectTrigger><SelectValue placeholder="Flow default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default">Flow default</SelectItem>
                  {(details.data?.screens || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.title ? `${s.title} (${s.id})` : s.id}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={draft} onCheckedChange={setDraft} id="draft" />
              <Label htmlFor="draft">Test draft version</Label>
              {selected && selected.status !== "PUBLISHED" && <Badge variant="outline">Not published</Badge>}
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={() => send.mutate()} disabled={send.isPending || !flowId || !to || !body}>
                {send.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />} Send Flow
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
