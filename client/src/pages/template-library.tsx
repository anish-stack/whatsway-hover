/**
 * Meta Template Library — browse Meta's pre-written Utility / Authentication
 * templates and add one to the selected WhatsApp number. Library templates are
 * written by Meta, so they are usually approved instantly (no 24h review).
 */
import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { BookOpen, Check, Link as LinkIcon, Loader2, Phone, Search, ShieldCheck } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useChannelContext } from "@/contexts/channel-context";

const TOPICS = ["ACCOUNT_UPDATE", "CUSTOMER_FEEDBACK", "ORDER_MANAGEMENT", "PAYMENTS"];
const INDUSTRIES = ["E_COMMERCE", "FINANCIAL_SERVICES"];
const USECASES = [
  "ACCOUNT_CREATION_CONFIRMATION", "AUTO_PAY_REMINDER", "DELIVERY_CONFIRMATION", "DELIVERY_FAILED", "DELIVERY_UPDATE",
  "FEEDBACK_SURVEY", "FRAUD_ALERT", "LOW_BALANCE_WARNING", "ORDER_ACTION_NEEDED", "ORDER_CONFIRMATION", "ORDER_DELAY",
  "ORDER_OR_TRANSACTION_CANCEL", "ORDER_PICK_UP", "PAYMENT_ACTION_REQUIRED", "PAYMENT_CONFIRMATION", "PAYMENT_DUE_REMINDER",
  "PAYMENT_OVERDUE", "PAYMENT_REJECT_FAIL", "PAYMENT_SCHEDULED", "RECEIPT_ATTACHMENT", "RETURN_CONFIRMATION",
  "SHIPMENT_CONFIRMATION", "STATEMENT_ATTACHMENT", "STATEMENT_AVAILABLE", "TRANSACTION_ALERT",
];
const LANGS = [
  { v: "en_US", l: "English (US)" }, { v: "en_GB", l: "English (UK)" }, { v: "hi", l: "Hindi" },
  { v: "es", l: "Spanish" }, { v: "pt_BR", l: "Portuguese (BR)" }, { v: "id", l: "Indonesian" }, { v: "ar", l: "Arabic" },
];
const ALL = "__all__";
const pretty = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

type LibTemplate = {
  id: string; name: string; language: string; category: string; topic?: string; usecase?: string;
  industry?: string[]; header?: string; body: string; body_params?: string[];
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
};

