/**
 * WhatsApp Mini Store — the in-chat shopping bot.
 *
 * Customer types a keyword (shop / menu / order …) → product catalogue as a
 * WhatsApp list → product card with "Add to cart" → cart → checkout →
 * delivery address → order + payment (Razorpay link, UPI or Cash on delivery)
 * → confirmation. "track" shows order status. All button/list ids start with
 * "st:" so the store never steals replies meant for other automations.
 *
 * Runs only inside the 24-hour customer-service window (the customer has just
 * messaged us), so interactive messages are free-form, not templates.
 */
import crypto from "crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { channels, storeCarts, storeOrders, storeProducts, storeSettings, type Channel, type StoreOrder, type StoreProduct, type StoreSettings } from "@shared/schema";
import { storage } from "../../storage";
import { WhatsAppApiService } from "../whatsapp-api";

type CartItem = { productId: string; qty: number };
const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
const num = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;

export function money(v: number | string, cur = "INR") {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(Number(v)); }
  catch { return `${cur} ${Number(v).toFixed(2)}`; }
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Received 📝", confirmed: "Confirmed ✅", packed: "Packed 📦", shipped: "Shipped 🚚",
  delivered: "Delivered 🎉", cancelled: "Cancelled ❌",
};

// ───────────── sending helpers (also logged to Team Inbox) ─────────────

async function send(channel: Channel, conversationId: string | null, to: string, payload: any, preview: string) {
  const api = new WhatsAppApiService(channel);
  const res = await api.sendDirectMessage({ recipient_type: "individual", to, ...payload });
  if (conversationId) {
    try {
      await storage.createMessage({
        conversationId, content: preview, fromUser: true, direction: "outbound", status: "sent",
        whatsappMessageId: res?.messages?.[0]?.id || null, messageType: payload.type || "text",
        metadata: JSON.stringify({ source: "mini_store" }), timestamp: new Date(),
      } as any);
      await storage.updateConversation(conversationId, { lastMessageAt: new Date(), lastMessageText: preview.slice(0, 200) } as any);
    } catch (e) { console.warn("[Store] log failed", (e as Error).message); }
  }
  return res;
}

const text = (body: string) => ({ type: "text", text: { body: body.slice(0, 4096), preview_url: true } });

function buttons(body: string, btns: Array<{ id: string; title: string }>, header?: { image?: string; text?: string }, footer?: string) {
  const interactive: any = {
    type: "button",
    body: { text: body.slice(0, 1024) },
    action: { buttons: btns.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: clip(b.title, 20) } })) },
  };
  if (header?.image) interactive.header = { type: "image", image: { link: header.image } };
  else if (header?.text) interactive.header = { type: "text", text: clip(header.text, 60) };
  if (footer) interactive.footer = { text: clip(footer, 60) };
  return { type: "interactive", interactive };
}

function list(body: string, buttonText: string, rows: Array<{ id: string; title: string; description?: string }>, header?: string, footer?: string) {
  const interactive: any = {
    type: "list",
    body: { text: body.slice(0, 1024) },
    action: {
      button: clip(buttonText, 20),
      sections: [{ title: clip(header || "Products", 24), rows: rows.slice(0, 10).map((r) => ({ id: r.id.slice(0, 200), title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })) }],
    },
  };
  if (header) interactive.header = { type: "text", text: clip(header, 60) };
  if (footer) interactive.footer = { text: clip(footer, 60) };
  return { type: "interactive", interactive };
}

function ctaUrl(body: string, label: string, url: string, footer?: string) {
  return {
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: body.slice(0, 1024) },
      ...(footer ? { footer: { text: clip(footer, 60) } } : {}),
      action: { name: "cta_url", parameters: { display_text: clip(label, 20), url } },
    },
  };
}

// ───────────── data helpers ─────────────

export async function getSettings(channelId: string) {
  const [s] = await db.select().from(storeSettings).where(eq(storeSettings.channelId, channelId)).limit(1);
  return s || null;
}

async function activeProducts(channelId: string) {
  return db.select().from(storeProducts)
    .where(and(eq(storeProducts.channelId, channelId), eq(storeProducts.isActive, true)))
    .orderBy(asc(storeProducts.sortOrder), asc(storeProducts.name));
}

