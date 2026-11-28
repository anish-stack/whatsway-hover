/**
 * Landing page builder — section types, their editable fields, and starter templates
 * (industry pages like Healthcare / E-commerce / Education, and Google Ads lead pages).
 * Shared by the admin editor, the public renderer and the server validator.
 */

export type FieldKind = "text" | "textarea" | "url" | "image" | "select" | "toggle" | "number" | "icon" | "list" | "html";
export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options?: Array<{ value: string; label: string }>;
  item?: FieldDef[]; // for lists
  max?: number; // list max items / text max chars
  help?: string;
  placeholder?: string;
}

export interface Block { id: string; type: BlockType; props: Record<string, any>; hidden?: boolean }

export interface LandingSettings {
  hideChrome?: boolean; // hide the site header/footer (focused ad landing page)
  primary?: string; // hex
  whatsappNumber?: string; // floating WhatsApp button
  whatsappText?: string;
  googleAdsId?: string; // AW-123456789
  googleAdsLabel?: string; // conversion label fired on lead submit
  ga4Id?: string; // G-XXXX
  metaPixelId?: string;
  thankYouUrl?: string; // redirect after lead submit (optional)
  notifyEmails?: string; // extra comma-separated emails for leads
}

export const LANDING_CATEGORIES = [
  "Healthcare", "E-commerce", "Education", "Real Estate", "Travel", "Restaurants", "Finance & Insurance",
  "Automotive", "Beauty & Salon", "Agencies", "Retail", "Events", "Logistics", "Ads campaign", "Other",
] as const;

export const ICON_CHOICES = [
  "MessageCircle", "Megaphone", "Bot", "Zap", "Users", "ShoppingCart", "CalendarCheck", "Bell", "CreditCard", "BarChart3",
  "Shield", "Clock", "HeartPulse", "Stethoscope", "GraduationCap", "Home", "Plane", "Utensils", "Car", "Sparkles",
  "Truck", "Store", "Repeat", "Send", "Target", "Globe", "Headphones", "FileText", "Gift", "Star", "CheckCircle2",
] as const;

const ctaFields: FieldDef[] = [
  { key: "ctaText", label: "Button text", kind: "text", max: 40 },
  { key: "ctaAction", label: "Button opens", kind: "select", options: [
    { value: "form", label: "Lead form on this page" }, { value: "whatsapp", label: "WhatsApp chat" },
    { value: "link", label: "A link" }, { value: "signup", label: "Sign-up page" },
  ] },
  { key: "ctaLink", label: "Link (when 'A link')", kind: "url" },
];

const BG = { key: "background", label: "Background", kind: "select" as const, options: [
  { value: "white", label: "White" }, { value: "soft", label: "Soft tint" }, { value: "brand", label: "Brand colour" }, { value: "dark", label: "Dark" },
] };

