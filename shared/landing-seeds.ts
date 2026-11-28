/**
 * Two complete, ready-to-publish landing pages (E-commerce, Doctors & clinics).
 * Used as builder templates and seeded once on first start. Images live in client/public/landing.
 */
import { newBlock as b, type Block, type LandingSettings } from "./landing";

export interface LandingSeo { slug: string; title: string; metaTitle: string; metaDescription: string; metaKeywords?: string; ogImage?: string }
export interface FullTemplate { key: string; name: string; category: string; description: string; settings?: LandingSettings; seo: LandingSeo; blocks: () => Block[] }

export const DOCTORS_PAGE: FullTemplate = {
  key: "doctors-full", name: "Doctors & clinics (complete)", category: "Healthcare",
  description: "Full page with images: booking bot, reminders, reports, gallery, FAQ and lead form",
  seo: {
    slug: "whatsapp-for-doctors",
    title: "WhatsApp for Doctors & Clinics",
    metaTitle: "WhatsApp for Doctors & Clinics — Appointments, Reminders, Reports",
    metaDescription: "Let patients book appointments 24×7 on WhatsApp, cut no-shows with automatic reminders and share reports securely. Setup in 10 minutes.",
    metaKeywords: "whatsapp for doctors, clinic appointment booking whatsapp, patient reminders, whatsapp business api healthcare",
    ogImage: "/landing/doc-hero.webp",
  },
  settings: { primary: "#0b7285" },
  blocks: () => [
    b("hero", {
      headline: "Patients book, confirm and get reports — all on WhatsApp",
      subheadline: "A 24×7 booking assistant for your clinic. Automatic reminders cut no-shows, and reports reach patients in seconds — without extra calls at the reception.",
      ctaText: "Book a free demo", ctaAction: "form", secondaryText: "", secondaryLink: "",
      image: "/landing/doc-hero.webp", imageAlt: "WhatsApp chat where a patient books an appointment with Dr. Mehta",
      points: [{ text: "Official WhatsApp Business API" }, { text: "Keep your clinic number" }, { text: "Hindi & English" }], background: "soft",
    }),
    b("logos", { title: "Trusted by clinics, diagnostic labs and hospitals", items: [{ name: "CareWell Clinic", image: "" }, { name: "Sunrise Diagnostics", image: "" }, { name: "Smile Dental", image: "" }, { name: "City Kids Care", image: "" }, { name: "Prime Ortho", image: "" }] }),
    b("features", { title: "Everything your front desk does — automated", subtitle: "Patients already use WhatsApp. Meet them there.", columns: "3", background: "white", items: [
      { icon: "CalendarCheck", image: "", title: "24×7 appointment booking", text: "Patients pick the doctor, date and slot inside WhatsApp — even at midnight." },
      { icon: "Bell", image: "", title: "Automatic reminders", text: "A reminder a day before and two hours before, with one-tap confirm or reschedule." },
      { icon: "FileText", image: "", title: "Reports & prescriptions", text: "Send lab reports, prescriptions and invoices as PDFs the moment they're ready." },
      { icon: "HeartPulse", image: "", title: "Follow-ups that happen", text: "Check in after treatment and remind patients when their next visit is due." },
      { icon: "Users", image: "", title: "Shared inbox for staff", text: "Reception, doctors and billing reply from one number, with chat assignment." },
      { icon: "Shield", image: "", title: "Private and secure", text: "End-to-end encrypted chats on the official API. No personal phones needed." },
    ] }),
    b("split", {
      title: "Fewer empty slots, calmer reception",
      text: "Most no-shows simply forget. WhatsApp reminders get read within minutes, and patients confirm or reschedule with one tap — so you can give the slot to someone else.",
      bullets: [{ text: "Reminders 24 hours and 2 hours before" }, { text: "One-tap confirm, reschedule or cancel" }, { text: "Freed slots go to your waiting list" }],
      image: "/landing/doc-reminder.webp", imageAlt: "WhatsApp appointment reminder with confirm and reschedule buttons and a shared lab report",
      imageSide: "left", ctaText: "Start reducing no-shows", ctaAction: "form", background: "soft",
    }),
    b("stats", { background: "brand", items: [{ value: "45%", label: "Fewer no-shows" }, { value: "24×7", label: "Booking, even after hours" }, { value: "3 min", label: "Average reply time" }, { value: "60%", label: "Fewer calls at reception" }] }),
    b("steps", { title: "Live in three steps", background: "white", items: [
      { title: "Connect your clinic number", text: "Use your current number or a new one. We set up the official WhatsApp Business API with you." },
      { title: "Add doctors and timings", text: "Enter each doctor's days, slots and consultation fee. Holidays are blocked automatically." },
      { title: "Share your WhatsApp link", text: "Put it on your Google Business Profile, website and prescriptions. Bookings start coming in." },
    ] }),
    b("gallery", { title: "What patients see", subtitle: "Simple, familiar WhatsApp chats — no app to download.", columns: "3", shape: "landscape", background: "soft", items: [
      { image: "/landing/doc-g1.webp", alt: "Patient choosing a department on WhatsApp", caption: "Choose doctor & department" },
      { image: "/landing/doc-g2.webp", alt: "Clinic checking on a patient after a visit", caption: "Follow-up after the visit" },
      { image: "/landing/doc-g3.webp", alt: "Prescription PDF shared on WhatsApp", caption: "Prescriptions as PDF" },
    ] }),
    b("cards", { title: "Built for every kind of practice", subtitle: "", background: "white", items: [
      { title: "Clinics & polyclinics", text: "Doctor-wise slots, walk-in tokens and fee reminders.", image: "", alt: "", link: "" },
      { title: "Diagnostic labs", text: "Home sample collection booking and instant report delivery.", image: "", alt: "", link: "" },
      { title: "Dental & skin clinics", text: "Treatment plans, session reminders and follow-ups.", image: "", alt: "", link: "" },
    ] }),
    b("testimonials", { title: "Doctors who switched", background: "soft", items: [
      { quote: "Our no-shows dropped by almost half in the first month. Patients love confirming with one tap.", name: "Dr. Priya Mehta", role: "Physician, Noida", avatar: "" },
      { quote: "Reports used to take ten calls a day. Now they go out on WhatsApp the moment they're signed.", name: "Rohit Kapoor", role: "Manager, Sunrise Diagnostics", avatar: "" },
      { quote: "Night-time bookings were a surprise — 30% of our appointments now come after 9 PM.", name: "Dr. Sana Qureshi", role: "Dentist, Delhi", avatar: "" },
    ] }),
    b("faq", { title: "Questions doctors ask", background: "white", items: [
      { q: "Can I use my clinic's existing WhatsApp number?", a: "Yes. We move your number to the official WhatsApp Business API, so patients keep messaging the number they already know." },
      { q: "Do patients need to install anything?", a: "No. Everything works inside the WhatsApp they already use." },
      { q: "Is patient data safe?", a: "Chats are end-to-end encrypted on WhatsApp's official API, and only your staff can see them in the dashboard." },
      { q: "Can it work with my clinic software?", a: "Yes — bookings can sync through our API or Google Sheets. Our team helps you connect it." },
      { q: "How much does it cost?", a: "Plans start at a low monthly fee. WhatsApp's own message charges are billed by Meta at actual cost." },
    ] }),
    b("form", {
      title: "Get your clinic on WhatsApp", text: "Leave your details — our healthcare specialist will call you within 30 minutes on working days.",
      askEmail: true, askCompany: true, askCity: true, askMessage: false,
      serviceLabel: "What do you need most?", serviceOptions: "Appointment booking\nReminders\nReport delivery\nAll of these",
      submitText: "Request a call back", successText: "Thank you! Our healthcare team will call you shortly.", image: "", background: "soft",
    }),
  ],
};

