import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Check, Copy, Instagram, Loader2, TrendingUp } from "lucide-react";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" aria-label={`Copy ${label}`} onClick={() => { navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1200); }}>
          {ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export default function SocialAppsPage() {
  const { toast } = useToast();
  const q = useQuery<any>({ queryKey: ["/api/admin/social-apps"] });
  const [f, setF] = useState({ igAppId: "", igAppSecret: "", fbAppId: "", fbAppSecret: "", webhookVerifyToken: "" });
  useEffect(() => { if (q.data) setF((x) => ({ ...x, igAppId: q.data.igAppId, fbAppId: q.data.fbAppId, webhookVerifyToken: q.data.webhookVerifyToken })); }, [q.data]);
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/admin/social-apps", {
      igAppId: f.igAppId, fbAppId: f.fbAppId, webhookVerifyToken: f.webhookVerifyToken || undefined,
      ...(f.igAppSecret ? { igAppSecret: f.igAppSecret } : {}), ...(f.fbAppSecret ? { fbAppSecret: f.fbAppSecret } : {}),
    })).json(),
    onSuccess: () => { toast({ title: "Saved" }); setF((x) => ({ ...x, igAppSecret: "", fbAppSecret: "" })); q.refetch(); },
    onError: (e: any) => toast({ title: "Couldn't save", description: e?.message, variant: "destructive" }),
  });
  if (q.isLoading) return <div className="p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const u = q.data?.urls || {};
  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Instagram & Ads apps" subtitle="Meta app keys that let your customers connect Instagram and their ad accounts" />
      <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Instagram className="h-5 w-5 text-pink-600" />Instagram (Instagram API with Instagram Login)</CardTitle>
            <CardDescription>developers.facebook.com → your app → Add product "Instagram" → API setup with Instagram login. Copy the Instagram app ID and secret (not the Facebook app ones).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="ig-id">Instagram app ID</Label><Input id="ig-id" value={f.igAppId} onChange={(e) => setF({ ...f, igAppId: e.target.value.trim() })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ig-secret">Instagram app secret</Label><Input id="ig-secret" type="password" value={f.igAppSecret} onChange={(e) => setF({ ...f, igAppSecret: e.target.value })} placeholder={q.data?.igSecretSet ? "Saved — type to replace" : ""} /></div>
            </div>
            <CopyRow label="Business login → OAuth redirect URI" value={u.igRedirect || ""} />
            <CopyRow label="Webhooks → Callback URL (subscribe to comments, messages)" value={u.igWebhook || ""} />
            <div className="space-y-1.5">
              <Label htmlFor="ig-verify">Webhooks → Verify token</Label>
              <Input id="ig-verify" value={f.webhookVerifyToken} onChange={(e) => setF({ ...f, webhookVerifyToken: e.target.value.trim() })} placeholder="Generated when you save" />
            </div>
            <p className="text-xs text-muted-foreground">Permissions to request in App Review: instagram_business_basic, instagram_business_manage_messages, instagram_business_manage_comments, instagram_business_content_publish, instagram_business_manage_insights. Until approved, only people with a role on the app can connect.</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5 text-blue-600" />Facebook ads (Facebook Login)</CardTitle>
            <CardDescription>Leave blank to use the same app as WhatsApp Embedded Signup. Add "Facebook Login" and the Marketing API to the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="fb-id">Facebook app ID</Label><Input id="fb-id" value={f.fbAppId} onChange={(e) => setF({ ...f, fbAppId: e.target.value.trim() })} placeholder="Same as WhatsApp app" /></div>
              <div className="space-y-1.5"><Label htmlFor="fb-secret">Facebook app secret</Label><Input id="fb-secret" type="password" value={f.fbAppSecret} onChange={(e) => setF({ ...f, fbAppSecret: e.target.value })} placeholder={q.data?.fbSecretSet ? "Saved — type to replace" : ""} /></div>
            </div>
            <CopyRow label="Facebook Login → Valid OAuth redirect URI" value={u.adsRedirect || ""} />
            <p className="text-xs text-muted-foreground">Permissions: ads_management, ads_read, business_management, pages_show_list, pages_read_engagement (Advanced access needs App Review + Business verification).</p>
          </CardContent>
        </Card>
        <div className="flex justify-end"><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button></div>
      </main>
    </div>
  );
}