export const BLOCKS = {
  hero: {
    label: "Hero", group: "Intro", hint: "Big headline, subtext, buttons and an image",
    fields: [
      { key: "headline", label: "Headline", kind: "textarea", max: 140 },
      { key: "subheadline", label: "Subheadline", kind: "textarea", max: 400 },
      ...ctaFields,
      { key: "secondaryText", label: "Second button text", kind: "text", max: 40 },
      { key: "secondaryLink", label: "Second button link", kind: "url" },
      { key: "image", label: "Side image", kind: "image", help: "Empty shows a WhatsApp chat preview" },
      { key: "imageAlt", label: "Side image description (alt text, for Google)", kind: "text", max: 140 },
      { key: "layout", label: "Layout", kind: "select", options: [{ value: "right", label: "Image right" }, { value: "left", label: "Image left" }, { value: "center", label: "Centered" }] },
      { key: "bgImage", label: "Background image (optional)", kind: "image" },
      { key: "overlay", label: "Background shade", kind: "select", options: [{ value: "dark", label: "Dark (white text)" }, { value: "brand", label: "Brand colour (white text)" }, { value: "light", label: "Light (dark text)" }] },
      { key: "points", label: "Trust points under buttons", kind: "list", max: 4, item: [{ key: "text", label: "Text", kind: "text", max: 60 }] },
      BG,
    ] as FieldDef[],
    defaults: {
      headline: "Grow your business on WhatsApp", subheadline: "Send offers, answer customers and take orders automatically — all from one dashboard.",
      ctaText: "Get started free", ctaAction: "form", secondaryText: "Talk to us", secondaryLink: "#lp-form", image: "", imageAlt: "", layout: "right", bgImage: "", overlay: "dark",
      points: [{ text: "Official WhatsApp Business API" }, { text: "Setup in 10 minutes" }], background: "soft",
    },
  },
  logos: {
    label: "Logo strip", group: "Proof", hint: "Brands that trust you",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 80 },
      { key: "items", label: "Logos", kind: "list", max: 12, item: [{ key: "image", label: "Logo", kind: "image" }, { key: "name", label: "Brand name", kind: "text", max: 40 }] },
    ] as FieldDef[],
    defaults: { title: "Trusted by growing businesses", items: [{ name: "Brand one", image: "" }, { name: "Brand two", image: "" }, { name: "Brand three", image: "" }, { name: "Brand four", image: "" }] },
  },
  features: {
    label: "Feature grid", group: "Content", hint: "Icons with short benefits",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "subtitle", label: "Subtitle", kind: "textarea", max: 300 },
      { key: "columns", label: "Columns", kind: "select", options: [{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }] },
      { key: "items", label: "Features", kind: "list", max: 12, item: [
        { key: "icon", label: "Icon", kind: "icon" }, { key: "image", label: "Image (replaces icon)", kind: "image" },
        { key: "title", label: "Title", kind: "text", max: 60 }, { key: "text", label: "Text", kind: "textarea", max: 240 },
      ] },
      BG,
    ] as FieldDef[],
    defaults: {
      title: "Everything you need to sell on WhatsApp", subtitle: "", columns: "3", background: "white",
      items: [
        { icon: "Megaphone", title: "Broadcast campaigns", text: "Send offers to thousands of opted-in customers with one click." },
        { icon: "Bot", title: "Chatbot & AI replies", text: "Answer FAQs, qualify leads and book appointments 24×7." },
        { icon: "Users", title: "Shared team inbox", text: "Every agent replies from one number with chat assignment." },
      ],
    },
  },
  split: {
    label: "Image + text", group: "Content", hint: "One benefit explained with an image",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "text", label: "Text", kind: "textarea", max: 800 },
      { key: "bullets", label: "Bullets", kind: "list", max: 6, item: [{ key: "text", label: "Text", kind: "text", max: 120 }] },
      { key: "image", label: "Image", kind: "image" },
      { key: "imageAlt", label: "Image description (alt text)", kind: "text", max: 140 },
      { key: "imageSide", label: "Image side", kind: "select", options: [{ value: "right", label: "Right" }, { value: "left", label: "Left" }] },
      ...ctaFields,
      BG,
    ] as FieldDef[],
    defaults: {
      title: "Reminders that customers actually read", text: "WhatsApp messages get opened within minutes — far more than SMS or email.",
      bullets: [{ text: "98% open rate" }, { text: "Two-way replies" }], image: "", imageSide: "right", ctaText: "", ctaAction: "form", background: "white",
    },
  },
  steps: {
    label: "How it works", group: "Content", hint: "Numbered steps",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "items", label: "Steps", kind: "list", max: 6, item: [{ key: "title", label: "Title", kind: "text", max: 60 }, { key: "text", label: "Text", kind: "textarea", max: 200 }] },
      BG,
    ] as FieldDef[],
    defaults: {
      title: "Live in three steps", background: "soft",
      items: [
        { title: "Connect your number", text: "Link your WhatsApp Business number in a few clicks." },
        { title: "Import contacts", text: "Upload a CSV or sync from your CRM." },
        { title: "Start messaging", text: "Send your first campaign or switch on the chatbot." },
      ],
    },
  },
  stats: {
    label: "Numbers", group: "Proof", hint: "Big results in numbers",
    fields: [
      { key: "items", label: "Numbers", kind: "list", max: 6, item: [{ key: "value", label: "Value", kind: "text", max: 12 }, { key: "label", label: "Label", kind: "text", max: 60 }] },
      BG,
    ] as FieldDef[],
    defaults: { background: "brand", items: [{ value: "98%", label: "Message open rate" }, { value: "3×", label: "More replies than email" }, { value: "45%", label: "Fewer no-shows" }] },
  },
  cards: {
    label: "Use-case cards", group: "Content", hint: "Cards with image, title and link",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "subtitle", label: "Subtitle", kind: "textarea", max: 300 },
      { key: "items", label: "Cards", kind: "list", max: 12, item: [
        { key: "image", label: "Image", kind: "image" }, { key: "alt", label: "Image description (alt)", kind: "text", max: 140 },
        { key: "title", label: "Title", kind: "text", max: 60 },
        { key: "text", label: "Text", kind: "textarea", max: 200 }, { key: "link", label: "Link", kind: "url" },
      ] },
      BG,
    ] as FieldDef[],
    defaults: {
      title: "Built for your use case", subtitle: "", background: "white",
      items: [
        { title: "Appointment reminders", text: "Cut no-shows with automatic reminders.", image: "", link: "" },
        { title: "Order updates", text: "Confirm orders and share tracking instantly.", image: "", link: "" },
        { title: "Lead follow-up", text: "Reply to ad leads in seconds, not hours.", image: "", link: "" },
      ],
    },
  },
  industries: {
    label: "Industry pages grid", group: "Content", hint: "Auto-lists your published pages by category",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "subtitle", label: "Subtitle", kind: "textarea", max: 300 },
      { key: "category", label: "Only this category (blank = all)", kind: "select", options: [{ value: "", label: "All categories" }, ...LANDING_CATEGORIES.map((c) => ({ value: c, label: c }))] },
      BG,
    ] as FieldDef[],
    defaults: { title: "Solutions for every industry", subtitle: "See how businesses like yours use WhatsApp.", category: "", background: "soft" },
  },
  testimonials: {
    label: "Testimonials", group: "Proof", hint: "Customer quotes",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "items", label: "Quotes", kind: "list", max: 9, item: [
        { key: "quote", label: "Quote", kind: "textarea", max: 400 }, { key: "name", label: "Name", kind: "text", max: 60 },
        { key: "role", label: "Role & company", kind: "text", max: 80 }, { key: "avatar", label: "Photo", kind: "image" },
      ] },
      BG,
    ] as FieldDef[],
    defaults: {
      title: "What our customers say", background: "white",
      items: [
        { quote: "Our appointment no-shows dropped by half in the first month.", name: "Dr. Priya Mehta", role: "Clinic owner, Noida", avatar: "" },
        { quote: "We recover abandoned carts on WhatsApp every single day now.", name: "Rahul Sharma", role: "Founder, D2C brand", avatar: "" },
      ],
    },
  },
  pricing: {
    label: "Pricing", group: "Convert", hint: "Plans with features",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "subtitle", label: "Subtitle", kind: "textarea", max: 300 },
      { key: "items", label: "Plans", kind: "list", max: 4, item: [
        { key: "name", label: "Plan", kind: "text", max: 40 }, { key: "price", label: "Price", kind: "text", max: 20 },
        { key: "period", label: "Per", kind: "text", max: 20 }, { key: "features", label: "Features (one per line)", kind: "textarea", max: 800 },
        { key: "ctaText", label: "Button", kind: "text", max: 30 }, { key: "highlight", label: "Highlight", kind: "toggle" },
      ] },
      BG,
    ] as FieldDef[],
    defaults: {
      title: "Simple pricing", subtitle: "WhatsApp conversation charges are billed by Meta.", background: "soft",
      items: [
        { name: "Starter", price: "₹999", period: "month", features: "1 WhatsApp number\nBroadcasts\nTeam inbox", ctaText: "Start now", highlight: false },
        { name: "Growth", price: "₹2,499", period: "month", features: "Everything in Starter\nChatbot & AI\nAutomations", ctaText: "Start now", highlight: true },
      ],
    },
  },
  faq: {
    label: "FAQ", group: "Convert", hint: "Questions and answers",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "items", label: "Questions", kind: "list", max: 15, item: [{ key: "q", label: "Question", kind: "text", max: 200 }, { key: "a", label: "Answer", kind: "textarea", max: 1000 }] },
      BG,
    ] as FieldDef[],
    defaults: {
      title: "Questions, answered", background: "white",
      items: [
        { q: "Do I need a new phone number?", a: "You can use a new number or move your existing one to the WhatsApp Business API." },
        { q: "Is there a free trial?", a: "Yes — you can try every feature free for 14 days." },
      ],
    },
  },
  cta: {
    label: "Call to action", group: "Convert", hint: "Banner with a button",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "text", label: "Text", kind: "textarea", max: 300 },
      ...ctaFields,
      BG,
    ] as FieldDef[],
    defaults: { title: "Ready to grow on WhatsApp?", text: "Book a free demo — we'll set it up with you.", ctaText: "Book a free demo", ctaAction: "form", background: "brand" },
  },
  form: {
    label: "Lead form", group: "Convert", hint: "Collect enquiries from ads",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "text", label: "Text", kind: "textarea", max: 400 },
      { key: "askEmail", label: "Ask email", kind: "toggle" },
      { key: "askCompany", label: "Ask company", kind: "toggle" },
      { key: "askCity", label: "Ask city", kind: "toggle" },
      { key: "askMessage", label: "Ask message", kind: "toggle" },
      { key: "serviceLabel", label: "Choice question (optional)", kind: "text", max: 60, placeholder: "Which service do you need?" },
      { key: "serviceOptions", label: "Choices (one per line)", kind: "textarea", max: 600 },
      { key: "submitText", label: "Button text", kind: "text", max: 40 },
      { key: "successText", label: "Thank-you message", kind: "textarea", max: 300 },
      { key: "image", label: "Side image (optional)", kind: "image" },
      BG,
    ] as FieldDef[],
    defaults: {
      title: "Get a free demo", text: "Leave your details and our team will call you within 30 minutes.", askEmail: true, askCompany: true, askCity: false, askMessage: false,
      serviceLabel: "", serviceOptions: "", submitText: "Request a call back", successText: "Thank you! Our team will contact you shortly.", image: "", background: "soft",
    },
  },
  image: {
    label: "Image", group: "Media", hint: "One big image or banner, with optional link",
    fields: [
      { key: "image", label: "Image", kind: "image" },
      { key: "alt", label: "Image description (alt text, for Google)", kind: "text", max: 140 },
      { key: "caption", label: "Caption (optional)", kind: "text", max: 200 },
      { key: "link", label: "Link when clicked (optional)", kind: "url" },
      { key: "width", label: "Width", kind: "select", options: [{ value: "contained", label: "Contained" }, { value: "wide", label: "Wide" }, { value: "full", label: "Edge to edge" }] },
      BG,
    ] as FieldDef[],
    defaults: { image: "", alt: "", caption: "", link: "", width: "contained", background: "white" },
  },
  gallery: {
    label: "Image gallery", group: "Media", hint: "Grid of photos with captions",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "subtitle", label: "Subtitle", kind: "textarea", max: 300 },
      { key: "columns", label: "Columns", kind: "select", options: [{ value: "3", label: "3" }, { value: "2", label: "2" }, { value: "4", label: "4" }] },
      { key: "shape", label: "Photo shape", kind: "select", options: [{ value: "landscape", label: "Landscape 4:3" }, { value: "square", label: "Square" }, { value: "portrait", label: "Portrait 4:5" }] },
      { key: "items", label: "Photos", kind: "list", max: 16, item: [
        { key: "image", label: "Photo", kind: "image" }, { key: "alt", label: "Description (alt)", kind: "text", max: 140 },
        { key: "caption", label: "Caption", kind: "text", max: 120 },
      ] },
      BG,
    ] as FieldDef[],
    defaults: { title: "Gallery", subtitle: "", columns: "3", shape: "landscape", background: "white", items: [{ image: "", alt: "", caption: "" }, { image: "", alt: "", caption: "" }, { image: "", alt: "", caption: "" }] },
  },
  video: {
    label: "Video", group: "Media", hint: "YouTube video",
    fields: [
      { key: "title", label: "Title", kind: "text", max: 120 },
      { key: "url", label: "YouTube link", kind: "url" },
      BG,
    ] as FieldDef[],
    defaults: { title: "See it in action", url: "", background: "white" },
  },
  text: {
    label: "Text", group: "Content", hint: "Free text with headings and links",
    fields: [{ key: "html", label: "Content", kind: "html" }, BG] as FieldDef[],
    defaults: { html: "<h2>Write anything here</h2><p>Use this for longer explanations, terms or SEO copy.</p>", background: "white" },
  },
} satisfies Record<string, { label: string; group: string; hint: string; fields: FieldDef[]; defaults: Record<string, any> }>;

