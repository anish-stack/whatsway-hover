import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MessageSquareQuote, Settings2 } from "lucide-react";
import type { CannedMessage } from "./canned";

export function useCanned() {
  return useQuery<{ data: CannedMessage[] }>({ queryKey: ["/api/canned-messages"], staleTime: 60_000 });
}

export function rankCanned(list: CannedMessage[], q: string) {
  const s = q.toLowerCase().trim();
  return list
    .filter((m) => !s || m.shortcut.includes(s) || m.title.toLowerCase().includes(s) || m.category.toLowerCase().includes(s) || m.content.toLowerCase().includes(s))
    .sort((a, b) => Number(b.shortcut.startsWith(s)) - Number(a.shortcut.startsWith(s)) || b.usageCount - a.usageCount)
    .slice(0, 50);
}

/** Inline list above the composer while the message starts with "/". */
export function SlashSuggestions({ rows, query, onPick, activeIndex }: { rows: CannedMessage[]; query: string; onPick: (m: CannedMessage) => void; activeIndex: number }) {
  if (!rows.length) return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border bg-popover p-3 text-sm text-muted-foreground shadow-md">
      No saved reply for "/{query}". <a href="/canned-messages" className="text-[var(--brand)] underline">Create one</a>
    </div>
  );
  return (
    <div role="listbox" aria-label="Saved replies" className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-72 overflow-y-auto rounded-lg border bg-popover shadow-md">
      <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">↑↓ to choose · Enter or Tab to insert · Esc to close</p>
      {rows.map((m, i) => (
        <button key={m.id} type="button" role="option" aria-selected={i === activeIndex}
          onMouseDown={(e) => { e.preventDefault(); onPick(m); }}
          className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-muted ${i === activeIndex ? "bg-muted" : ""}`}>
          <span className="pt-0.5 font-mono text-xs text-[var(--brand)]">/{m.shortcut}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{m.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{m.content}</span>
          </span>
          <span className="text-[10px] text-muted-foreground">{m.category}</span>
        </button>
      ))}
    </div>
  );
}

/** Button + searchable popover, filtered by category. */
export function CannedPickerButton({ onPick, disabled }: { onPick: (m: CannedMessage) => void; disabled?: boolean }) {
  const { data, isLoading } = useCanned();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);
  const all = data?.data || [];
  const cats = useMemo(() => ["All", ...Array.from(new Set(all.map((m) => m.category)))], [all]);
  const rows = rankCanned(cat === "All" ? all : all.filter((m) => m.category === cat), q);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 md:h-9 md:w-9" disabled={disabled} aria-label="Saved replies">
                <MessageSquareQuote className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Saved replies (or type /)</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="start" side="top" className="w-[380px] p-0">
        <div className="space-y-2 border-b p-3">
          <Input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value.replace(/^\//, ""))} placeholder="Search saved replies" />
          <div className="flex flex-wrap gap-1">
            {cats.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)} className={`rounded-full border px-2.5 py-0.5 text-xs ${cat === c ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]" : ""}`}>{c}</button>
            ))}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No saved replies yet.</p>
          ) : rows.map((m) => (
            <button key={m.id} type="button" onClick={() => { onPick(m); setOpen(false); setQ(""); }} className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted">
              <span className="flex items-center gap-2"><span className="font-medium">{m.title}</span><span className="font-mono text-xs text-[var(--brand)]">/{m.shortcut}</span></span>
              <span className="line-clamp-2 text-xs text-muted-foreground">{m.content}</span>
            </button>
          ))}
        </div>
        <a href="/canned-messages" className="flex items-center gap-2 border-t px-3 py-2 text-sm text-muted-foreground hover:bg-muted"><Settings2 className="h-4 w-4" />Manage saved replies</a>
      </PopoverContent>
    </Popover>
  );
}

export async function markCannedUsed(id: string) {
  try { await apiRequest("POST", `/api/canned-messages/${id}/used`, {}); } catch { /* ignore */ }
}
