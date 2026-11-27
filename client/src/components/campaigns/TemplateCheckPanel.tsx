import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, Loader2, Send, ShieldCheck, XCircle } from "lucide-react";

export interface CampaignCheckResult {
  ok: boolean;
  issues: { level: "error" | "warning"; message: string }[];
  preview: {
    headerMedia: { type: string; link?: string; id?: string } | null;
    headerText: string;
    body: string;
    buttons: { index: number; type: string; value: string }[];
    hasOffer: boolean;
  };
  liveFromMeta: boolean;
  test?: { status: "sent" | "failed"; messageId?: string; error?: string; to: string };
}

interface Props {
  channelId?: string;
  templateId?: string;
  language?: string;
  mapping: Record<string, any>;
  /** changes whenever the template / values change → re-check */
  signature: string;
  onResult?: (r: CampaignCheckResult | null) => void;
}

/** Checks the chosen values against the live Meta template and can send one test message. */
export function TemplateCheckPanel({ channelId, templateId, language, mapping, signature, onResult }: Props) {
  const [result, setResult] = useState<CampaignCheckResult | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const check = useMutation({
    mutationFn: async (phone?: string) =>
      (await apiRequest("POST", "/api/campaigns/preview", {
        channelId, templateId, templateLanguage: language, variableMapping: mapping, testPhone: phone || undefined,
      })).json() as Promise<CampaignCheckResult>,
    onSuccess: (r) => { setResult(r); setError(null); onResult?.(r); },
    onError: (e: any) => { setError(e?.message || "Check failed"); onResult?.(null); },
  });

  useEffect(() => {
    if (!channelId || !templateId) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => check.mutate(undefined), 500);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, templateId, signature]);

  if (!templateId) return null;
  const errors = result?.issues.filter((i) => i.level === "error") || [];
  const warnings = result?.issues.filter((i) => i.level === "warning") || [];
  const sending = check.isPending && check.variables;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Check before sending
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={() => check.mutate(undefined)} disabled={check.isPending}>
          {check.isPending && !sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check again"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <>
          {errors.length === 0 ? (
            <p className="text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Values match the template{result.liveFromMeta ? " on Meta" : ""}. Ready to send.
            </p>
          ) : (
            <ul className="space-y-1">
              {errors.map((i, n) => (
                <li key={n} className="text-sm text-destructive flex gap-2"><XCircle className="h-4 w-4 mt-0.5 shrink-0" />{i.message}</li>
              ))}
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="space-y-1">
              {warnings.map((i, n) => (
                <li key={n} className="text-xs text-amber-700 flex gap-2"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{i.message}</li>
              ))}
            </ul>
          )}

          <div className="rounded-md bg-[#e7f8e9] dark:bg-emerald-950/30 p-3 text-sm space-y-2 max-w-sm">
            {result.preview.headerMedia?.link && result.preview.headerMedia.type === "image" && (
              <img src={result.preview.headerMedia.link} alt="" className="rounded max-h-40 w-full object-cover" />
            )}
            {result.preview.headerMedia && !result.preview.headerMedia.link && (
              <p className="text-xs text-muted-foreground">[{result.preview.headerMedia.type} uploaded]</p>
            )}
            {result.preview.headerText && <p className="font-semibold">{result.preview.headerText}</p>}
            {result.preview.hasOffer && <p className="text-xs text-muted-foreground">⏱ Limited-time offer</p>}
            <p className="whitespace-pre-wrap">{result.preview.body}</p>
            {result.preview.buttons.length > 0 && (
              <div className="border-t pt-2 space-y-0.5">
                {result.preview.buttons.map((b) => (
                  <p key={b.index} className="text-xs text-muted-foreground">
                    Button {b.index + 1} ({b.type.replace("_", " ")}): <span className="text-foreground">{b.value}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Preview uses a sample contact named "Test User"; real contacts get their own name and phone.</p>
        </>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="testPhone" className="text-xs">Send a test to</Label>
          <Input id="testPhone" placeholder="919876543210" value={testPhone} inputMode="tel"
            onChange={(e) => setTestPhone(e.target.value.replace(/[^\d+]/g, ""))} />
        </div>
        <Button type="button" variant="outline" className="gap-2" disabled={!testPhone || check.isPending}
          onClick={() => check.mutate(testPhone)}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send test
        </Button>
      </div>
      {result?.test && (
        result.test.status === "sent"
          ? <p className="text-sm text-green-700">Test sent to {result.test.to}. Check WhatsApp on that phone.</p>
          : <p className="text-sm text-destructive">Test failed: {result.test.error}</p>
      )}
    </div>
  );
}