export type BlockType = keyof typeof BLOCKS;
export const BLOCK_TYPES = Object.keys(BLOCKS) as BlockType[];

export function newBlock(type: BlockType, props?: Record<string, any>): Block {
  const base: Record<string, any> = {};
  for (const f of BLOCKS[type].fields as FieldDef[]) base[f.key] = f.kind === "toggle" ? false : f.kind === "list" ? [] : f.kind === "select" ? f.options?.[0]?.value ?? "" : "";
  return { id: Math.random().toString(36).slice(2, 10), type, props: JSON.parse(JSON.stringify({ ...base, ...BLOCKS[type].defaults, ...(props || {}) })) };
}

// ───────────── starter templates ─────────────

const b = newBlock;
export interface LandingTemplate { key: string; name: string; category: string; description: string; settings?: LandingSettings; blocks: () => Block[] }

export const TEMPLATES: LandingTemplate[] = [
  {
    key: "blank", name: "Blank page", category: "Other", description: "Start with a hero and add sections yourself",
    blocks: () => [b("hero")],
  },
  {
    key: "ads-lead", name: "Google Ads lead page", category: "Ads campaign", description: "Focused page, no menu, form on top — best for paid traffic",
    settings: { hideChrome: true },
    blocks: () => [
      b("hero", { headline: "WhatsApp marketing for your business — live in 10 minutes", subheadline: "Official WhatsApp Business API. Broadcasts, chatbot and team inbox in one simple dashboard.", ctaText: "Get a free demo", ctaAction: "form", secondaryText: "", layout: "right", points: [{ text: "Free setup help" }, { text: "No credit card needed" }, { text: "Hindi & English support" }] }),
      b("logos"),
      b("features"),
      b("stats"),
      b("testimonials"),
      b("form", { title: "Book your free demo", text: "Our expert will call you within 30 minutes on working days." }),
      b("faq"),
    ],
  },
  {
    key: "healthcare", name: "Healthcare & clinics", category: "Healthcare", description: "Appointments, reminders and reports on WhatsApp",
    blocks: () => [
      b("hero", { headline: "WhatsApp for clinics and hospitals", subheadline: "Let patients book appointments, get reminders and receive reports on WhatsApp — and cut no-shows by up to 45%.", ctaText: "Book a demo", points: [{ text: "Appointment booking bot" }, { text: "Automatic reminders" }] }),
      b("features", { title: "Patient communication, made simple", items: [
        { icon: "CalendarCheck", title: "24×7 appointment booking", text: "Patients pick a doctor and slot right inside WhatsApp." },
        { icon: "Bell", title: "Smart reminders", text: "Automatic reminders before every visit reduce no-shows." },
        { icon: "FileText", title: "Reports & prescriptions", text: "Share lab reports and prescriptions securely." },
        { icon: "HeartPulse", title: "Follow-ups", text: "Check on patients after treatment and ask for feedback." },
      ], columns: "4" }),
      b("split", { title: "No more missed appointments", text: "Reminders go out on WhatsApp where patients actually read them, with one-tap reschedule.", bullets: [{ text: "Reschedule or cancel in one tap" }, { text: "Doctor-wise slots" }] }),
      b("stats", { items: [{ value: "45%", label: "Fewer no-shows" }, { value: "3 min", label: "Average reply time" }, { value: "24×7", label: "Booking open" }] }),
      b("testimonials"), b("faq"), b("cta", { title: "Bring your clinic to WhatsApp", ctaText: "Book a free demo" }), b("form"),
    ],
  },
  {
    key: "ecommerce", name: "E-commerce & D2C", category: "E-commerce", description: "Catalog, cart recovery and order updates",
    blocks: () => [
      b("hero", { headline: "Sell more on WhatsApp", subheadline: "Share your catalog, recover abandoned carts and send order updates automatically.", ctaText: "Start free trial", points: [{ text: "Shopify & WooCommerce" }, { text: "Cart recovery" }] }),
      b("features", { title: "Your store, inside WhatsApp", items: [
        { icon: "ShoppingCart", title: "Abandoned cart recovery", text: "Remind shoppers about items left in the cart." },
        { icon: "Truck", title: "Order & delivery updates", text: "Confirmations, shipping and delivery alerts." },
        { icon: "Megaphone", title: "Sale broadcasts", text: "Launch offers to your opted-in customers." },
        { icon: "Store", title: "WhatsApp catalog", text: "Customers browse and order in chat." },
      ], columns: "4" }),
      b("split", { title: "Recover lost sales on autopilot", text: "Customers who leave items in their cart get a friendly reminder with a one-tap checkout.", bullets: [{ text: "Sent one hour later" }, { text: "Works with your store" }] }),
      b("stats", { items: [{ value: "25%", label: "Carts recovered" }, { value: "60%", label: "Fewer 'where is my order' calls" }, { value: "5×", label: "Campaign ROI" }] }),
      b("testimonials"), b("pricing"), b("faq"), b("form"),
    ],
  },
  {
    key: "education", name: "Education & coaching", category: "Education", description: "Admissions, fee reminders and class updates",
    blocks: () => [
      b("hero", { headline: "WhatsApp for schools, colleges and coaching", subheadline: "Answer admission enquiries instantly, send fee reminders and share class updates with parents.", ctaText: "Get a demo" }),
      b("features", { title: "Built for education", items: [
        { icon: "GraduationCap", title: "Admission enquiries", text: "Auto-reply to leads from ads and your website." },
        { icon: "CreditCard", title: "Fee reminders", text: "Polite reminders with a payment link." },
        { icon: "Bell", title: "Class & exam alerts", text: "Reach every parent in seconds." },
      ] }),
      b("steps"), b("testimonials"), b("faq"), b("form", { serviceLabel: "Interested in", serviceOptions: "Admissions\nFee reminders\nParent communication" }),
    ],
  },
  {
    key: "real-estate", name: "Real estate", category: "Real Estate", description: "Property leads, site visits and brochures",
    blocks: () => [
      b("hero", { headline: "Close more property deals on WhatsApp", subheadline: "Reply to portal and ad leads in seconds, share brochures and book site visits automatically.", ctaText: "See how it works" }),
      b("features", { title: "From lead to site visit", items: [
        { icon: "Target", title: "Instant lead replies", text: "Every 99acres, MagicBricks or Facebook lead gets a reply in seconds." },
        { icon: "FileText", title: "Brochures & price lists", text: "Send PDFs and walkthrough videos." },
        { icon: "CalendarCheck", title: "Site visit booking", text: "Buyers pick a slot; your team gets notified." },
      ] }),
      b("split"), b("testimonials"), b("form", { serviceLabel: "Looking for", serviceOptions: "Lead management\nSite visit booking\nBroadcasts" }),
    ],
  },
  {
    key: "travel", name: "Travel & tours", category: "Travel", description: "Itineraries, bookings and trip updates",
    blocks: () => [
      b("hero", { headline: "WhatsApp for travel agencies", subheadline: "Share packages, confirm bookings and send trip updates where travellers already chat.", ctaText: "Get a demo" }),
      b("features", { title: "Every trip, on WhatsApp", items: [
        { icon: "Plane", title: "Package enquiries", text: "Auto-share itineraries and prices." },
        { icon: "CreditCard", title: "Payment links", text: "Collect advances in chat." },
        { icon: "Bell", title: "Trip alerts", text: "Pickup times, tickets and vouchers." },
      ] }),
      b("cards"), b("testimonials"), b("form"),
    ],
  },
  {
    key: "restaurant", name: "Restaurants & cafes", category: "Restaurants", description: "Orders, reservations and offers",
    blocks: () => [
      b("hero", { headline: "Take orders and reservations on WhatsApp", subheadline: "Share your menu, accept orders and bring regulars back with offers — no commission.", ctaText: "Start free" }),
      b("features", { title: "Your restaurant, in every customer's pocket", items: [
        { icon: "Utensils", title: "Menu & ordering", text: "Customers order straight from chat." },
        { icon: "CalendarCheck", title: "Table bookings", text: "Reservations with automatic confirmation." },
        { icon: "Gift", title: "Offers for regulars", text: "Birthday and weekend offers that bring guests back." },
      ] }),
      b("stats"), b("faq"), b("form"),
    ],
  },
  {
    key: "industries-index", name: "Industries hub", category: "Other", description: "Lists all your industry pages in one place",
    blocks: () => [
      b("hero", { headline: "WhatsApp solutions for every industry", subheadline: "Pick your industry to see what you can automate.", layout: "center", ctaText: "Talk to an expert", ctaAction: "form", points: [] }),
      b("industries"), b("cta"), b("form"),
    ],
  },
];