async function getCart(channelId: string, phone: string) {
  const [c] = await db.select().from(storeCarts).where(and(eq(storeCarts.channelId, channelId), eq(storeCarts.phone, phone))).limit(1);
  return c || { channelId, phone, items: [] as CartItem[], state: "browsing", updatedAt: new Date() };
}

async function saveCart(channelId: string, phone: string, items: CartItem[], state = "browsing") {
  await db.insert(storeCarts).values({ channelId, phone, items, state, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [storeCarts.channelId, storeCarts.phone], set: { items, state, updatedAt: new Date() } });
}

async function cartLines(channelId: string, items: CartItem[]) {
  if (!items.length) return { lines: [] as Array<{ p: StoreProduct; qty: number; total: number }>, subtotal: 0 };
  const prods = await db.select().from(storeProducts).where(and(eq(storeProducts.channelId, channelId), inArray(storeProducts.id, items.map((i) => i.productId))));
  const lines = items
    .map((i) => ({ p: prods.find((x) => x.id === i.productId)!, qty: i.qty }))
    .filter((l) => l.p && l.p.isActive)
    .map((l) => ({ ...l, total: num(Number(l.p.price) * l.qty) }));
  return { lines, subtotal: num(lines.reduce((a, l) => a + l.total, 0)) };
}

function orderNumber() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `OD${ymd}${crypto.randomInt(1000, 9999)}`;
}

// ───────────── Razorpay payment links (store owner's own keys) ─────────────

async function createPaymentLink(s: StoreSettings, order: StoreOrder) {
  const auth = Buffer.from(`${s.razorpayKeyId}:${s.razorpayKeySecret}`).toString("base64");
  const r = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(Number(order.total) * 100),
      currency: order.currency || "INR",
      reference_id: order.orderNumber,
      description: `${s.storeName} order ${order.orderNumber}`.slice(0, 2048),
      customer: { name: order.customerName || undefined, contact: `+${order.phone}` },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: { store_order_id: order.id, channel_id: order.channelId },
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j?.short_url) throw new Error(j?.error?.description || `Razorpay error ${r.status}`);
  return { id: String(j.id), url: String(j.short_url) };
}

export async function refreshPaymentStatus(order: StoreOrder) {
  if (!order.paymentLinkId || order.paymentStatus === "paid") return order;
  const s = await getSettings(order.channelId);
  if (!s?.razorpayKeyId || !s.razorpayKeySecret) return order;
  try {
    const auth = Buffer.from(`${s.razorpayKeyId}:${s.razorpayKeySecret}`).toString("base64");
    const r = await fetch(`https://api.razorpay.com/v1/payment_links/${order.paymentLinkId}`, { headers: { Authorization: `Basic ${auth}` } });
    const j: any = await r.json();
    if (j?.status === "paid") return (await markPaid(order.id)) || order;
  } catch { /* keep current */ }
  return order;
}

export async function markPaid(orderId: string, notify = true) {
  const [o] = await db.update(storeOrders).set({ paymentStatus: "paid", status: sql`CASE WHEN ${storeOrders.status} = 'pending' THEN 'confirmed' ELSE ${storeOrders.status} END`, updatedAt: new Date() } as any)
    .where(and(eq(storeOrders.id, orderId), sql`${storeOrders.paymentStatus} <> 'paid'`)).returning();
  if (o && notify) {
    const [ch] = await db.select().from(channels).where(eq(channels.id, o.channelId)).limit(1);
    if (ch) await send(ch, o.conversationId, o.phone, text(`✅ Payment received for order *${o.orderNumber}* (${money(o.total, o.currency)}). Thank you! We'll update you when it ships.\n\nType *track* anytime to see your order status.`), `Payment received for ${o.orderNumber}`).catch(() => {});
  }
  return o || null;
}

// ───────────── screens ─────────────

