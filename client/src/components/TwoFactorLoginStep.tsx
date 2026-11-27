import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";

interface Props {
  method: "totp" | "email";
  emailHint?: string;
  onDone: () => void;
  onRestart: () => void;
}

/** Second login step: authenticator / email code, or a backup code. */
export default function TwoFactorLoginStep({ method, emailHint: hint0, onDone, onRestart }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [emailHint, setEmailHint] = useState(hint0);
  const [useBackup, setUseBackup] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await apiRequest("POST", "/api/auth/login/2fa", { code });
      onDone();
    } catch (e: any) {
      const msg = String(e?.message || "Wrong code");
      setErr(msg);
      if (/sign-in expired|password again/i.test(msg)) setTimeout(onRestart, 1500);
    } finally { setBusy(false); }
  };

  const emailMe = async () => {
    setErr(null); setInfo(null);
    try {
      const r = await (await apiRequest("POST", "/api/auth/login/2fa/email", {})).json();
      setEmailHint(r.emailHint);
      setInfo(`Code sent to ${r.emailHint}.`);
    } catch (e: any) { setErr(e?.message || "Couldn't send the code"); }
  };

  const label = useBackup
    ? "Backup code"
    : method === "totp" && !emailHint
      ? "Code from your authenticator app"
      : `Code sent to ${emailHint || "your email"}`;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg bg-[var(--brand)]/10 p-3 text-sm">
        <ShieldCheck className="h-5 w-5 text-[var(--brand)] shrink-0 mt-0.5" />
        <p>Two-step login is on for this account. Enter the 6-digit code to finish signing in.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tfa-code">{label}</Label>
        <Input
          id="tfa-code" autoFocus autoComplete="one-time-code" inputMode={useBackup ? "text" : "numeric"}
          placeholder={useBackup ? "XXXXX-XXXXX" : "123456"} maxLength={useBackup ? 11 : 6}
          value={code}
          onChange={(e) => setCode(useBackup ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))}
          className="text-center text-lg tracking-[0.3em]"
        />
      </div>
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      {info && <p className="text-sm text-green-700">{info}</p>}
      <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify and sign in"}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button type="button" className="text-[var(--brand)] hover:underline" onClick={emailMe}>
          {method === "email" ? "Resend code" : "Email me a code instead"}
        </button>
        <button type="button" className="text-[var(--ink-500)] hover:underline" onClick={() => { setUseBackup(!useBackup); setCode(""); }}>
          {useBackup ? "Use 6-digit code" : "Use a backup code"}
        </button>
      </div>
      <button type="button" onClick={onRestart} className="block w-full text-center text-sm text-[var(--ink-500)] hover:underline">
        Back to sign in
      </button>
    </form>
  );
}
