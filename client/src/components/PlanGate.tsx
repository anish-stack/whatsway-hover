/**
 * Plan gate: check the subscription BEFORE starting a flow (e.g. before the
 * Meta embedded-signup popup), instead of failing at the very end.
 *
 *   const gate = usePlanGate("channel");
 *   <Button onClick={() => gate.run(openConnectionChooser)} />
 *   {gate.dialog}
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Crown, Loader2, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

type Feature = "channel" | "contacts" | "automation" | "campaign";
type Check = {
  allowed: boolean;
  code?: "NO_SUBSCRIPTION" | "EXPIRED" | "PLAN_MISSING" | "NOT_IN_PLAN" | "LIMIT_REACHED";
  error?: string;
  planName?: string | null;
  limit?: number | "unlimited";
  used?: number;
};

const LABEL: Record<Feature, string> = {
  channel: "WhatsApp numbers",
  contacts: "contacts",
  automation: "automations",
  campaign: "campaigns",
};

function copy(feature: Feature, c: Check): { title: string; body: string; cta: string } {
  const what = LABEL[feature];
  switch (c.code) {
    case "NO_SUBSCRIPTION":
      return {
        title: "Choose a plan first",
        body: feature === "channel"
          ? "Connecting a WhatsApp number needs an active HoverChat plan. Pick a plan, then come back and connect — it takes a minute."
          : `You need an active plan to add ${what}.`,
        cta: "View plans",
      };
    case "EXPIRED":
      return { title: "Your plan has expired", body: `Renew your plan to add ${what} again.`, cta: "Renew plan" };
    case "LIMIT_REACHED":
      return {
        title: "Plan limit reached",
        body: `Your ${c.planName ? `${c.planName} ` : ""}plan allows ${c.limit} ${what} and you are using ${c.used}. Upgrade to add more.`,
        cta: "Upgrade plan",
      };
    case "NOT_IN_PLAN":
      return { title: "Not included in your plan", body: `Your current plan does not include ${what}. Upgrade to unlock it.`, cta: "Upgrade plan" };
    default:
      return { title: "Plan check failed", body: c.error || "Please try again in a moment.", cta: "View plans" };
  }
}

export function usePlanGate(feature: Feature) {
  const [, setLocation] = useLocation();
  const [checking, setChecking] = useState(false);
  const [blocked, setBlocked] = useState<Check | null>(null);

  const run = async (fn: () => void) => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await apiRequest("GET", `/api/subscription/check?feature=${feature}`);
      const c = (await res.json()) as Check;
      if (c.allowed) fn();
      else setBlocked(c);
    } catch (e: any) {
      setBlocked({ allowed: false, error: e?.message });
    } finally {
      setChecking(false);
    }
  };

  const text = blocked ? copy(feature, blocked) : null;
  const dialog: ReactNode = (
    <Dialog open={!!blocked} onOpenChange={(o) => !o && setBlocked(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            {blocked?.code === "LIMIT_REACHED" || blocked?.code === "NOT_IN_PLAN" ? <Crown className="h-7 w-7" /> : <Lock className="h-7 w-7" />}
          </div>
          <DialogTitle className="text-center">{text?.title}</DialogTitle>
          <DialogDescription className="text-center">{text?.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-center">
          <Button variant="outline" onClick={() => setBlocked(null)}>Not now</Button>
          <Button onClick={() => { setBlocked(null); setLocation("/plans"); }}>{text?.cta}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { run, checking, dialog, spinner: checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null };
}