async function showCatalogue(ctx: Ctx, category?: string, page = 0) {
  const prods = await activeProducts(ctx.channel.id);
  if (!prods.length) {
    await send(ctx.channel, ctx.conversationId, ctx.phone, text(`${ctx.s.storeName} has no products listed right now. Please check back soon!`), "Store: no products");
    return;
  }
  const cats = [...new Set(prods.map((p) => p.category || "All"))];
  if (!category && cats.length > 1) {
    const rows = cats.slice(0, 10).map((c) => ({ id: `st:cat:${c}`.slice(0, 200), title: c, description: `${prods.filter((p) => (p.category || "All") === c).length} items` }));
    await send(ctx.channel, ctx.conversationId, ctx.phone, list(ctx.s.welcomeText, "Browse", rows, ctx.s.storeName, "Type cart or track anytime"), "Store: categories");
    return;
  }
  const inCat = category ? prods.filter((p) => (p.category || "All") === category) : prods;
  const pageSize = 9;
  const slice = inCat.slice(page * pageSize, page * pageSize + pageSize);
  const rows = slice.map((p) => ({
    id: `st:p:${p.id}`,
    title: p.name,
    description: `${money(p.price, ctx.s.currency)}${p.stock === 0 ? " · Out of stock" : ""}${p.description ? ` · ${p.description}` : ""}`,
  }));
  if (inCat.length > (page + 1) * pageSize) rows.push({ id: `st:cat:${category || ""}:${page + 1}`, title: "More products…", description: `${inCat.length - (page + 1) * pageSize} more` });
  const body = page === 0 && !category ? ctx.s.welcomeText : `${category || "Products"} — tap View to pick one.`;
  await send(ctx.channel, ctx.conversationId, ctx.phone, list(body, "View products", rows, category || ctx.s.storeName, "Type cart or track anytime"), `Store: ${category || "catalogue"}`);
}

async function showProduct(ctx: Ctx, id: string) {
  const [p] = await db.select().from(storeProducts).where(and(eq(storeProducts.id, id), eq(storeProducts.channelId, ctx.channel.id))).limit(1);
  if (!p || !p.isActive) return showCatalogue(ctx);
  const body = `*${p.name}*\n${money(p.price, ctx.s.currency)}${p.description ? `\n\n${p.description}` : ""}${p.stock === 0 ? "\n\n_Currently out of stock_" : ""}`;
  const btns = p.stock === 0
    ? [{ id: "st:menu", title: "Browse more" }, { id: "st:cart", title: "View cart" }]
    : [{ id: `st:add:${p.id}`, title: "Add to cart" }, { id: "st:cart", title: "View cart" }, { id: "st:menu", title: "Browse more" }];
  const header = p.imageUrl && /^https:\/\//.test(p.imageUrl) ? { image: p.imageUrl } : undefined;
  await send(ctx.channel, ctx.conversationId, ctx.phone, buttons(body, btns, header), `Store: ${p.name}`);
}

async function addToCart(ctx: Ctx, id: string) {
  const [p] = await db.select().from(storeProducts).where(and(eq(storeProducts.id, id), eq(storeProducts.channelId, ctx.channel.id))).limit(1);
  if (!p || !p.isActive) return showCatalogue(ctx);
  const cart = await getCart(ctx.channel.id, ctx.phone);
  const items = [...((cart.items as CartItem[]) || [])];
  const ex = items.find((i) => i.productId === id);
  const nextQty = (ex?.qty || 0) + 1;
  if (p.stock != null && nextQty > p.stock) {
    await send(ctx.channel, ctx.conversationId, ctx.phone, buttons(`Sorry, only ${p.stock} of *${p.name}* left.`, [{ id: "st:cart", title: "View cart" }, { id: "st:menu", title: "Browse more" }]), "Store: stock limit");
    return;
  }
  if (ex) ex.qty = nextQty; else items.push({ productId: id, qty: 1 });
  await saveCart(ctx.channel.id, ctx.phone, items);
  const { subtotal, lines } = await cartLines(ctx.channel.id, items);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  await send(ctx.channel, ctx.conversationId, ctx.phone,
    buttons(`Added *${p.name}* ✅\nCart: ${count} item${count > 1 ? "s" : ""} · ${money(subtotal, ctx.s.currency)}`, [{ id: "st:checkout", title: "Checkout" }, { id: "st:menu", title: "Browse more" }, { id: "st:cart", title: "View cart" }]),
    `Store: added ${p.name}`);
}

async function showCart(ctx: Ctx) {
  const cart = await getCart(ctx.channel.id, ctx.phone);
  const { lines, subtotal } = await cartLines(ctx.channel.id, (cart.items as CartItem[]) || []);
  if (!lines.length) {
    await send(ctx.channel, ctx.conversationId, ctx.phone, buttons("Your cart is empty.", [{ id: "st:menu", title: "Browse products" }]), "Store: empty cart");
    return;
  }
  const fee = num(ctx.s.deliveryFee);
  const body = `🛒 *Your cart*\n\n${lines.map((l) => `${l.qty} × ${l.p.name} — ${money(l.total, ctx.s.currency)}`).join("\n")}\n\nSubtotal: ${money(subtotal, ctx.s.currency)}${fee ? `\nDelivery: ${money(fee, ctx.s.currency)}` : ""}\n*Total: ${money(subtotal + fee, ctx.s.currency)}*`;
  await send(ctx.channel, ctx.conversationId, ctx.phone, buttons(body, [{ id: "st:checkout", title: "Checkout" }, { id: "st:menu", title: "Add more" }, { id: "st:clear", title: "Clear cart" }]), "Store: cart");
}

