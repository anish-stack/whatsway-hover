/**
 * Renders landing-builder sections. Used by the public page and the editor canvas
 * (in the editor, `editing` disables tracking, form submits and link navigation).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ChevronDown, Check, Loader2, Quote, type LucideIcon,
  MessageCircle, Megaphone, Bot, Zap, Users, ShoppingCart, CalendarCheck, Bell, CreditCard, BarChart3, Shield, Clock, HeartPulse, Stethoscope, GraduationCap, Home, Plane, Utensils, Car, Sparkles, Truck, Store, Repeat, Send, Target, Globe, Headphones, FileText, Gift, Star, CheckCircle2,
} from "lucide-react";
import type { Block, LandingSettings } from "@shared/landing";

const DEFAULT_PRIMARY = "#08a957";

export const LANDING_ICONS: Record<string, LucideIcon> = { MessageCircle, Megaphone, Bot, Zap, Users, ShoppingCart, CalendarCheck, Bell, CreditCard, BarChart3, Shield, Clock, HeartPulse, Stethoscope, GraduationCap, Home, Plane, Utensils, Car, Sparkles, Truck, Store, Repeat, Send, Target, Globe, Headphones, FileText, Gift, Star, CheckCircle2 };
export function LandingIcon({ name, className }: { name?: string; className?: string }) {
  const I = (name && LANDING_ICONS[name]) || Sparkles;
  return <I className={className} aria-hidden />;
}

const CSS = `
.lp{--lp-soft:color-mix(in srgb,var(--lp) 7%,#fff);--lp-soft2:color-mix(in srgb,var(--lp) 14%,#fff);--lp-deep:color-mix(in srgb,var(--lp) 55%,#04140c);color:#1e293b;font-family:inherit}
.lp-sec{padding:72px 20px}
@media (max-width:640px){.lp-sec{padding:52px 16px}}
.lp-wrap{max-width:1140px;margin:0 auto}
.lp-bg-white{background:#fff}
.lp-bg-soft{background:var(--lp-soft)}
.lp-bg-brand{background:var(--lp-deep);color:#fff}
.lp-bg-dark{background:#0d1b2a;color:#e2e8f0}
.lp-h1{font-size:clamp(2rem,4.4vw,3.35rem);line-height:1.08;font-weight:800;letter-spacing:-.025em;color:#0b1d2e}
.lp-h2{font-size:clamp(1.6rem,3vw,2.3rem);line-height:1.15;font-weight:780;letter-spacing:-.02em;color:#0b1d2e}
.lp-bg-brand .lp-h1,.lp-bg-brand .lp-h2,.lp-bg-dark .lp-h1,.lp-bg-dark .lp-h2{color:#fff}
.lp-sub{font-size:1.08rem;line-height:1.65;color:#475569;max-width:62ch}
.lp-bg-brand .lp-sub,.lp-bg-dark .lp-sub{color:rgba(255,255,255,.78)}
.lp-btn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:13px 24px;font-weight:650;font-size:.98rem;transition:transform .15s,box-shadow .15s,background .15s;cursor:pointer;border:0}
.lp-btn:focus-visible{outline:3px solid color-mix(in srgb,var(--lp) 45%,#fff);outline-offset:2px}
.lp-btn-primary{background:var(--lp);color:#fff;box-shadow:0 8px 22px -10px var(--lp)}
.lp-btn-primary:hover{transform:translateY(-1px);background:color-mix(in srgb,var(--lp) 88%,#000)}
.lp-bg-brand .lp-btn-primary{background:#fff;color:var(--lp-deep);box-shadow:none}
.lp-btn-ghost{background:transparent;color:inherit;border:1.5px solid currentColor;opacity:.85}
.lp-btn-ghost:hover{opacity:1}
.lp-card{background:#fff;border:1px solid #e6ece9;border-radius:18px}
.lp-bg-dark .lp-card{background:#13263a;border-color:#1f3650}
.lp-bg-dark .lp-card h3{color:#fff}
.lp-icon{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:var(--lp-soft2);color:var(--lp-deep)}
.lp-input{width:100%;border:1px solid #d5dfda;border-radius:12px;padding:12px 14px;font-size:.98rem;background:#fff;color:#0f172a}
.lp-input:focus{outline:none;border-color:var(--lp);box-shadow:0 0 0 3px color-mix(in srgb,var(--lp) 18%,transparent)}
.lp-rich h2{font-size:1.6rem;font-weight:750;margin:1.2em 0 .5em;color:#0b1d2e}.lp-rich h3{font-size:1.25rem;font-weight:700;margin:1em 0 .4em}
.lp-rich p{margin:0 0 1em;line-height:1.75}.lp-rich ul{list-style:disc;padding-left:1.3em;margin:0 0 1em}.lp-rich ol{list-style:decimal;padding-left:1.3em}
.lp-rich a{color:var(--lp);text-decoration:underline}.lp-rich img{max-width:100%;border-radius:14px}
.lp-bg-dark .lp-rich h2,.lp-bg-brand .lp-rich h2{color:#fff}
.lp-chat{background:#efeae2;border-radius:26px;padding:18px;box-shadow:0 30px 60px -30px rgba(2,30,20,.45);border:8px solid #0e1f17;max-width:360px;margin:0 auto}
.lp-bubble{max-width:82%;padding:9px 12px;border-radius:12px;font-size:.86rem;line-height:1.4;margin-bottom:8px;box-shadow:0 1px 0 rgba(0,0,0,.06)}
.lp-in{background:#fff;border-top-left-radius:3px}
.lp-out{background:#d9fdd3;margin-left:auto;border-top-right-radius:3px}
.lp-wa{position:fixed;right:20px;bottom:20px;z-index:60;width:58px;height:58px;border-radius:50%;background:#25d366;color:#fff;display:grid;place-items:center;box-shadow:0 12px 26px -8px rgba(0,0,0,.4)}
@media (prefers-reduced-motion:reduce){.lp-btn{transition:none}}
`;

// ───────────── tracking (public pages only, IDs validated server-side) ─────────────
function loadScript(id: string, src: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id; s.async = true; s.src = src;
  document.head.appendChild(s);
}
function useTracking(settings: LandingSettings, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const w = window as any;
    const tagId = settings.ga4Id || settings.googleAdsId;
    if (tagId && /^(G-[A-Z0-9]+|AW-\d+)$/.test(tagId)) {
      loadScript("lp-gtag", `https://www.googletagmanager.com/gtag/js?id=${tagId}`);
      w.dataLayer = w.dataLayer || [];
      w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
      w.gtag("js", new Date());
      if (settings.ga4Id) w.gtag("config", settings.ga4Id);
      if (settings.googleAdsId) w.gtag("config", settings.googleAdsId);
    }
    if (settings.metaPixelId && /^\d+$/.test(settings.metaPixelId) && !w.fbq) {
      const f: any = (w.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); });
      if (!w._fbq) w._fbq = f;
      f.push = f; f.loaded = true; f.version = "2.0"; f.queue = [];
      loadScript("lp-fbq", "https://connect.facebook.net/en_US/fbevents.js");
      w.fbq("init", settings.metaPixelId);
      w.fbq("track", "PageView");
    }
  }, [enabled, settings.ga4Id, settings.googleAdsId, settings.metaPixelId]);
}
function trackLead(settings: LandingSettings) {
  const w = window as any;
  try {
    if (w.gtag) {
      if (settings.googleAdsId && settings.googleAdsLabel) w.gtag("event", "conversion", { send_to: `${settings.googleAdsId}/${settings.googleAdsLabel}` });
      w.gtag("event", "generate_lead");
    }
    if (w.fbq) w.fbq("track", "Lead");
  } catch { /* ignore */ }
}
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "wbraid", "gbraid"];
function readUtm(): Record<string, string> {
  try {
    const q = new URLSearchParams(window.location.search);
    const fromUrl: Record<string, string> = {};
    for (const k of UTM_KEYS) { const v = q.get(k); if (v) fromUrl[k] = v.slice(0, 300); }
    if (Object.keys(fromUrl).length) sessionStorage.setItem("lp_utm", JSON.stringify(fromUrl));
    const saved = JSON.parse(sessionStorage.getItem("lp_utm") || "{}");
    return { ...saved, ...fromUrl, ...(document.referrer ? { referrer: document.referrer.slice(0, 300) } : {}) };
  } catch { return {}; }
}

