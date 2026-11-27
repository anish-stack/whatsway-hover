import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, KeyRound, Loader2, Mail, ShieldCheck, Smartphone } from "lucide-react";

interface Status { enabled: boolean; method: "totp" | "email" | null; backupCodesLeft: number; requiredByPlatform: boolean; enabledAt: string | null }

type Flow =
  | { kind: "idle" }
  | { kind: "password"; next: "totp" | "email" | "disable" | "codes" }
  | { kind: "totp"; secret: string; otpauth: string }
  | { kind: "email"; hint: string }
  | { kind: "codes"; codes: string[] };

const post = async (url: string, body: any) => (await apiRequest("POST", url, body)).json();

/** Account → Security: turn two-step login on/off, backup codes. */
export function TwoFactorCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: st, isLoading } = useQuery<Status>({ queryKey: ["/api/auth/2fa"] });
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setFlow({ kind: "idle" }); setPassword(""); setCode(""); setErr(null); };
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/auth/2fa"] });

  const step = useMutation({
    mutationFn: async () => {
      setErr(null);
      if (flow.kind === "password") {
        if (flow.next === "totp") return { totp: await post("/api/auth/2fa/totp/start", { password }) };
        if (flow.next === "email") return { email: await post("/api/auth/2fa/email/send", { password }) };
        if (flow.next === "codes") return { codes: await post("/api/auth/2fa/backup-codes", { password }) };
        return { disabled: await post("/api/auth/2fa/disable", { password }) };
      }
      if (flow.kind === "totp") return { codes: await post("/api/auth/2fa/totp/confirm", { code }) };
      if (flow.kind === "email") return { codes: await post("/api/auth/2fa/email/confirm", { code }) };
      return {};
    },
    onSuccess: (r: any) => {
      setCode("");
      if (r.totp) setFlow({ kind: "totp", secret: r.totp.secret, otpauth: r.totp.otpauth });
      else if (r.email) setFlow({ kind: "email", hint: r.email.emailHint });
      else if (r.codes) { setFlow({ kind: "codes", codes: r.codes.backupCodes }); refresh(); }
      else if (r.disabled) {
        reset(); refresh();
        toast({ title: "Two-step login turned off", description: r.disabled.stillRequired ? "Your role still gets an email code at login (platform rule)." : undefined });
      }
    },
    onError: (e: any) => setErr(e?.message || "Something went wrong"),
  });

  const copyCodes = (codes: string[]) => {
    navigator.clipboard?.writeText(codes.join("\n"));
    toast({ title: "Backup codes copied" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5" /> Two-step login</CardTitle>
        <CardDescription>After your password, ask for a code from your phone or email. Stops anyone who only knows your password.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : st?.enabled ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-green-100 text-green-800 border-green-200">On</Badge>
              <span className="text-sm">
                {st.method === "totp" ? "Authenticator app" : "Code by email"} · {st.backupCodesLeft} backup code{st.backupCodesLeft === 1 ? "" : "s"} left
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setFlow({ kind: "password", next: "codes" })}><KeyRound className="h-4 w-4 mr-1.5" />New backup codes</Button>
              {st.method !== "totp" && <Button variant="outline" size="sm" onClick={() => setFlow({ kind: "password", next: "totp" })}><Smartphone className="h-4 w-4 mr-1.5" />Switch to authenticator app</Button>}
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setFlow({ kind: "password", next: "disable" })}>Turn off</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {st?.requiredByPlatform && (
              <p className="text-sm text-amber-700">Your role must use two-step login, so a code is emailed to you at every login. Set up an authenticator app for faster sign-in.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setFlow({ kind: "password", next: "totp" })}
                className="rounded-lg border p-4 text-left hover:border-[var(--brand)] focus-visible:outline focus-visible:outline-2">
                <Smartphone className="h-5 w-5 mb-2" />
                <p className="font-medium text-sm">Authenticator app</p>
                <p className="text-xs text-muted-foreground">Google Authenticator, Authy or Microsoft Authenticator. Works offline. Recommended.</p>
              </button>
              <button type="button" onClick={() => setFlow({ kind: "password", next: "email" })}
                className="rounded-lg border p-4 text-left hover:border-[var(--brand)] focus-visible:outline focus-visible:outline-2">
                <Mail className="h-5 w-5 mb-2" />
                <p className="font-medium text-sm">Code by email</p>
                <p className="text-xs text-muted-foreground">We email a 6-digit code each time you sign in.</p>
              </button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={flow.kind !== "idle"} onOpenChange={(o) => !o && reset()}>
        <DialogContent className="sm:max-w-md">
          {flow.kind === "password" && (
            <>
              <DialogHeader>
                <DialogTitle>Confirm your password</DialogTitle>
                <DialogDescription>
                  {flow.next === "disable" ? "Two-step login will be turned off." : flow.next === "codes" ? "Your old backup codes will stop working." : "Needed to change login security."}
                </DialogDescription>
              </DialogHeader>
              <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Current password"
                onKeyDown={(e) => e.key === "Enter" && password && step.mutate()} />
            </>
          )}
          {flow.kind === "totp" && (
            <>
              <DialogHeader>
                <DialogTitle>Scan with your authenticator app</DialogTitle>
                <DialogDescription>Open the app, tap +, scan this QR code, then type the 6-digit code it shows.</DialogDescription>
              </DialogHeader>
              <div className="flex justify-center rounded-lg bg-white p-4"><QRCodeSVG value={flow.otpauth} size={180} /></div>
              <p className="text-xs text-center text-muted-foreground break-all">Can't scan? Enter this key: <span className="font-mono text-foreground">{flow.secret.match(/.{1,4}/g)?.join(" ")}</span></p>
              <Label htmlFor="tfa-setup">6-digit code</Label>
              <Input id="tfa-setup" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="text-center tracking-[0.3em]" />
            </>
          )}
          {flow.kind === "email" && (
            <>
              <DialogHeader>
                <DialogTitle>Check your email</DialogTitle>
                <DialogDescription>We sent a 6-digit code to {flow.hint}. Enter it to turn on email codes.</DialogDescription>
              </DialogHeader>
              <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="text-center tracking-[0.3em]" />
            </>
          )}
          {flow.kind === "codes" && (
            <>
              <DialogHeader>
                <DialogTitle>Save your backup codes</DialogTitle>
                <DialogDescription>Each code works once if you lose your phone or can't get email. They won't be shown again.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 font-mono text-sm">
                {flow.codes.map((c) => <span key={c}>{c}</span>)}
              </div>
            </>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <DialogFooter>
            {flow.kind === "codes" ? (
              <>
                <Button variant="outline" onClick={() => copyCodes((flow as any).codes)}><Copy className="h-4 w-4 mr-1.5" />Copy</Button>
                <Button onClick={() => { reset(); toast({ title: "Two-step login is on" }); }}>I saved them</Button>
              </>
            ) : (
              <Button onClick={() => step.mutate()} disabled={step.isPending || (flow.kind === "password" ? !password : code.length !== 6)}>
                {step.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : flow.kind === "password" ? "Continue" : "Turn on"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
