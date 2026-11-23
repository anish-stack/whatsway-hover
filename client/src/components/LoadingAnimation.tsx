/**
 * Short branded intro shown once right after login.
 * Always calls onComplete (after `duration`, with a hard fallback), so the
 * app can never get stuck on this screen. Skips itself for users who prefer
 * reduced motion.
 */
import { useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";

interface Props {
  onComplete?: () => void;
  duration?: number;
}

export default function LoadingAnimation({ onComplete, duration = 1100 }: Props) {
  const done = useRef(false);
  const cb = useRef(onComplete);
  cb.current = onComplete;

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      cb.current?.();
    };
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(finish, reduce ? 0 : duration);
    const hard = setTimeout(finish, 3000); // safety net
    return () => { clearTimeout(t); clearTimeout(hard); };
  }, [duration]);

  return (
    <div className="flex flex-col items-center gap-5" role="status" aria-label="Loading">
      <div className="relative h-20 w-20">
        <span className="absolute inset-0 animate-ping rounded-3xl bg-[var(--brand)] opacity-20" />
        <span className="absolute inset-0 flex items-center justify-center rounded-3xl bg-gradient-to-br from-[var(--brand)] to-[var(--brand-700,#0b6b3a)] text-white shadow-[0_18px_40px_-14px_var(--brand)]">
          <MessageCircle className="h-9 w-9" />
        </span>
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--brand)]"
          style={{ animation: `hc-load ${duration}ms ease-out forwards` }}
        />
      </div>
      <p className="text-sm text-muted-foreground">Setting up your workspace…</p>
      <style>{`@keyframes hc-load{from{width:0}to{width:100%}}`}</style>
    </div>
  );
}