// ───────────── validation helpers (server) ─────────────

export function safeUrl(u: unknown): string {
  const s = String(u ?? "").trim();
  if (!s) return "";
  if (/^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(s)) return s.slice(0, 1000);
  return "";
}

/** Keeps only known block types and fields; trims strings; makes URLs safe. HTML is sanitized by the server separately. */
export function normaliseBlocks(input: unknown, sanitizeHtml: (h: string) => string): Block[] {
  if (!Array.isArray(input)) return [];
  const out: Block[] = [];
  for (const raw of input.slice(0, 40)) {
    const type = (raw as any)?.type as BlockType;
    const def = (BLOCKS as any)[type];
    if (!def) continue;
    const props: Record<string, any> = {};
    for (const f of def.fields as FieldDef[]) props[f.key] = cleanField(f, (raw as any)?.props?.[f.key], sanitizeHtml);
    out.push({ id: String((raw as any)?.id || Math.random().toString(36).slice(2, 10)).slice(0, 20), type, props, hidden: !!(raw as any)?.hidden });
  }
  return out;
}

function cleanField(f: FieldDef, v: any, sanitizeHtml: (h: string) => string): any {
  switch (f.kind) {
    case "toggle": return !!v;
    case "number": return Number.isFinite(Number(v)) ? Number(v) : 0;
    case "url": case "image": return safeUrl(v);
    case "html": return sanitizeHtml(String(v ?? "")).slice(0, 50_000);
    case "list": {
      if (!Array.isArray(v)) return [];
      return v.slice(0, f.max || 20).map((it) => {
        const o: Record<string, any> = {};
        for (const sf of f.item || []) o[sf.key] = cleanField(sf, it?.[sf.key], sanitizeHtml);
        return o;
      });
    }
    case "select": {
      const s = String(v ?? "");
      return f.options?.some((o) => o.value === s) ? s : f.options?.[0]?.value ?? "";
    }
    default: return String(v ?? "").slice(0, f.max ? f.max * 2 : 2000);
  }
}