// ───────────── context passed to every section ─────────────
interface Ctx { settings: LandingSettings; slug?: string; editing: boolean; primary: string }

function ctaHref(p: any, ctx: Ctx): string {
  switch (p.ctaAction) {
    case "whatsapp": {
      const n = ctx.settings.whatsappNumber;
      return n ? `https://wa.me/${n}${ctx.settings.whatsappText ? `?text=${encodeURIComponent(ctx.settings.whatsappText)}` : ""}` : "#lp-form";
    }
    case "link": return p.ctaLink || "#";
    case "signup": return "/signup";
    default: return "#lp-form";
  }
}
function Cta({ p, ctx, className = "lp-btn lp-btn-primary" }: { p: any; ctx: Ctx; className?: string }) {
  if (!p.ctaText) return null;
  const href = ctaHref(p, ctx);
  const external = /^https?:/.test(href);
  return (
    <a className={className} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}
      onClick={(e) => {
        if (ctx.editing) { e.preventDefault(); return; }
        if (href === "#lp-form") { e.preventDefault(); document.getElementById("lp-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
      }}>
      {p.ctaAction === "whatsapp" && <MessageCircle className="h-4 w-4" />}{p.ctaText}
    </a>
  );
}
const Sec = ({ bg, children, id }: { bg?: string; children: ReactNode; id?: string }) => (
  <section id={id} className={`lp-sec lp-bg-${bg || "white"}`}><div className="lp-wrap">{children}</div></section>
);
const Head = ({ title, subtitle, center = true }: { title?: string; subtitle?: string; center?: boolean }) =>
  title || subtitle ? (
    <div className={`mb-10 ${center ? "text-center mx-auto" : ""}`} style={{ maxWidth: 760 }}>
      {title && <h2 className="lp-h2">{title}</h2>}
      {subtitle && <p className={`lp-sub mt-3 ${center ? "mx-auto" : ""}`}>{subtitle}</p>}
    </div>
  ) : null;

function ChatMock({ title }: { title?: string }) {
  return (
    <div className="lp-chat" aria-hidden>
      <div className="flex items-center gap-2 mb-3 text-[13px] font-semibold text-slate-700">
        <span className="h-8 w-8 rounded-full grid place-items-center text-white" style={{ background: "var(--lp)" }}><MessageCircle className="h-4 w-4" /></span>
        {(title || "Your business").slice(0, 26)}<Check className="h-3.5 w-3.5 text-sky-500" />
      </div>
      <div className="lp-bubble lp-in">Hi! 👋 How can we help you today?</div>
      <div className="lp-bubble lp-out">I want to book an appointment for Saturday</div>
      <div className="lp-bubble lp-in">Sure — pick a time:<br /><b>10:00 AM · 12:30 PM · 4:00 PM</b></div>
      <div className="lp-bubble lp-out">12:30 PM please</div>
      <div className="lp-bubble lp-in">Booked ✅ We'll remind you a day before.</div>
    </div>
  );
}

// ───────────── sections ─────────────
function Hero({ p, ctx }: { p: any; ctx: Ctx }) {
  const center = p.layout === "center";
  const media = p.image ? <img src={p.image} alt={p.imageAlt || ""} {...({ fetchpriority: "high" } as any)} className="w-full rounded-3xl object-contain max-h-[560px]" /> : <ChatMock />;
  const bgStyle: CSSProperties | undefined = p.bgImage ? {
    backgroundImage: `linear-gradient(${p.overlay === "light" ? "rgba(255,255,255,.86),rgba(255,255,255,.86)" : p.overlay === "brand" ? "color-mix(in srgb,var(--lp) 82%,transparent),color-mix(in srgb,var(--lp-deep) 88%,transparent)" : "rgba(6,18,14,.72),rgba(6,18,14,.6)"}),url("${String(p.bgImage).replace(/"/g, "")}")`,
    backgroundSize: "cover", backgroundPosition: "center",
  } : undefined;
  const onDark = !!p.bgImage && p.overlay !== "light";
  return (
    <section className={`lp-sec lp-bg-${p.bgImage ? (onDark ? "dark" : "white") : p.background || "white"}`} style={bgStyle}>
      <div className="lp-wrap">
        <div className={center ? "text-center max-w-3xl mx-auto" : `grid items-center gap-12 lg:grid-cols-2 ${p.layout === "left" ? "lg:[&>*:first-child]:order-2" : ""}`}>
          <div>
            <h1 className="lp-h1 whitespace-pre-line" style={onDark ? { color: "#fff" } : undefined}>{p.headline}</h1>
            {p.subheadline && <p className={`lp-sub mt-5 text-lg ${center ? "mx-auto" : ""}`} style={onDark ? { color: "rgba(255,255,255,.85)" } : undefined}>{p.subheadline}</p>}
            <div className={`mt-8 flex flex-wrap gap-3 ${center ? "justify-center" : ""}`}>
              <Cta p={p} ctx={ctx} />
              {p.secondaryText && (
                <a className="lp-btn lp-btn-ghost" href={p.secondaryLink || "#"} onClick={(e) => ctx.editing && e.preventDefault()}>{p.secondaryText}</a>
              )}
            </div>
            {!!p.points?.length && (
              <ul className={`mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm ${center ? "justify-center" : ""}`}>
                {p.points.filter((x: any) => x.text).map((x: any, i: number) => (
                  <li key={i} className="flex items-center gap-2 opacity-90"><Check className="h-4 w-4" style={{ color: onDark ? "#fff" : "var(--lp)" }} />{x.text}</li>
                ))}
              </ul>
            )}
          </div>
          {!center && <div>{media}</div>}
        </div>
      </div>
    </section>
  );
}

function Logos({ p }: { p: any }) {
  return (
    <section className="py-10 px-5 bg-white border-y border-slate-100">
      <div className="lp-wrap">
        {p.title && <p className="text-center text-sm text-slate-500 mb-6">{p.title}</p>}
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {(p.items || []).map((x: any, i: number) => x.image
            ? <img key={i} src={x.image} alt={x.name || ""} className="h-9 w-auto object-contain opacity-70 grayscale hover:grayscale-0 hover:opacity-100 transition" />
            : <span key={i} className="text-lg font-bold tracking-tight text-slate-400">{x.name}</span>)}
        </div>
      </div>
    </section>
  );
}

function Features({ p }: { p: any }) {
  const cols = { "2": "md:grid-cols-2", "3": "md:grid-cols-2 lg:grid-cols-3", "4": "md:grid-cols-2 lg:grid-cols-4" }[String(p.columns)] || "lg:grid-cols-3";
  return (
    <Sec bg={p.background}>
      <Head title={p.title} subtitle={p.subtitle} />
      <div className={`grid gap-5 ${cols}`}>
        {(p.items || []).map((x: any, i: number) => (
          <div key={i} className="lp-card p-6">
            {x.image ? <img src={x.image} alt="" loading="lazy" className="mb-4 h-40 w-full rounded-xl object-cover" />
              : <div className="lp-icon mb-4"><LandingIcon name={x.icon} className="h-5 w-5" /></div>}
            <h3 className="font-semibold text-[1.08rem] text-slate-900">{x.title}</h3>
            {x.text && <p className="mt-2 text-[.95rem] leading-relaxed text-slate-600">{x.text}</p>}
          </div>
        ))}
      </div>
    </Sec>
  );
}

function Split({ p, ctx }: { p: any; ctx: Ctx }) {
  return (
    <Sec bg={p.background}>
      <div className={`grid items-center gap-12 lg:grid-cols-2 ${p.imageSide === "left" ? "lg:[&>*:first-child]:order-2" : ""}`}>
        <div>
          <h2 className="lp-h2">{p.title}</h2>
          {p.text && <p className="lp-sub mt-4 whitespace-pre-line">{p.text}</p>}
          {!!p.bullets?.length && (
            <ul className="mt-6 space-y-3">
              {p.bullets.filter((x: any) => x.text).map((x: any, i: number) => (
                <li key={i} className="flex items-start gap-3"><span className="mt-0.5 h-5 w-5 rounded-full grid place-items-center text-white shrink-0" style={{ background: "var(--lp)" }}><Check className="h-3 w-3" /></span><span>{x.text}</span></li>
              ))}
            </ul>
          )}
          <div className="mt-8"><Cta p={p} ctx={ctx} /></div>
        </div>
        <div>{p.image ? <img src={p.image} alt={p.imageAlt || ""} loading="lazy" className="w-full rounded-3xl object-contain max-h-[520px]" /> : <ChatMock />}</div>
      </div>
    </Sec>
  );
}

function Steps({ p }: { p: any }) {
  return (
    <Sec bg={p.background}>
      <Head title={p.title} />
      <ol className="grid gap-6 md:grid-cols-3">
        {(p.items || []).map((x: any, i: number) => (
          <li key={i} className="relative pl-14">
            <span className="absolute left-0 top-0 h-10 w-10 rounded-full grid place-items-center font-bold text-white" style={{ background: "var(--lp)" }}>{i + 1}</span>
            <h3 className="font-semibold text-lg">{x.title}</h3>
            {x.text && <p className="mt-1.5 text-slate-600 leading-relaxed">{x.text}</p>}
          </li>
        ))}
      </ol>
    </Sec>
  );
}

function Stats({ p }: { p: any }) {
  return (
    <Sec bg={p.background}>
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 text-center" style={{ gridTemplateColumns: `repeat(auto-fit,minmax(180px,1fr))` }}>
        {(p.items || []).map((x: any, i: number) => (
          <div key={i}>
            <div className="text-5xl font-extrabold tracking-tight">{x.value}</div>
            <div className="mt-2 opacity-80">{x.label}</div>
          </div>
        ))}
      </div>
    </Sec>
  );
}

function Cards({ p, ctx }: { p: any; ctx: Ctx }) {
  return (
    <Sec bg={p.background}>
      <Head title={p.title} subtitle={p.subtitle} />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {(p.items || []).map((x: any, i: number) => {
          const body = (
            <>
              {x.image ? <img src={x.image} alt={x.alt || x.title || ""} loading="lazy" className="h-44 w-full object-cover rounded-t-[17px]" /> : <div className="h-2 rounded-t-[17px]" style={{ background: "var(--lp)" }} />}
              <div className="p-6">
                <h3 className="font-semibold text-lg text-slate-900">{x.title}</h3>
                {x.text && <p className="mt-2 text-slate-600 leading-relaxed">{x.text}</p>}
                {x.link && <span className="mt-4 inline-block font-semibold" style={{ color: "var(--lp)" }}>Learn more</span>}
              </div>
            </>
          );
          return x.link
            ? <a key={i} href={x.link} onClick={(e) => ctx.editing && e.preventDefault()} className="lp-card block overflow-hidden hover:shadow-lg transition-shadow">{body}</a>
            : <div key={i} className="lp-card overflow-hidden">{body}</div>;
        })}
      </div>
    </Sec>
  );
}

function Industries({ p, ctx }: { p: any; ctx: Ctx }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/landing/index${p.category ? `?category=${encodeURIComponent(p.category)}` : ""}`).then((r) => r.json()).then((j) => live && setRows(j.data || [])).catch(() => live && setRows([]));
    return () => { live = false; };
  }, [p.category]);
  const list = (rows || []).filter((r) => r.slug !== ctx.slug);
  return (
    <Sec bg={p.background}>
      <Head title={p.title} subtitle={p.subtitle} />
      {rows === null ? <div className="text-center text-slate-500"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
        : !list.length ? <p className="text-center text-slate-500">{ctx.editing ? "Publish pages with a category and they will show up here." : ""}</p>
        : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((r) => (
              <a key={r.slug} href={`/${r.slug}`} onClick={(e) => ctx.editing && e.preventDefault()} className="lp-card p-5 flex gap-4 items-start hover:shadow-md transition-shadow">
                <div className="lp-icon shrink-0"><LandingIcon name={CATEGORY_ICON[r.category] || "Sparkles"} className="h-5 w-5" /></div>
                <div>
                  <div className="text-xs font-medium" style={{ color: "var(--lp)" }}>{r.category}</div>
                  <div className="font-semibold text-slate-900">{r.title}</div>
                  {r.metaDescription && <p className="mt-1 text-sm text-slate-600 line-clamp-2">{r.metaDescription}</p>}
                </div>
              </a>
            ))}
          </div>
        )}
    </Sec>
  );
}
export const CATEGORY_ICON: Record<string, string> = {
  Healthcare: "Stethoscope", "E-commerce": "ShoppingCart", Education: "GraduationCap", "Real Estate": "Home", Travel: "Plane",
  Restaurants: "Utensils", "Finance & Insurance": "CreditCard", Automotive: "Car", "Beauty & Salon": "Sparkles", Agencies: "Megaphone",
  Retail: "Store", Events: "CalendarCheck", Logistics: "Truck", "Ads campaign": "Target", Other: "Globe",
};

function Testimonials({ p }: { p: any }) {
  return (
    <Sec bg={p.background}>
      <Head title={p.title} />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {(p.items || []).map((x: any, i: number) => (
          <figure key={i} className="lp-card p-6 flex flex-col">
            <Quote className="h-6 w-6 mb-3" style={{ color: "var(--lp)" }} />
            <blockquote className="text-[1.02rem] leading-relaxed text-slate-700 flex-1">{x.quote}</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              {x.avatar ? <img src={x.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                : <span className="h-10 w-10 rounded-full grid place-items-center font-semibold" style={{ background: "var(--lp-soft2)", color: "var(--lp-deep)" }}>{String(x.name || "?").slice(0, 1)}</span>}
              <span><span className="block font-semibold text-slate-900">{x.name}</span><span className="block text-sm text-slate-500">{x.role}</span></span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Sec>
  );
}

function Pricing({ p, ctx }: { p: any; ctx: Ctx }) {
  return (
    <Sec bg={p.background}>
      <Head title={p.title} subtitle={p.subtitle} />
      <div className="grid gap-5 justify-center" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(250px,330px))" }}>
        {(p.items || []).map((x: any, i: number) => (
          <div key={i} className="lp-card p-7 flex flex-col" style={x.highlight ? { borderColor: "var(--lp)", borderWidth: 2, boxShadow: "0 24px 50px -28px var(--lp)" } : undefined}>
            <div className="flex items-center justify-between"><h3 className="font-semibold text-lg text-slate-900">{x.name}</h3>{x.highlight && <span className="text-xs font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: "var(--lp)" }}>Popular</span>}</div>
            <div className="mt-4"><span className="text-4xl font-extrabold text-slate-900">{x.price}</span>{x.period && <span className="text-slate-500"> / {x.period}</span>}</div>
            <ul className="mt-6 space-y-2.5 flex-1">
              {String(x.features || "").split("\n").filter(Boolean).map((f: string, j: number) => (
                <li key={j} className="flex gap-2 text-slate-700"><Check className="h-4 w-4 mt-1 shrink-0" style={{ color: "var(--lp)" }} />{f}</li>
              ))}
            </ul>
            {x.ctaText && <div className="mt-7"><Cta p={{ ctaText: x.ctaText, ctaAction: "form" }} ctx={ctx} className={`lp-btn w-full justify-center ${x.highlight ? "lp-btn-primary" : "lp-btn-ghost"}`} /></div>}
          </div>
        ))}
      </div>
    </Sec>
  );
}

function Faq({ p }: { p: any }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Sec bg={p.background}>
      <Head title={p.title} />
      <div className="max-w-3xl mx-auto divide-y divide-slate-200 lp-card">
        {(p.items || []).map((x: any, i: number) => (
          <div key={i}>
            <button type="button" className="w-full flex items-center justify-between gap-4 text-left px-6 py-5 font-semibold text-slate-900" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              {x.q}<ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
            </button>
            {open === i && <p className="px-6 pb-5 -mt-1 text-slate-600 leading-relaxed whitespace-pre-line">{x.a}</p>}
          </div>
        ))}
      </div>
    </Sec>
  );
}

function CtaBanner({ p, ctx }: { p: any; ctx: Ctx }) {
  return (
    <Sec bg={p.background}>
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="lp-h2">{p.title}</h2>
        {p.text && <p className="lp-sub mt-3 mx-auto">{p.text}</p>}
        <div className="mt-8 flex justify-center"><Cta p={p} ctx={ctx} /></div>
      </div>
    </Sec>
  );
}

function LeadForm({ p, ctx, first }: { p: any; ctx: Ctx; first: boolean }) {
  const [f, setF] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState("");
  const options = String(p.serviceOptions || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const set = (k: string) => (e: any) => setF((o) => ({ ...o, [k]: e.target.value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (ctx.editing || !ctx.slug) return;
    setErr(""); setState("sending");
    try {
      const r = await fetch(`/api/landing/${ctx.slug}/lead`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, utm: readUtm() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not send. Please try again.");
      trackLead(ctx.settings);
      setState("done");
      if (ctx.settings.thankYouUrl) setTimeout(() => { window.location.href = ctx.settings.thankYouUrl!; }, 900);
    } catch (e: any) { setErr(e.message); setState("idle"); }
  }
  const form = state === "done" ? (
    <div className="lp-card p-8 text-center">
      <div className="mx-auto h-14 w-14 rounded-full grid place-items-center text-white mb-4" style={{ background: "var(--lp)" }}><Check className="h-7 w-7" /></div>
      <p className="text-lg font-semibold text-slate-900 whitespace-pre-line">{p.successText || "Thank you!"}</p>
    </div>
  ) : (
    <form onSubmit={submit} className="lp-card p-6 sm:p-8 space-y-4 text-slate-800" noValidate={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="text-sm font-medium">Name</span><input required className="lp-input mt-1" autoComplete="name" value={f.name || ""} onChange={set("name")} /></label>
        <label className="block"><span className="text-sm font-medium">Phone / WhatsApp</span><input required type="tel" inputMode="tel" className="lp-input mt-1" autoComplete="tel" value={f.phone || ""} onChange={set("phone")} /></label>
        {p.askEmail && <label className="block"><span className="text-sm font-medium">Email</span><input type="email" className="lp-input mt-1" autoComplete="email" value={f.email || ""} onChange={set("email")} /></label>}
        {p.askCompany && <label className="block"><span className="text-sm font-medium">Business name</span><input className="lp-input mt-1" autoComplete="organization" value={f.company || ""} onChange={set("company")} /></label>}
        {p.askCity && <label className="block"><span className="text-sm font-medium">City</span><input className="lp-input mt-1" autoComplete="address-level2" value={f.city || ""} onChange={set("city")} /></label>}
        {p.serviceLabel && options.length > 0 && (
          <label className="block"><span className="text-sm font-medium">{p.serviceLabel}</span>
            <select className="lp-input mt-1" value={f.service || ""} onChange={set("service")}><option value="">Select</option>{options.map((o) => <option key={o}>{o}</option>)}</select>
          </label>
        )}
      </div>
      {p.askMessage && <label className="block"><span className="text-sm font-medium">Message</span><textarea rows={3} className="lp-input mt-1" value={f.message || ""} onChange={set("message")} /></label>}
      <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website || ""} onChange={set("website")} name="website" />
      {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
      <button type="submit" className="lp-btn lp-btn-primary w-full justify-center" disabled={state === "sending"}>
        {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}{p.submitText || "Submit"}
      </button>
      <p className="text-xs text-slate-500 text-center">We'll only use your details to contact you about this enquiry.</p>
    </form>
  );
  return (
    <Sec bg={p.background} id={first ? "lp-form" : undefined}>
      <div className={p.image ? "grid items-center gap-12 lg:grid-cols-2" : "max-w-2xl mx-auto"}>
        <div className={p.image ? "" : "text-center"}>
          {p.title && <h2 className="lp-h2">{p.title}</h2>}
          {p.text && <p className={`lp-sub mt-3 ${p.image ? "" : "mx-auto"}`}>{p.text}</p>}
          {p.image && <img src={p.image} alt="" className="mt-8 w-full rounded-3xl object-cover max-h-[360px]" />}
        </div>
        <div className={p.image ? "" : "mt-8 text-left"}>{form}</div>
      </div>
    </Sec>
  );
}

function ImageBlock({ p, ctx }: { p: any; ctx: Ctx }) {
  if (!p.image) return <Sec bg={p.background}><div className="aspect-[16/7] rounded-3xl border-2 border-dashed border-slate-300 grid place-items-center text-slate-400 text-sm">{ctx.editing ? "Upload an image in the panel on the right" : ""}</div></Sec>;
  const img = <img src={p.image} alt={p.alt || ""} loading="lazy" className={`w-full h-auto ${p.width === "full" ? "" : "rounded-3xl"}`} />;
  const linked = p.link ? <a href={p.link} onClick={(e) => ctx.editing && e.preventDefault()}>{img}</a> : img;
  const fig = <figure>{linked}{p.caption && <figcaption className="mt-3 text-center text-sm text-slate-500">{p.caption}</figcaption>}</figure>;
  if (p.width === "full") return <section className={`lp-bg-${p.background || "white"}`}>{fig}</section>;
  return <Sec bg={p.background}><div className={p.width === "wide" ? "" : "max-w-4xl mx-auto"}>{fig}</div></Sec>;
}

function Gallery({ p, ctx }: { p: any; ctx: Ctx }) {
  const cols = { "2": "sm:grid-cols-2", "3": "sm:grid-cols-2 lg:grid-cols-3", "4": "sm:grid-cols-2 lg:grid-cols-4" }[String(p.columns)] || "sm:grid-cols-3";
  const ratio = { square: "aspect-square", portrait: "aspect-[4/5]", landscape: "aspect-[4/3]" }[String(p.shape)] || "aspect-[4/3]";
  const [zoom, setZoom] = useState<any>(null);
  return (
    <Sec bg={p.background}>
      <Head title={p.title} subtitle={p.subtitle} />
      <div className={`grid gap-5 ${cols}`}>
        {(p.items || []).map((x: any, i: number) => (
          <figure key={i}>
            {x.image ? (
              <button type="button" className={`block w-full ${ratio} overflow-hidden rounded-2xl bg-slate-100`} onClick={() => !ctx.editing && setZoom(x)} aria-label={x.caption || x.alt || "Open photo"}>
                <img src={x.image} alt={x.alt || x.caption || ""} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
              </button>
            ) : <div className={`${ratio} rounded-2xl border-2 border-dashed border-slate-300 grid place-items-center text-xs text-slate-400`}>{ctx.editing ? "Add a photo" : ""}</div>}
            {x.caption && <figcaption className="mt-2.5 text-center text-sm font-medium opacity-80">{x.caption}</figcaption>}
          </figure>
        ))}
      </div>
      {zoom && (
        <div role="dialog" aria-modal="true" aria-label={zoom.caption || "Photo"} className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          <img src={zoom.image} alt={zoom.alt || ""} className="max-h-[88vh] max-w-full rounded-xl" />
        </div>
      )}
    </Sec>
  );
}

function ytId(u: string) {
  const m = String(u || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m?.[1];
}
function Video({ p }: { p: any }) {
  const id = ytId(p.url);
  return (
    <Sec bg={p.background}>
      <Head title={p.title} />
      <div className="max-w-4xl mx-auto aspect-video rounded-3xl overflow-hidden bg-slate-900 shadow-xl">
        {id ? <iframe className="w-full h-full" src={`https://www.youtube-nocookie.com/embed/${id}`} title={p.title || "Video"} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
          : <div className="w-full h-full grid place-items-center text-slate-400 text-sm">Paste a YouTube link</div>}
      </div>
    </Sec>
  );
}

