/**
 * WhatsApp Mini Store — products, orders and store settings.
 * Customers shop inside WhatsApp (type "shop"); orders land here.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Check, Copy, ExternalLink, ImageOff, ImagePlus, Loader2, X, Package, Pencil, Plus, RefreshCw, ShoppingBag, Store, Trash2, Truck,
} from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiRequestFormData, queryClient } from "@/lib/queryClient";
import { useChannelContext } from "@/contexts/channel-context";

const STATUSES = ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled"] as const;
const STATUS_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700", confirmed: "bg-sky-100 text-sky-800", packed: "bg-violet-100 text-violet-800",
  shipped: "bg-amber-100 text-amber-800", delivered: "bg-emerald-100 text-emerald-800", cancelled: "bg-red-100 text-red-700",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const money = (v: any, cur = "INR") => {
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: cur }).format(Number(v || 0)); } catch { return `${cur} ${v}`; }
};

export default function MiniStorePage() {
  const { selectedChannel } = useChannelContext() as any;
  const channelId: string | undefined = selectedChannel?.id;
  const settings = useQuery<any>({
    queryKey: ["/api/store/settings", channelId],
    enabled: !!channelId,
    queryFn: async () => (await apiRequest("GET", `/api/store/settings?channelId=${channelId}`)).json(),
  });
  const enabled = !!settings.data?.data?.enabled;

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="WhatsApp Store" subtitle="Customers browse, add to cart, pay and track orders inside WhatsApp" />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        {!channelId ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground sm:p-8">Select a WhatsApp number first.</CardContent></Card>
        ) : (
          <>
            <StoreBanner enabled={enabled} link={settings.data?.storeLink} keyword={(settings.data?.data?.keywords || ["shop"])[0]} />
            <Tabs defaultValue="orders">
              <TabsList>
                <TabsTrigger value="orders"><ShoppingBag className="mr-1.5 h-4 w-4" />Orders</TabsTrigger>
                <TabsTrigger value="products"><Package className="mr-1.5 h-4 w-4" />Products</TabsTrigger>
                <TabsTrigger value="settings"><Store className="mr-1.5 h-4 w-4" />Store settings</TabsTrigger>
              </TabsList>
              <TabsContent value="orders" className="mt-4"><OrdersTab channelId={channelId} currency={settings.data?.data?.currency || "INR"} /></TabsContent>
              <TabsContent value="products" className="mt-4"><ProductsTab channelId={channelId} currency={settings.data?.data?.currency || "INR"} /></TabsContent>
              <TabsContent value="settings" className="mt-4">
                {settings.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <SettingsTab channelId={channelId} data={settings.data} />}
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

function StoreBanner({ enabled, link, keyword }: { enabled: boolean; link?: string | null; keyword: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card className="overflow-hidden rounded-2xl border-0 bg-gradient-to-r from-[#075e54] to-[#128c7e] text-white">
      <CardContent className="flex flex-col gap-4 p-6 sm:p-6 sm:pt-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-300" : "bg-amber-300"}`} />
            <span className="text-sm text-white/85">{enabled ? "Store is live" : "Store is off — turn it on in Store settings"}</span>
          </div>
          <h2 className="text-xl font-semibold sm:text-2xl">Customers type “{keyword}” on WhatsApp to start shopping</h2>
          <p className="text-sm text-white/75">Share your store link on Instagram, your website or QR stickers.</p>
        </div>
        {link && (
          <div className="flex w-full max-w-md gap-2">
            <Input readOnly value={link} className="border-white/20 bg-white/10 text-white" onFocus={(e) => e.target.select()} />
            <Button variant="secondary" className="bg-white text-[#075e54] hover:bg-white/90" onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────── Orders ───────────── */

