/**
 * WhatsApp Meta cost calculator — uses the active, admin-managed rate card.
 * Every figure is an estimate; Meta determines actual charges.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KNOWN_COUNTRIES, ESTIMATE_DISCLAIMER } from "@shared/meta-billing";
import { CATEGORY_COLORS, CATEGORY_LABEL, ErrorBlock, MetaBillingNotice, fmtInt, fmtMoney, getJson, qs } from "@/components/meta-billing/shared";

const CATS = ["marketing", "utility", "authentication", "service"] as const;

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export default function CostCalculatorPage() {
  const [country, setCountry] = useState("IN");
  const [phones, setPhones] = useState("1");
  const [counts, setCounts] = useState<Record<string, string>>({ marketing: "1000", utility: "0", authentication: "0", service: "0" });
  const params = useDebounced({ country, phoneNumbers: Math.max(1, Number(phones) || 1), ...Object.fromEntries(CATS.map((c) => [c, Math.max(0, Math.floor(Number(counts[c]) || 0))])) });

  const { data, isFetching, isError, error } = useQuery<any>({
    queryKey: ["/api/whatsapp/cost-estimate", params],
    queryFn: () => getJson(`/api/whatsapp/cost-estimate${qs(params as any)}`),
    placeholderData: (prev: any) => prev,
  });
  const currency = data?.currency && data.currency !== "MIXED" ? data.currency : "INR";

  return (
    <div className="flex-1 min-h-screen bg-background">
      <Header title="Cost Calculator" subtitle="Estimate Meta WhatsApp charges before you send" />
      <main className="grid grid-cols-1 gap-5 p-4 sm:p-6 xl:grid-cols-5">
        <Card className="border-border shadow-none xl:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base sm:text-base"><Calculator className="h-4 w-4 text-primary" />Your volume</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="cc-country">Recipient country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="cc-country" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {KNOWN_COUNTRIES.map((c) => <SelectItem key={c.iso} value={c.iso}>{c.name}</SelectItem>)}
                  <SelectItem value="*">Other / rest of world</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {CATS.map((c) => (
              <div key={c}>
                <Label htmlFor={`cc-${c}`} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />{CATEGORY_LABEL[c]} messages
                </Label>
                <Input id={`cc-${c}`} type="number" inputMode="numeric" min={0} className="mt-1" value={counts[c]}
                  onChange={(e) => setCounts((s) => ({ ...s, [c]: e.target.value }))} />
              </div>
            ))}
            <div>
              <Label htmlFor="cc-phones">Business phone numbers</Label>
              <Input id="cc-phones" type="number" min={1} className="mt-1" value={phones} onChange={(e) => setPhones(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Used for per-number free allowances where Meta offers them.</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 xl:col-span-3">
          <MetaBillingNotice compact />
          {isError ? <ErrorBlock error={error} /> : (
            <Card className="border-border shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base sm:text-base">Estimate for {data?.countryName ?? "…"}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Category</th><th className="py-2 pr-3 text-right font-medium">Messages</th>
                    <th className="py-2 pr-3 text-right font-medium">Free</th><th className="py-2 pr-3 text-right font-medium">Rate</th>
                    <th className="py-2 text-right font-medium">Estimated cost</th></tr></thead>
                  <tbody>
                    {(data?.lines ?? []).map((l: any) => (
                      <tr key={l.category} className="border-b border-border/60 last:border-0 align-top">
                        <td className="py-2 pr-3">
                          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[l.category] }} />{CATEGORY_LABEL[l.category]}</span>
                          {l.volumeDiscountApplied && <Badge variant="outline" className="ml-2 text-[10px]">volume tier</Badge>}
                          {l.note && <p className="mt-0.5 text-xs text-amber-700">{l.note}</p>}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{fmtInt(l.count)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{l.freeAllowance ? fmtInt(Math.min(l.freeAllowance, l.count)) : "—"}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-xs">{l.baseRate === null ? "—" : `${l.effectiveRate?.toFixed(4)}`}</td>
                        <td className="py-2 text-right tabular-nums">{fmtMoney(l.cost, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="pt-3 text-right text-sm font-semibold">Total estimated Meta cost</td>
                      <td className={`pt-3 text-right text-lg font-semibold tabular-nums ${isFetching ? "opacity-60" : ""}`}>{fmtMoney(data?.total ?? 0, currency)}</td>
                    </tr>
                  </tfoot>
                </table>
                {data?.mixedCurrencies && <p className="mt-2 text-xs text-amber-700">Rates for this country use more than one currency; total is indicative only.</p>}
                <div className="mt-4 space-y-1 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{ESTIMATE_DISCLAIMER}</p>
                  <p>{data?.taxDisclaimer}</p>
                  <p>Service replies inside the 24-hour customer service window, utility templates inside that window and free-entry-point conversations are not charged by Meta. Volume tiers apply across your whole Meta business portfolio and are decided by Meta.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
