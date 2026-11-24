/**
 * "Book a demo" form for the public website.
 * Open it from anywhere with openBookDemo() or a link to "#book-demo".
 */
import { useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

const EVENT = "hc:open-book-demo";
export const openBookDemo = () => window.dispatchEvent(new Event(EVENT));

const BUSINESS_TYPES = ["E-commerce / D2C", "Clinic / Healthcare", "Education / Coaching", "Real estate", "Agency", "Restaurant / Food", "Services", "Other"];
const TEAM_SIZES = ["Just me", "2–10", "11–50", "51–200", "200+"];
const TIMES = ["Morning (10am–1pm)", "Afternoon (1pm–5pm)", "Evening (5pm–8pm)", "Any time"];

const empty = { name: "", email: "", phone: "", company: "", businessType: "", teamSize: "", preferredTime: "", message: "", website: "" };

export default function BookDemoDialog() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const show = () => { setOpen(true); setDone(false); setErr(""); };
    const fromHash = () => { if (window.location.hash === "#book-demo") show(); };
    window.addEventListener(EVENT, show);
    window.addEventListener("hashchange", fromHash);
    fromHash();
    return () => { window.removeEventListener(EVENT, show); window.removeEventListener("hashchange", fromHash); };
  }, []);

  const set = (k: keyof typeof empty, v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (f.name.trim().length < 2) return setErr("Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr("Please enter a valid email.");
    if (f.phone.replace(/\D/g, "").length < 8) return setErr("Please enter a valid phone number.");
    setBusy(true);
    try {
      await apiRequest("POST", "/api/demo-requests", { ...f, source: window.location.pathname });
      setDone(true);
      setF(empty);
    } catch (e: any) {
      setErr(e?.message || "Could not send your request. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const close = (o: boolean) => {
    setOpen(o);
    if (!o && window.location.hash === "#book-demo") history.replaceState(null, "", window.location.pathname + window.location.search);
  };

  const pill = (k: "businessType" | "teamSize" | "preferredTime", options: string[]) => (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => set(k, f[k] === o ? "" : o)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${f[k] === o ? "border-[var(--brand)] bg-[var(--brand-100)] text-[var(--brand-700,#05713a)]" : "hover:border-foreground/30"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        {done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-14 w-14 text-[var(--brand)]" />
            <h3 className="text-xl font-semibold">Request received</h3>
            <p className="max-w-sm text-sm text-muted-foreground">Thanks! Our team will call or WhatsApp you within one working day to fix a time for your demo.</p>
            <Button className="mt-2" onClick={() => close(false)}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-100)] text-[var(--brand)]"><CalendarCheck className="h-5 w-5" /></span>
              <DialogTitle>Book a free demo</DialogTitle>
              <DialogDescription>See campaigns, team inbox, AI replies and the WhatsApp store live in a 20-minute call.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="bd-name">Your name *</Label><Input id="bd-name" autoComplete="name" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="bd-company">Company</Label><Input id="bd-company" autoComplete="organization" value={f.company} onChange={(e) => set("company", e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="bd-email">Work email *</Label><Input id="bd-email" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
                <div className="space-y-1.5"><Label htmlFor="bd-phone">Phone / WhatsApp *</Label><Input id="bd-phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              </div>
              <div className="space-y-2"><Label>Business type</Label>{pill("businessType", BUSINESS_TYPES)}</div>
              <div className="space-y-2"><Label>Team size</Label>{pill("teamSize", TEAM_SIZES)}</div>
              <div className="space-y-2"><Label>Best time to call</Label>{pill("preferredTime", TIMES)}</div>
              <div className="space-y-1.5"><Label htmlFor="bd-msg">What would you like to see?</Label><Textarea id="bd-msg" rows={3} value={f.message} onChange={(e) => set("message", e.target.value)} placeholder="e.g. bulk campaigns for 5,000 customers, appointment booking for my clinic…" /></div>
              {/* honeypot — hidden from people */}
              <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} className="hidden" aria-hidden="true" />
              {err && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">{err}</p>}
              <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Request demo</Button>
              <p className="text-center text-xs text-muted-foreground">We'll only use your details to arrange the demo.</p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