function RichText({ p }: { p: any }) {
  return <Sec bg={p.background}><div className="lp-rich max-w-3xl mx-auto" dangerouslySetInnerHTML={{ __html: p.html || "" }} /></Sec>;
}

export function LandingBlock({ block, ctx, firstForm }: { block: Block; ctx: Ctx; firstForm?: boolean }) {
  const p = block.props || {};
  switch (block.type) {
    case "hero": return <Hero p={p} ctx={ctx} />;
    case "logos": return <Logos p={p} />;
    case "features": return <Features p={p} />;
    case "split": return <Split p={p} ctx={ctx} />;
    case "steps": return <Steps p={p} />;
    case "stats": return <Stats p={p} />;
    case "cards": return <Cards p={p} ctx={ctx} />;
    case "industries": return <Industries p={p} ctx={ctx} />;
    case "testimonials": return <Testimonials p={p} />;
    case "pricing": return <Pricing p={p} ctx={ctx} />;
    case "faq": return <Faq p={p} />;
    case "cta": return <CtaBanner p={p} ctx={ctx} />;
    case "form": return <LeadForm p={p} ctx={ctx} first={!!firstForm} />;
    case "video": return <Video p={p} />;
    case "image": return <ImageBlock p={p} ctx={ctx} />;
    case "gallery": return <Gallery p={p} ctx={ctx} />;
    case "text": return <RichText p={p} />;
    default: return null;
  }
}

