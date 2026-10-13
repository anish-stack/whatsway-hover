/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * Original Author: BTPL Engineering Team
 * Website: https://hoverbusinessservices.com
 * Contact: info@hovermedia.in
 *
  
 *
  
 * ============================================================
 */

// components/dashboard/CardStat.tsx
import { Card, CardContent } from "@/components/ui/card";

interface CardStatProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  subtitle?: string; // Optional subtitle (jaise "Across all algorithms")
  iconClassName?: string;
  valueClassName?: string;
  borderColor?: string;
}

export function CardStat({
  label,
  value,
  icon,
  subtitle,
  iconClassName = "bg-primary/10 text-primary",
  valueClassName = "text-foreground",
  borderColor = "border-l-[var(--flare)]",
}: CardStatProps) {
  return (
    <Card
      className={`rounded-2xl border-l-[3px] ${borderColor} bg-background transition-shadow duration-200 hover:shadow-[0_14px_34px_-24px_rgba(22,18,46,0.6)]`}
    >
      <CardContent className="px-6 py-4">
        {/* Icon and Label Row */}
        <div className="flex items-center gap-3 mb-1">
          <div className={`rounded-lg p-2.5 ${iconClassName}`}>{icon}</div>
          <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
        </div>

        {/* Value */}
        <div
          className={`font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.03em] ${valueClassName}`}
        >
          {value}
        </div>

        {/* Optional Subtitle */}
        {subtitle && (
          <p className="text-sm text-muted-foreground font-normal">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