async function checkout(ctx: Ctx) {
  const cart = await getCart(ctx.channel.id, ctx.phone);
  const { lines, subtotal } = await cartLines(ctx.channel.id, (cart.items as CartItem[]) || []);
  if (!lines.length) return showCart(ctx);
  const min = num(ctx.s.minOrder);
  if (min && subtotal < min) {
    await send(ctx.channel, ctx.conversationId, ctx.phone, buttons(`Minimum order is ${money(min, ctx.s.currency)}. Your cart is ${money(subtotal, ctx.s.currency)}.`, [{ id: "st:menu", title: "Add more" }]), "Store: below minimum");
    return;
  }
  if (ctx.s.askAddress) {
    await saveCart(ctx.channel.id, ctx.phone, cart.items as CartItem[], "awaiting_address");
    await send(ctx.channel, ctx.conversationId, ctx.phone, text("📍 Please type your full delivery address (house no., street, area, city, PIN code)."), "Store: asked for address");
    return;
  }
  await placeOrder(ctx, null);
}

async function placeOrder(ctx: Ctx, address: string | null) {
  const cart = await getCart(ctx.channel.id, ctx.phone);
  const { lines, subtotal } = await cartLines(ctx.channel.id, (cart.items as CartItem[]) || []);
  if (!lines.length) return showCart(ctx);
  const fee = num(ctx.s.deliveryFee);
  const [order] = await db.insert(storeOrders).values({
    orderNumber: orderNumber(), channelId: ctx.channel.id, ownerId: ctx.s.ownerId, conversationId: ctx.conversationId,
    phone: ctx.phone, customerName: ctx.name, address,
    items: lines.map((l) => ({ productId: l.p.id, name: l.p.name, price: num(l.p.price), qty: l.qty, lineTotal: l.total })),
    subtotal: String(subtotal), deliveryFee: String(fee), total: String(num(subtotal + fee)), currency: ctx.s.currency,
  }).returning();
  // reserve stock
  for (const l of lines) {
    if (l.p.stock != null) await db.update(storeProducts).set({ stock: sql`GREATEST(${storeProducts.stock} - ${l.qty}, 0)` } as any).where(eq(storeProducts.id, l.p.id));
  }
  await saveCart(ctx.channel.id, ctx.phone, [], "browsing");

  const summary = `🧾 *Order ${order.orderNumber}*\n\n${lines.map((l) => `${l.qty} × ${l.p.name} — ${money(l.total, ctx.s.currency)}`).join("\n")}${fee ? `\nDelivery — ${money(fee, ctx.s.currency)}` : ""}\n*Total: ${money(order.total, ctx.s.currency)}*${address ? `\n\n📍 ${address}` : ""}`;
  const online = !!(ctx.s.razorpayKeyId && ctx.s.razorpayKeySecret);
  const options = [online && "online", ctx.s.upiId && "upi", ctx.s.codEnabled && "cod"].filter(Boolean) as string[];

  if (options.length > 1) {
    const btns = [
      ...(online ? [{ id: `st:pay:${order.id}`, title: "Pay online" }] : []),
      ...(ctx.s.upiId ? [{ id: `st:upi:${order.id}`, title: "Pay by UPI" }] : []),
      ...(ctx.s.codEnabled ? [{ id: `st:cod:${order.id}`, title: "Cash on delivery" }] : []),
    ];
    await send(ctx.channel, ctx.conversationId, ctx.phone, buttons(`${summary}\n\nHow would you like to pay?`, btns), `Order ${order.orderNumber} placed`);
  } else if (options[0] === "online") {
    await payOnline(ctx, order.id, summary);
  } else if (options[0] === "upi") {
    await payUpi(ctx, order.id, summary);
  } else {
    await choosePayment(ctx, order.id, "cod", summary);
  }
}