export function landingStyle(settings: LandingSettings): CSSProperties {
  return { ["--lp" as any]: settings.primary || DEFAULT_PRIMARY };
}
export const LandingCss = () => <style>{CSS}</style>;

/** Public renderer. `wrap` lets the editor wrap each section with selection chrome. */
export default function LandingRenderer({ blocks, settings = {}, slug, editing = false, wrap }: {
  blocks: Block[]; settings?: LandingSettings; slug?: string; editing?: boolean;
  wrap?: (block: Block, index: number, node: ReactNode) => ReactNode;
}) {
  const primary = settings.primary || DEFAULT_PRIMARY;
  const ctx = useMemo<Ctx>(() => ({ settings, slug, editing, primary }), [settings, slug, editing, primary]);
  useTracking(settings, !editing);
  useEffect(() => {
    if (editing || !slug) return;
    readUtm();
    fetch(`/api/landing/${slug}/view`, { method: "POST" }).catch(() => {});
  }, [editing, slug]);
  const visible = editing ? blocks : blocks.filter((b) => !b.hidden);
  const firstFormId = visible.find((b) => b.type === "form" && !b.hidden)?.id;
  return (
    <div className="lp" style={landingStyle(settings)}>
      <LandingCss />
      {visible.map((b, i) => {
        const node = <LandingBlock key={b.id} block={b} ctx={ctx} firstForm={b.id === firstFormId} />;
        return wrap ? <div key={b.id}>{wrap(b, i, node)}</div> : node;
      })}
      {settings.whatsappNumber && (
        <a className="lp-wa" aria-label="Chat on WhatsApp" target="_blank" rel="noopener noreferrer" onClick={(e) => editing && e.preventDefault()}
          href={`https://wa.me/${settings.whatsappNumber}${settings.whatsappText ? `?text=${encodeURIComponent(settings.whatsappText)}` : ""}`}
          style={editing ? { position: "absolute" } : undefined}>
          <MessageCircle className="h-7 w-7" />
        </a>
      )}
    </div>
  );
}
