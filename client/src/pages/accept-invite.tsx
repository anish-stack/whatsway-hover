/**
 * Public: accept an invitation / admin-initiated password reset.
 * Token is one-time and hashed server-side.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Lock, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { send } from "@/components/reseller/shared";

const TITLES: Record<string, string> = {
  reseller_invite: "Activate your reseller account",
  customer_invite: "Activate your HoverChat account",
  password_reset: "Set a new password",
};

export default function AcceptInvitePage() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);

  useEffect(() => {
    if (!token) { setError("This link is missing its token."); return; }
    send("GET", `/api/auth/invitation?token=${encodeURIComponent(token)}`).then(setInfo).catch((e) => setError(e.message));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return setError("Use at least 8 characters with letters and numbers.");
    if (pw !== pw2) return setError("Passwords do not match.");
    setBusy(true);
    try {
      setDone(await send("POST", "/api/auth/accept-invite", { token, password: pw }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--brand-50,#eafbf2)] p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="rounded-xl bg-primary p-2 text-primary-foreground"><MessageSquare className="h-5 w-5" /></span>
          <span className="text-lg font-semibold">HoverChat</span>
        </div>
        {done ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="text-xl font-semibold">You're all set</h1>
            <p className="text-sm text-muted-foreground">Sign in with <strong className="text-foreground">{done.username}</strong> and your new password.</p>
            <Link href="/login"><Button className="w-full">Go to sign in</Button></Link>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold">{TITLES[info?.purpose] ?? "Set your password"}</h1>
            {info && <p className="mt-1 text-sm text-muted-foreground">Account: <strong className="text-foreground">{info.email}</strong> · username <span className="font-mono">{info.username}</span></p>}
            {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {info && (
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="ai-pw">New password</Label>
                  <Input id="ai-pw" type="password" autoComplete="new-password" className="mt-1" value={pw} onChange={(e) => setPw(e.target.value)} />
                  <p className="mt-1 text-xs text-muted-foreground">At least 8 characters, letters and numbers.</p>
                </div>
                <div>
                  <Label htmlFor="ai-pw2">Confirm password</Label>
                  <Input id="ai-pw2" type="password" autoComplete="new-password" className="mt-1" value={pw2} onChange={(e) => setPw2(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}><Lock className="mr-2 h-4 w-4" />{busy ? "Saving…" : "Set password"}</Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