export function normaliseSettings(s: any): LandingSettings {
  const hex = (v: any) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : undefined);
  const id = (v: any, re: RegExp) => (re.test(String(v || "").trim()) ? String(v).trim() : undefined);
  return {
    hideChrome: !!s?.hideChrome,
    primary: hex(s?.primary),
    whatsappNumber: String(s?.whatsappNumber || "").replace(/\D/g, "").slice(0, 15) || undefined,
    whatsappText: String(s?.whatsappText || "").slice(0, 300) || undefined,
    googleAdsId: id(s?.googleAdsId, /^AW-\d{5,15}$/),
    googleAdsLabel: id(s?.googleAdsLabel, /^[A-Za-z0-9_-]{4,64}$/),
    ga4Id: id(s?.ga4Id, /^G-[A-Z0-9]{4,15}$/),
    metaPixelId: id(s?.metaPixelId, /^\d{8,20}$/),
    thankYouUrl: safeUrl(s?.thankYouUrl) || undefined,
    notifyEmails: String(s?.notifyEmails || "").split(/[\s,;]+/).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 5).join(",") || undefined,
  };
}

// ───────────── SEO helpers (server HTML + client head) ─────────────
const stripTags = (h: string) => String(h || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** First good image on the page (share image fallback). */
export function firstImage(blocks: Block[]): string {
  for (const bl of blocks || []) {
    if (bl.hidden) continue;
    const p = bl.props || {};
    if (p.image) return p.image;
    if (p.bgImage) return p.bgImage;
    if (Array.isArray(p.items)) { const it = p.items.find((x: any) => x?.image); if (it) return it.image; }
  }
  return "";
}

/** Description fallback: hero subheadline. */
export function autoDescription(blocks: Block[]): string {
  const h = (blocks || []).find((x) => x.type === "hero" && !x.hidden);
  return stripTags(h?.props?.subheadline || "").slice(0, 300);
}

/** JSON-LD: WebPage + FAQPage (from FAQ sections) + the page's own custom schema. */
export function buildJsonLd(page: { title: string; slug: string; metaTitle?: string | null; metaDescription?: string | null; ogImage?: string | null; blocks?: Block[]; schemaJson?: string | null; updatedAt?: any }, origin: string): string {
  const url = `${origin}/${page.slug}`;
  const abs = (u?: string | null) => (!u ? undefined : /^https?:/.test(u) ? u : `${origin}${u.startsWith("/") ? "" : "/"}${u}`);
  const blocks = (page.blocks || []).filter((x) => !x.hidden);
  const graph: any[] = [{
    "@type": "WebPage", "@id": url, url, name: page.metaTitle || page.title,
    description: page.metaDescription || autoDescription(blocks) || undefined,
    image: abs(page.ogImage || firstImage(blocks)),
    dateModified: page.updatedAt ? new Date(page.updatedAt).toISOString() : undefined,
  }];
  const faqs = blocks.filter((x) => x.type === "faq").flatMap((x) => (x.props?.items || []).filter((i: any) => i?.q && i?.a));
  if (faqs.length) graph.push({ "@type": "FAQPage", mainEntity: faqs.map((f: any) => ({ "@type": "Question", name: stripTags(f.q), acceptedAnswer: { "@type": "Answer", text: stripTags(f.a) } })) });
  if (page.schemaJson) {
    try { const c = JSON.parse(page.schemaJson); for (const x of Array.isArray(c) ? c : c?.["@graph"] || [c]) if (x && typeof x === "object") { const { "@context": _c, ...rest } = x; graph.push(rest); } } catch { /* invalid custom schema ignored */ }
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}