async function loadOrder(ctx: Ctx, id: string) {
  const [o] = await db.select().from(storeOrders).where(and(eq(storeOrders.id, id), eq(storeOrders.channelId, ctx.channel.id), eq(storeOrders.phone, ctx.phone))).limit(1);
  return o || null;
}

async function payOnline(ctx: Ctx, orderId: string, prefix = "") {
  const o = await loadOrder(ctx, orderId);
  if (!o || o.paymentStatus === "paid") return;
  try {
    let url = o.paymentLinkUrl;
    if (!url) {
      const link = await createPaymentLink(ctx.s, o);
      url = link.url;
      await db.update(storeOrders).set({ paymentLinkId: link.id, paymentLinkUrl: link.url, paymentMethod: "online", updatedAt: new Date() } as any).where(eq(storeOrders.id, o.id));
    }
    await send(ctx.channel, ctx.conversationId, ctx.phone, ctaUrl(`${prefix ? `${prefix}\n\n` : ""}Tap below to pay ${money(o.total, o.currency)} securely. Your order is confirmed as soon as payment is received.`, `Pay ${money(o.total, o.currency)}`, url!, "UPI · Cards · Netbanking"), `Payment link for ${o.orderNumber}`);
  } catch (e) {
    console.error("[Store] payment link failed", (e as Error).message);
    if (ctx.s.codEnabled) await choosePayment(ctx, o.id, "cod", `${prefix}\n\nOnline payment is unavailable right now, so we've placed this as Cash on delivery.`);
    else await send(ctx.channel, ctx.conversationId, ctx.phone, text(`${prefix}\n\nWe couldn't create a payment link right now. Our team will contact you shortly to complete payment.`), "Store: payment link failed");
  }
}

async function payUpi(ctx: Ctx, orderId: string, prefix = "") {
  const o = await loadOrder(ctx, orderId);
  if (!o) return;
  await db.update(storeOrders).set({ paymentMethod: "upi", updatedAt: new Date() } as any).where(eq(storeOrders.id, o.id));
  await send(ctx.channel, ctx.conversationId, ctx.phone,
    text(`${prefix ? `${prefix}\n\n` : ""}💳 Pay *${money(o.total, o.currency)}* to UPI ID:\n*${ctx.s.upiId}*\n\nAdd *${o.orderNumber}* in the payment note and send us the screenshot here. We'll confirm your order once we receive it.`),
    `UPI details for ${o.orderNumber}`);
}

async function choosePayment(ctx: Ctx, orderId: string, method: "cod", prefix = "") {
  const o = await loadOrder(ctx, orderId);
  if (!o) return;
  await db.update(storeOrders).set({ paymentMethod: method, status: "confirmed", updatedAt: new Date() } as any).where(eq(storeOrders.id, o.id));
  await send(ctx.channel, ctx.conversationId, ctx.phone,
    text(`${prefix ? `${prefix}\n\n` : ""}✅ Order *${o.orderNumber}* confirmed — Cash on delivery (${money(o.total, o.currency)}).\nWe'll message you when it ships. Type *track* anytime.`),
    `Order ${o.orderNumber} confirmed (COD)`);
}

async function track(ctx: Ctx) {
  const orders = await db.select().from(storeOrders).where(and(eq(storeOrders.channelId, ctx.channel.id), eq(storeOrders.phone, ctx.phone))).orderBy(desc(storeOrders.createdAt)).limit(3);
  if (!orders.length) {
    await send(ctx.channel, ctx.conversationId, ctx.phone, buttons("You don't have any orders yet.", [{ id: "st:menu", title: "Browse products" }]), "Store: no orders");
    return;
  }
  const fresh = await Promise.all(orders.map((o) => refreshPaymentStatus(o)));
  const body = fresh.map((o) => {
    const pay = o.paymentStatus === "paid" ? "Paid" : o.paymentMethod === "cod" ? "Cash on delivery" : "Payment pending";
    return `*${o.orderNumber}* · ${money(o.total, o.currency)}\nStatus: ${STATUS_LABEL[o.status] || o.status} · ${pay}${o.trackingUrl ? `\nTrack: ${o.trackingUrl}` : ""}`;
  }).join("\n\n");
  const unpaid = fresh.find((o) => o.paymentStatus !== "paid" && o.paymentLinkUrl && o.status !== "cancelled");
  if (unpaid) await send(ctx.channel, ctx.conversationId, ctx.phone, ctaUrl(`📦 *Your orders*\n\n${body}`, "Complete payment", unpaid.paymentLinkUrl!), "Store: order status");
  else await send(ctx.channel, ctx.conversationId, ctx.phone, buttons(`📦 *Your orders*\n\n${body}`, [{ id: "st:menu", title: "Shop again" }]), "Store: order status");
}