function OrdersTab({ channelId, currency }: { channelId: string; currency: string }) {
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<any>(null);
  const orders = useQuery<any>({
    queryKey: ["/api/store/orders", channelId, status],
    queryFn: async () => (await apiRequest("GET", `/api/store/orders?channelId=${channelId}&status=${status}`)).json(),
    refetchInterval: 20000,
  });
  const st = orders.data?.stats || {};
  const rows: any[] = orders.data?.data || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: "Orders", v: st.orders ?? 0 },
          { l: "Open orders", v: st.open ?? 0 },
          { l: "Awaiting payment", v: st.unpaid ?? 0 },
          { l: "Collected", v: money(st.revenue, currency) },
        ].map((k) => (
          <Card key={k.l} className="rounded-2xl"><CardContent className="p-4 sm:p-5"><p className="text-xs text-muted-foreground">{k.l}</p><p className="mt-1 text-2xl font-bold tabular-nums">{k.v}</p></CardContent></Card>
        ))}
      </div>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base sm:text-base">Orders</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{cap(s)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="icon" variant="outline" onClick={() => orders.refetch()}><RefreshCw className={`h-4 w-4 ${orders.isFetching ? "animate-spin" : ""}`} /></Button>
          </div>
        </CardHeader>
        <CardContent>
          {orders.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No orders yet. Add products, turn the store on and share your link.</div>
          ) : (
            <div className="divide-y rounded-xl border">
              {rows.map((o) => (
                <button key={o.id} onClick={() => setOpen(o)} className="flex w-full flex-col gap-2 p-3 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-36 font-mono text-sm font-medium">{o.orderNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{o.customerName || o.phone} · {(o.items || []).map((i: any) => `${i.qty}× ${i.name}`).join(", ")}</span>
                  <span className="w-24 text-sm font-semibold tabular-nums">{money(o.total, o.currency)}</span>
                  <span className={`w-fit rounded-md px-2 py-0.5 text-xs font-medium ${o.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-800" : o.paymentMethod === "cod" ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800"}`}>
                    {o.paymentStatus === "paid" ? "Paid" : o.paymentMethod === "cod" ? "COD" : "Unpaid"}
                  </span>
                  <span className={`w-fit rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_TONE[o.status]}`}>{cap(o.status)}</span>
                  <span className="w-32 text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {open && <OrderSheet channelId={channelId} order={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function OrderSheet({ channelId, order, onClose }: { channelId: string; order: any; onClose: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(order.status);
  const [tracking, setTracking] = useState(order.trackingUrl || "");
  const [notes, setNotes] = useState(order.notes || "");
  const [notify, setNotify] = useState(true);
  const save = useMutation({
    mutationFn: async (extra: any = {}) => (await apiRequest("PATCH", `/api/store/orders/${order.id}`, { channelId, status, trackingUrl: tracking, notes, notify, ...extra })).json(),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/store/orders", channelId] });
      if (r.notifyError) toast({ title: "Saved, but customer not notified", description: r.notifyError, variant: "destructive" });
      else toast({ title: "Order updated", description: r.notified ? "Customer notified on WhatsApp." : undefined });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const refresh = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/store/orders/${order.id}/refresh-payment`, { channelId })).json(),
    onSuccess: (r) => { queryClient.invalidateQueries({ queryKey: ["/api/store/orders", channelId] }); toast({ title: r.data?.paymentStatus === "paid" ? "Payment received" : "Still unpaid" }); },
  });
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle className="font-mono">{order.orderNumber}</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-5 text-sm">
          <div className="space-y-1">
            <p className="font-medium">{order.customerName || "Customer"}</p>
            <p className="text-muted-foreground">+{order.phone}</p>
            {order.address && <div className="rounded-lg bg-muted p-3"><p className="mb-1 text-xs text-muted-foreground">Customer details</p><p className="whitespace-pre-wrap">{order.address}</p></div>}
          </div>
          <div className="rounded-xl border">
            {(order.items || []).map((i: any, k: number) => (
              <div key={k} className="flex justify-between border-b p-3 last:border-0"><span>{i.qty} × {i.name}</span><span className="tabular-nums">{money(i.lineTotal, order.currency)}</span></div>
            ))}
            {Number(order.deliveryFee) > 0 && <div className="flex justify-between border-t p-3 text-muted-foreground"><span>Delivery</span><span>{money(order.deliveryFee, order.currency)}</span></div>}
            <div className="flex justify-between border-t p-3 font-semibold"><span>Total</span><span>{money(order.total, order.currency)}</span></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{order.paymentMethod ? order.paymentMethod.toUpperCase() : "Payment not chosen"}</Badge>
            <Badge className={order.paymentStatus === "paid" ? "bg-emerald-600" : "bg-amber-500"}>{order.paymentStatus === "paid" ? "Paid" : "Unpaid"}</Badge>
            {order.paymentLinkUrl && <a href={order.paymentLinkUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">Payment link <ExternalLink className="h-3 w-3" /></a>}
          </div>
          {order.paymentStatus !== "paid" && (
            <div className="flex gap-2">
              {order.paymentLinkId && <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Check payment</Button>}
              <Button size="sm" variant="outline" onClick={() => save.mutate({ paymentStatus: "paid" })}>Mark as paid</Button>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{cap(s)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" />Tracking link</Label>
            <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="https://courier.example/track/AWB123" />
          </div>
          <div className="space-y-1.5"><Label>Internal notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <label className="flex items-center gap-2"><Switch checked={notify} onCheckedChange={setNotify} />Send the status update to the customer on WhatsApp</label>
          <Button className="w-full" onClick={() => save.mutate({})} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save order</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ───────────── Products ───────────── */

function ProductsTab({ channelId, currency }: { channelId: string; currency: string }) {
  const { toast } = useToast();
  const [edit, setEdit] = useState<any>(null);
  const products = useQuery<any>({ queryKey: ["/api/store/products", channelId], queryFn: async () => (await apiRequest("GET", `/api/store/products?channelId=${channelId}`)).json() });
  const rows: any[] = products.data?.data || [];
  const cats = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/store/products", channelId] });
  const toggle = useMutation({ mutationFn: async (p: any) => apiRequest("PUT", `/api/store/products/${p.id}`, { channelId, isActive: !p.isActive }), onSuccess: refresh });
  const del = useMutation({ mutationFn: async (p: any) => apiRequest("DELETE", `/api/store/products/${p.id}?channelId=${channelId}`), onSuccess: () => { refresh(); toast({ title: "Product deleted" }); } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{rows.length} products · {cats.length} categories. WhatsApp lists show up to 9 products per page and 10 categories.</p>
        <Button onClick={() => setEdit({ name: "", price: "", category: cats[0] || "All", isActive: true })}><Plus className="mr-1.5 h-4 w-4" />Add product</Button>
      </div>
      {products.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : rows.length === 0 ? (
        <Card className="rounded-2xl border-dashed"><CardContent className="p-10 text-center text-sm text-muted-foreground sm:p-10">Add your first product — name, price and a photo link is enough.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((p) => (
            <Card key={p.id} className={`overflow-hidden rounded-2xl ${p.isActive ? "" : "opacity-60"}`}>
              <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" loading="lazy" /> : <ImageOff className="h-8 w-8 text-muted-foreground" />}
              </div>
              <CardContent className="space-y-2 p-4 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-tight">{p.name}</p>
                  <p className="shrink-0 font-semibold tabular-nums">{money(p.price, currency)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="secondary">{p.category}</Badge>
                  <Badge variant="outline">{p.stock == null ? "Unlimited stock" : p.stock === 0 ? "Out of stock" : `${p.stock} in stock`}</Badge>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={p.isActive} onCheckedChange={() => toggle.mutate(p)} />{p.isActive ? "Visible" : "Hidden"}</label>
                  <div className="flex">
                    <Button size="icon" variant="ghost" onClick={() => setEdit({ ...p })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm(`Delete ${p.name}?`) && del.mutate(p)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {edit && <ProductDialog channelId={channelId} product={edit} categories={cats} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
    </div>
  );
}

function ProductDialog({ channelId, product, categories, onClose, onSaved }: { channelId: string; product: any; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<any>({ ...product, stock: product.stock ?? "" });
  const save = useMutation({
    mutationFn: async () => {
      const body = { channelId, name: f.name, description: f.description || null, category: f.category || "All", price: f.price, imageUrl: f.imageUrl || null, stock: f.stock === "" ? null : Number(f.stock), isActive: f.isActive };
      return (await apiRequest(product.id ? "PUT" : "POST", product.id ? `/api/store/products/${product.id}` : "/api/store/products", body)).json();
    },
    onSuccess: () => { toast({ title: product.id ? "Product updated" : "Product added" }); onSaved(); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{product.id ? "Edit product" : "Add product"}</DialogTitle><DialogDescription>This is what customers see in the WhatsApp catalogue.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Name</Label><Input maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Chocolate truffle cake (1 kg)" /><p className="text-xs text-muted-foreground">First 24 characters show in the WhatsApp list.</p></div>
          <div className="space-y-1.5"><Label>Price</Label><Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input list="store-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
            <datalist id="store-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea rows={3} maxLength={500} value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Photo</Label>
            <PhotoPicker channelId={channelId} value={f.imageUrl || ""} onChange={(url) => setF({ ...f, imageUrl: url })} />
          </div>
          <div className="space-y-1.5"><Label>Stock</Label><Input type="number" min={0} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} placeholder="Leave empty for unlimited" /></div>
          <label className="flex items-center gap-2 pt-6 text-sm"><Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />Visible in store</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!f.name || f.price === "" || save.isPending} onClick={() => save.mutate()}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save product</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Settings ───────────── */

function SettingsTab({ channelId, data }: { channelId: string; data: any }) {
  const { toast } = useToast();
  const d = data?.data || {};
  const [f, setF] = useState<any>({
    enabled: d.enabled ?? false, storeName: d.storeName || "My store", keywords: (d.keywords || ["shop", "store", "menu", "order", "catalog"]).join(", "),
    welcomeText: d.welcomeText || "Welcome! 👋 Browse our products below and order right here on WhatsApp.", currency: d.currency || "INR",
    askAddress: d.askAddress ?? true, storeType: d.storeType || "products", checkoutPrompt: d.checkoutPrompt || "", codEnabled: d.codEnabled ?? true, upiId: d.upiId || "", razorpayKeyId: d.razorpayKeyId || "",
    razorpayKeySecret: d.razorpayKeySecret || "", razorpayWebhookSecret: d.razorpayWebhookSecret || "", deliveryFee: d.deliveryFee ?? 0, minOrder: d.minOrder ?? 0,
  });
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/store/settings", {
      channelId, ...f, keywords: String(f.keywords).split(",").map((k: string) => k.trim()).filter(Boolean).slice(0, 10),
      checkoutPrompt: f.checkoutPrompt || null, upiId: f.upiId || null, razorpayKeyId: f.razorpayKeyId || null, razorpayKeySecret: f.razorpayKeySecret || null, razorpayWebhookSecret: f.razorpayWebhookSecret || null,
    })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/store/settings", channelId] }); toast({ title: "Store settings saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });
  const noPayment = !f.codEnabled && !f.upiId && !(f.razorpayKeyId && f.razorpayKeySecret);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-base sm:text-base">Store</CardTitle><CardDescription>What customers see when they start shopping.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between rounded-xl border p-3"><span><span className="font-medium">Store is on</span><span className="block text-xs text-muted-foreground">When off, the keywords go to your normal automations and AI.</span></span><Switch checked={f.enabled} onCheckedChange={(v) => set("enabled", v)} /></label>
          <div className="space-y-1.5">
            <Label>What do you sell?</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: "products", t: "Products", d: "Cart, delivery address, shipping" },
                { v: "services", t: "Services", d: "Bookings — no address, asks date & time" },
              ].map((o) => (
                <button key={o.v} type="button" onClick={() => setF((x: any) => ({ ...x, storeType: o.v, askAddress: o.v === "products" ? x.askAddress : true }))}
                  className={`rounded-xl border p-3 text-left transition-colors ${f.storeType === o.v ? "border-[var(--brand)] bg-[var(--brand-100)]" : "hover:border-foreground/30"}`}>
                  <span className="block text-sm font-medium">{o.t}</span>
                  <span className="block text-xs text-muted-foreground">{o.d}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5"><Label>Store name</Label><Input maxLength={80} value={f.storeName} onChange={(e) => set("storeName", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Words that open the store</Label><Input value={f.keywords} onChange={(e) => set("keywords", e.target.value)} /><p className="text-xs text-muted-foreground">Comma separated. Customers can also type “cart” and “track”.</p></div>
          <div className="space-y-1.5"><Label>Welcome message</Label><Textarea rows={3} maxLength={900} value={f.welcomeText} onChange={(e) => set("welcomeText", e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5"><Label>Delivery fee</Label><Input type="number" min={0} value={f.deliveryFee} onChange={(e) => set("deliveryFee", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Minimum order</Label><Input type="number" min={0} value={f.minOrder} onChange={(e) => set("minOrder", e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.askAddress} onCheckedChange={(v) => set("askAddress", v)} />{f.storeType === "services" ? "Ask for booking details at checkout" : "Ask for delivery address at checkout"}</label>
          {f.askAddress && (
            <div className="space-y-1.5">
              <Label>Checkout question (optional)</Label>
              <Textarea rows={2} maxLength={500} value={f.checkoutPrompt} onChange={(e) => set("checkoutPrompt", e.target.value)}
                placeholder={f.storeType === "services" ? "Please share your preferred date & time and any details (or type skip)." : "Please type your full delivery address (house no., street, area, city, PIN code)."} />
              <p className="text-xs text-muted-foreground">Leave empty to use the default. The customer's answer is saved on the order.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-base sm:text-base">Payments</CardTitle><CardDescription>Money goes straight to your own accounts.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.codEnabled} onCheckedChange={(v) => set("codEnabled", v)} />Cash on delivery</label>
          <div className="space-y-1.5"><Label>UPI ID (manual payment)</Label><Input value={f.upiId} onChange={(e) => set("upiId", e.target.value)} placeholder="yourshop@okicici" /><p className="text-xs text-muted-foreground">Customer pays and sends a screenshot; you mark the order paid.</p></div>
          <div className="space-y-3 rounded-xl border p-3">
            <p className="text-sm font-medium">Razorpay payment links (automatic)</p>
            <div className="space-y-1.5"><Label>Key ID</Label><Input value={f.razorpayKeyId} onChange={(e) => set("razorpayKeyId", e.target.value)} placeholder="rzp_live_…" /></div>
            <div className="space-y-1.5"><Label>Key secret</Label><Input type="password" value={f.razorpayKeySecret} onChange={(e) => set("razorpayKeySecret", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Webhook secret</Label><Input type="password" value={f.razorpayWebhookSecret} onChange={(e) => set("razorpayWebhookSecret", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Razorpay Dashboard → Webhooks → add this URL with event “payment_link.paid”</Label>
              <div className="flex gap-2"><Input readOnly value={data?.razorpayWebhookUrl || ""} className="font-mono text-xs" /><Button size="icon" variant="outline" onClick={() => navigator.clipboard.writeText(data?.razorpayWebhookUrl || "")}><Copy className="h-4 w-4" /></Button></div>
            </div>
          </div>
          {noPayment && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Turn on at least one payment method so customers can complete orders.</p>}
          <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save store settings</Button>
        </CardContent>
      </Card>
    </div>
  );
}


function PhotoPicker({ channelId, value, onChange }: { channelId: string; value: string; onChange: (url: string) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const uploadFile = async (file?: File | null) => {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) return toast({ title: "Use a JPG or PNG photo", description: "WhatsApp product photos must be JPG or PNG.", variant: "destructive" });
    if (file.size > 5 * 1024 * 1024) return toast({ title: "Photo too large", description: "Keep it under 5 MB.", variant: "destructive" });
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("channelId", channelId);
      const res = await apiRequestFormData("POST", `/api/store/upload-image?channelId=${channelId}`, fd);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Upload failed");
      onChange(j.url);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative overflow-hidden rounded-xl border">
          <img src={value} alt="" className="h-48 w-full object-cover" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <label className="cursor-pointer rounded-lg bg-background/90 px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-background">
              Replace
              <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => uploadFile(e.target.files?.[0])} />
            </label>
            <button type="button" onClick={() => onChange("")} className="rounded-lg bg-background/90 p-1.5 shadow-sm hover:bg-background" aria-label="Remove photo"><X className="h-3.5 w-3.5" /></button>
          </div>
          {busy && <div className="absolute inset-0 flex items-center justify-center bg-background/70"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        </div>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); uploadFile(e.dataTransfer.files?.[0]); }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${drag ? "border-[var(--brand)] bg-[var(--brand-100)]" : "hover:border-foreground/30"}`}
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-7 w-7 text-muted-foreground" />}
          <span className="text-sm font-medium">{busy ? "Uploading…" : "Upload a photo"}</span>
          <span className="text-xs text-muted-foreground">Drag & drop or click · JPG or PNG · up to 5 MB</span>
          <input type="file" accept="image/jpeg,image/png" className="sr-only" disabled={busy} onChange={(e) => uploadFile(e.target.files?.[0])} />
        </label>
      )}
      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowLink((v) => !v)}>
        {showLink ? "Hide link field" : "Or paste an image link"}
      </button>
      {showLink && <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://yourshop.com/images/cake.jpg" />}
    </div>
  );
}
