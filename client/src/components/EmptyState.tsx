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

// components/common/EmptyState.tsx
import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  buttonText?: string;
  onButtonClick?: () => void;
  iconClassName?: string;
  iconBgClassName?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  buttonText,
  onButtonClick,
  iconClassName = "w-10 h-10 text-muted-foreground",
  iconBgClassName = "w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 bg-background rounded-lg border border-border">
      <div className={iconBgClassName}>
        <Icon className={iconClassName} />
      </div>

      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>

      {description && (
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          {description}
        </p>
      )}

      {buttonText && onButtonClick && (
        <button
          onClick={onButtonClick}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          {buttonText}
        </button>
      )}
    </div>
  );
}