// ───────────── entry point from the webhook ─────────────

interface Ctx { channel: Channel; s: StoreSettings; conversationId: string | null; phone: string; name: string | null }

export interface IncomingForStore {
  channel: Channel;
  conversationId: string | null;
  phone: string;
  name?: string | null;
  type: string;
  text?: string | null;
  interactive?: any;
}

/** Returns true when the store handled this message (skip automations/AI). */
export async function handleStoreMessage(m: IncomingForStore): Promise<boolean> {
  const s = await getSettings(m.channel.id);
  if (!s?.enabled) return false;
  const ctx: Ctx = { channel: m.channel, s, conversationId: m.conversationId, phone: m.phone, name: m.name || null };

  const replyId: string | undefined =
    m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || m.interactive?.buttonPayload;
  if (replyId && replyId.startsWith("st:")) {
    const [, action, ...rest] = replyId.split(":");
    const arg = rest.join(":");
    try {
      switch (action) {
        case "menu": await showCatalogue(ctx); break;
        case "cat": { const [cat, pg] = arg.split(/:(?=\d+$)/); await showCatalogue(ctx, cat || undefined, Number(pg || 0)); break; }
        case "p": await showProduct(ctx, arg); break;
        case "add": await addToCart(ctx, arg); break;
        case "cart": await showCart(ctx); break;
        case "clear": await saveCart(ctx.channel.id, ctx.phone, []); await send(ctx.channel, ctx.conversationId, ctx.phone, buttons("Cart cleared.", [{ id: "st:menu", title: "Browse products" }]), "Store: cart cleared"); break;
        case "checkout": await checkout(ctx); break;
        case "pay": await payOnline(ctx, arg); break;
        case "upi": await payUpi(ctx, arg); break;
        case "cod": await choosePayment(ctx, arg, "cod"); break;
        case "track": await track(ctx); break;
        default: await showCatalogue(ctx);
      }
    } catch (e) { console.error("[Store] action failed", action, (e as Error).message); }
    return true;
  }

  if (m.type !== "text" || !m.text) return false;
  const t = m.text.trim();
  const lower = t.toLowerCase();

  const cart = await getCart(m.channel.id, m.phone);
  if (cart.state === "awaiting_address") {
    if (["cancel", "stop", "menu", "shop"].includes(lower)) {
      await saveCart(m.channel.id, m.phone, cart.items as CartItem[], "browsing");
      await showCatalogue(ctx);
      return true;
    }
    if (t.length < 10) {
      await send(ctx.channel, ctx.conversationId, ctx.phone, text("That looks too short for an address. Please type the full address with city and PIN code, or type *cancel*."), "Store: address too short");
      return true;
    }
    await placeOrder(ctx, clip(t, 500));
    return true;
  }

  const keywords: string[] = (Array.isArray(s.keywords) ? (s.keywords as string[]) : []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  if (keywords.includes(lower)) { await showCatalogue(ctx); return true; }
  if (["cart", "my cart", "view cart"].includes(lower)) { await showCart(ctx); return true; }
  if (["track", "status", "my order", "my orders", "order status"].includes(lower)) { await track(ctx); return true; }
  return false;
}

/** Owner changed an order's status → tell the customer. */
export async function notifyStatus(order: StoreOrder) {
  const [ch] = await db.select().from(channels).where(eq(channels.id, order.channelId)).limit(1);
  if (!ch) throw new Error("WhatsApp number not found");
  const msg = `Update on order *${order.orderNumber}*: ${STATUS_LABEL[order.status] || order.status}${order.trackingUrl ? `\n\nTrack your parcel: ${order.trackingUrl}` : ""}${order.status === "delivered" ? "\n\nThank you for shopping with us! 💚" : ""}`;
  await send(ch, order.conversationId, order.phone, text(msg), `Order ${order.orderNumber}: ${order.status}`);
}

export function verifyRazorpaySignature(secret: string, raw: Buffer | undefined, signature: string) {
  if (!raw || !secret || !signature) return false;
  const exp = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(exp), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