export const ECOMMERCE_PAGE: FullTemplate = {
  key: "ecommerce-full", name: "E-commerce & D2C (complete)", category: "E-commerce",
  description: "Full page with images: catalog, cart recovery, order updates, gallery, pricing, FAQ and lead form",
  seo: {
    slug: "whatsapp-for-ecommerce",
    title: "WhatsApp for E-commerce",
    metaTitle: "WhatsApp for E-commerce — Recover Carts, Confirm COD, Sell More",
    metaDescription: "Recover abandoned carts, confirm COD orders and send shipping updates on WhatsApp. Works with Shopify and WooCommerce. Start in 10 minutes.",
    metaKeywords: "whatsapp for ecommerce, abandoned cart whatsapp, shopify whatsapp, cod confirmation whatsapp, d2c marketing",
    ogImage: "/landing/ecom-hero.webp",
  },
  settings: { primary: "#e8590c" },
  blocks: () => [
    b("hero", {
      headline: "Turn WhatsApp into your best sales channel",
      subheadline: "Recover abandoned carts, confirm COD orders and send order updates automatically — on the app your customers open many times a day.",
      ctaText: "Start free trial", ctaAction: "form", secondaryText: "", secondaryLink: "",
      image: "/landing/ecom-hero.webp", imageAlt: "WhatsApp chat showing a product catalog and an order confirmation",
      points: [{ text: "Shopify & WooCommerce" }, { text: "No credit card needed" }, { text: "Live in 10 minutes" }], background: "soft",
    }),
    b("logos", { title: "Growing brands sell on WhatsApp with us", items: [{ name: "Urban Threads", image: "" }, { name: "GlowKart", image: "" }, { name: "Spice Route", image: "" }, { name: "Little Feet", image: "" }, { name: "HomeNest", image: "" }] }),
    b("features", { title: "From first click to repeat order", subtitle: "Every message your store needs, sent at the right moment.", columns: "3", background: "white", items: [
      { icon: "ShoppingCart", image: "", title: "Abandoned cart recovery", text: "A friendly reminder with the cart and a one-tap checkout link, one hour after they leave." },
      { icon: "CheckCircle2", image: "", title: "COD confirmation", text: "Customers confirm cash-on-delivery orders with one tap — fewer fake orders and RTOs." },
      { icon: "Truck", image: "", title: "Shipping updates", text: "Order placed, shipped, out for delivery and delivered — automatically." },
      { icon: "Megaphone", image: "", title: "Sale broadcasts", text: "Launch offers to opted-in customers with images, buttons and coupon codes." },
      { icon: "Store", image: "", title: "Catalog in chat", text: "Customers browse products and add to cart without leaving WhatsApp." },
      { icon: "Bot", image: "", title: "AI replies 24×7", text: "Answers sizing, delivery and return questions instantly, then hands over to your team." },
    ] }),
    b("split", {
      title: "Get back the sales you're losing at checkout",
      text: "Most shoppers leave without paying. A WhatsApp reminder with their exact cart brings a big share of them back — far more than email does.",
      bullets: [{ text: "Sent automatically one hour later" }, { text: "Shows the products and total" }, { text: "Optional coupon for a second nudge" }],
      image: "/landing/ecom-cart.webp", imageAlt: "Abandoned cart reminder on WhatsApp with a checkout button",
      imageSide: "right", ctaText: "Recover my carts", ctaAction: "form", background: "soft",
    }),
    b("stats", { background: "brand", items: [{ value: "25%", label: "Abandoned carts recovered" }, { value: "40%", label: "Fewer RTOs on COD" }, { value: "60%", label: "Fewer 'where is my order' calls" }, { value: "5×", label: "Campaign ROI vs email" }] }),
    b("gallery", { title: "Messages your customers will love", subtitle: "Useful chats, not spammy texts.", columns: "3", shape: "landscape", background: "white", items: [
      { image: "/landing/ecom-g1.webp", alt: "New arrivals catalog shared on WhatsApp", caption: "New arrivals catalog" },
      { image: "/landing/ecom-g2.webp", alt: "Shipping update with a track shipment button", caption: "Shipping updates" },
      { image: "/landing/ecom-g3.webp", alt: "UPI payment link sent on WhatsApp", caption: "Payment links" },
    ] }),
    b("steps", { title: "Set up in three steps", background: "soft", items: [
      { title: "Connect your store", text: "Install our Shopify or WooCommerce app — or use our API for custom stores." },
      { title: "Switch on automations", text: "Turn on cart recovery, COD confirmation and shipping updates. Templates are ready." },
      { title: "Launch your first campaign", text: "Send your next sale to opted-in customers and watch orders come in." },
    ] }),
    b("testimonials", { title: "Brands that grew with WhatsApp", background: "white", items: [
      { quote: "Cart recovery alone pays for the whole plan many times over. It runs without anyone touching it.", name: "Rahul Sharma", role: "Founder, Urban Threads", avatar: "" },
      { quote: "COD confirmations cut our RTO almost in half within six weeks.", name: "Neha Gupta", role: "Ops head, GlowKart", avatar: "" },
      { quote: "Our Diwali broadcast had a 94% open rate. Email never came close.", name: "Arjun Malhotra", role: "Marketing, Spice Route", avatar: "" },
    ] }),
    b("pricing", { title: "Plans that grow with your store", subtitle: "WhatsApp message charges are billed by Meta at actual cost.", background: "soft", items: [
      { name: "Starter", price: "₹999", period: "month", features: "1 WhatsApp number\nCart recovery\nOrder updates\nTeam inbox (2 users)", ctaText: "Start free trial", highlight: false },
      { name: "Growth", price: "₹2,499", period: "month", features: "Everything in Starter\nCOD confirmation\nBroadcast campaigns\nAI replies\n5 team users", ctaText: "Start free trial", highlight: true },
      { name: "Scale", price: "Custom", period: "", features: "Multiple numbers\nAPI & custom flows\nDedicated manager", ctaText: "Talk to sales", highlight: false },
    ] }),
    b("faq", { title: "Frequently asked questions", background: "white", items: [
      { q: "Does it work with Shopify and WooCommerce?", a: "Yes. Connect in a few clicks and cart, order and shipping events start sending automatically. Custom stores can use our API." },
      { q: "Will customers find these messages spammy?", a: "Messages only go to customers who opted in, and each one is useful — their cart, their order, their delivery. Anyone can reply STOP to opt out." },
      { q: "What does WhatsApp charge per message?", a: "Meta charges per conversation, depending on the type (marketing, utility, service). We pass it on at actual cost." },
      { q: "Can I send broadcasts with images and coupons?", a: "Yes — images, videos, buttons, coupon codes and product catalogs are all supported." },
      { q: "Is there a free trial?", a: "Yes, try every feature free for 14 days. No credit card needed." },
    ] }),
    b("cta", { title: "Ready to sell more on WhatsApp?", text: "Join brands recovering lost carts every single day.", ctaText: "Start free trial", ctaAction: "form", background: "brand" }),
    b("form", {
      title: "Get a free demo for your store", text: "Tell us about your store — we'll show you how much revenue WhatsApp can bring back.",
      askEmail: true, askCompany: true, askCity: false, askMessage: false,
      serviceLabel: "Your store runs on", serviceOptions: "Shopify\nWooCommerce\nCustom website\nOther",
      submitText: "Book my demo", successText: "Thanks! Our e-commerce expert will contact you shortly.", image: "", background: "soft",
    }),
  ],
};

export const FULL_TEMPLATES: FullTemplate[] = [ECOMMERCE_PAGE, DOCTORS_PAGE];