function Highlight({ text }: { text: string }) {
  const parts = (text || "").split(/(\{\{[^}]+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\{/.test(p) ? <span key={i} className="text-[var(--brand)] font-medium">{p}</span> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

export default function TemplateLibraryPage() {
  const { selectedChannel } = useChannelContext();
  const channelId = selectedChannel?.id;
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState(ALL);
  const [usecase, setUsecase] = useState(ALL);
  const [industry, setIndustry] = useState(ALL);
  const [language, setLanguage] = useState("en_US");
  const [category, setCategory] = useState<"ALL" | "UTILITY" | "AUTHENTICATION">("ALL");
  const [picked, setPicked] = useState<LibTemplate | null>(null);

  const lib = useInfiniteQuery({
    queryKey: ["/api/templates/library", channelId, query, topic, usecase, industry, language],
    enabled: !!channelId,
    initialPageParam: "" as string,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({ channelId: channelId!, language, limit: "30" });
      if (query) qs.set("search", query);
      if (topic !== ALL) qs.set("topic", topic);
      if (usecase !== ALL) qs.set("usecase", usecase);
      if (industry !== ALL) qs.set("industry", industry);
      if (pageParam) qs.set("after", pageParam);
      const res = await apiRequest("GET", `/api/templates/library?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load library");
      return json as { data: LibTemplate[]; after: string | null };
    },
    getNextPageParam: (last) => last.after || undefined,
  });

  const items = useMemo(() => {
    const all = (lib.data?.pages || []).flatMap((p) => p.data);
    return category === "ALL" ? all : all.filter((t) => String(t.category).toUpperCase() === category);
  }, [lib.data, category]);

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Template Library" subtitle="Meta's ready-made templates — usually approved instantly" />
      <main className="p-4 sm:p-6 space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); }}
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search e.g. payment, delivery, otp" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button type="submit">Search</Button>
            </form>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Select value={category} onValueChange={(v) => setCategory(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  <SelectItem value="UTILITY">Utility</SelectItem>
                  <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                </SelectContent>
              </Select>
              <Select value={topic} onValueChange={setTopic}>
                <SelectTrigger><SelectValue placeholder="Topic" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All topics</SelectItem>
                  {TOPICS.map((t) => <SelectItem key={t} value={t}>{pretty(t)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={usecase} onValueChange={setUsecase}>
                <SelectTrigger><SelectValue placeholder="Use case" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All use cases</SelectItem>
                  {USECASES.map((t) => <SelectItem key={t} value={t}>{pretty(t)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger><SelectValue placeholder="Industry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All industries</SelectItem>
                  {INDUSTRIES.map((t) => <SelectItem key={t} value={t}>{pretty(t)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGS.map((l) => <SelectItem key={l.v} value={l.v}>{l.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!channelId ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Select a WhatsApp number first.</CardContent></Card>
        ) : lib.isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : lib.error ? (
          <Card><CardContent className="p-8 text-center text-destructive">{(lib.error as Error).message}</CardContent></Card>
        ) : items.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No templates match these filters.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((t) => (
              <Card key={`${t.id}-${t.name}`} className="flex flex-col">
                <CardContent className="p-4 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono text-xs text-muted-foreground break-all">{t.name}</div>
                    <Badge variant="secondary" className="shrink-0">{pretty(t.category)}</Badge>
                  </div>
                  <div className="rounded-lg bg-[#e7f8d9] dark:bg-emerald-950/40 p-3 text-sm whitespace-pre-wrap flex-1">
                    {t.header && <div className="font-semibold mb-1"><Highlight text={t.header} /></div>}
                    <Highlight text={t.body} />
                    {!!t.buttons?.length && (
                      <div className="mt-3 border-t pt-2 space-y-1">
                        {t.buttons.map((b, i) => (
                          <div key={i} className="text-center text-xs text-[var(--brand)] flex items-center justify-center gap-1">
                            {b.type === "URL" ? <LinkIcon className="w-3 h-3" /> : b.type === "PHONE_NUMBER" ? <Phone className="w-3 h-3" /> : null}
                            {b.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.usecase && <Badge variant="outline" className="text-[10px]">{pretty(t.usecase)}</Badge>}
                    {t.topic && <Badge variant="outline" className="text-[10px]">{pretty(t.topic)}</Badge>}
                  </div>
                  <Button onClick={() => setPicked(t)}>Use this template</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {lib.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => lib.fetchNextPage()} disabled={lib.isFetchingNextPage}>
              {lib.isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Load more
            </Button>
          </div>
        )}
      </main>

      {picked && channelId && (
        <UseTemplateDialog
          template={picked}
          channelId={channelId}
          onClose={() => setPicked(null)}
          onDone={(status) => {
            setPicked(null);
            queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
            toast({
              title: status === "APPROVED" ? "Template approved" : `Template submitted (${status})`,
              description: status === "APPROVED" ? "Ready to send from Campaigns and Inbox." : "It will appear in Templates once Meta finishes.",
            });
          }}
        />
      )}
    </div>
  );
}

function UseTemplateDialog({ template, channelId, onClose, onDone }: {
  template: LibTemplate; channelId: string; onClose: () => void; onDone: (status: string) => void;
}) {
  const { toast } = useToast();
  const isAuth = String(template.category).toUpperCase() === "AUTHENTICATION";
  const [name, setName] = useState(template.name.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [expiry, setExpiry] = useState("10");
  const [security, setSecurity] = useState(true);
  const buttons = template.buttons || [];

  const create = useMutation({
    mutationFn: async () => {
      const buttonInputs = buttons.map((b, i) => {
        if (b.type === "URL") {
          const base = (inputs[i] || "").trim();
          return { type: "URL", url: { base_url: base, url_suffix_example: base.includes("{{1}}") ? base.replace("{{1}}", "12345") : undefined } };
        }
        if (b.type === "PHONE_NUMBER") return { type: "PHONE_NUMBER", phone_number: (inputs[i] || "").trim() };
        return { type: b.type };
      });
      const res = await apiRequest("POST", "/api/templates/library", {
        channelId,
        name,
        language: template.language,
        libraryTemplateName: template.name,
        category: template.category,
        buttonInputs,
        bodyInputs: isAuth ? { code_expiration_minutes: expiry, add_security_recommendation: security } : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create template");
      return json;
    },
    onSuccess: (json) => onDone(String(json?.meta?.status || json?.template?.status || "PENDING").toUpperCase()),
    onError: (e: Error) => toast({ title: "Meta rejected the request", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5" /> Add from library</DialogTitle>
          <DialogDescription>Meta fills in the text. You only set the name and your button details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Template name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
            <p className="text-xs text-muted-foreground">Lowercase, numbers and underscores. Must be unique on this number.</p>
          </div>
          {buttons.map((b, i) =>
            b.type === "URL" ? (
              <div key={i} className="space-y-1.5">
                <Label>Website for “{b.text}”</Label>
                <Input placeholder={b.url?.includes("{{1}}") ? "https://yoursite.com/orders/{{1}}" : "https://yoursite.com"} value={inputs[i] || ""} onChange={(e) => setInputs({ ...inputs, [i]: e.target.value })} />
                <p className="text-xs text-muted-foreground">Add {"{{1}}"} at the end if the link changes per customer (e.g. order id).</p>
              </div>
            ) : b.type === "PHONE_NUMBER" ? (
              <div key={i} className="space-y-1.5">
                <Label>Phone number for “{b.text}”</Label>
                <Input placeholder="+919876543210" value={inputs[i] || ""} onChange={(e) => setInputs({ ...inputs, [i]: e.target.value })} />
              </div>
            ) : null,
          )}
          {isAuth && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="w-4 h-4" /> OTP options</div>
              <div className="space-y-1.5">
                <Label>Code expires after (minutes)</Label>
                <Input type="number" min={1} max={90} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Add “do not share this code” line</Label>
                <Switch checked={security} onCheckedChange={setSecurity} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !name}>
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
            Add template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
