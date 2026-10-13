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

import {
  Plus,
  LogOut,
  Settings,
  User,
  Menu,
  ScrollText,
  Headphones,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";

import { useSidebar } from "@/contexts/sidebar-context";
import { LanguageSelector } from "../language-selector";
import { useTranslation } from "@/lib/i18n";
import NotificationBell from "@/components/notification/NotificationBell";

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  userPhotoUrl?: string;
}

export default function Header({
  title,
  subtitle,
  action,
  userPhotoUrl,
}: HeaderProps) {
  const [, setLocation] = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const username = (user?.firstName || "") + " " + (user?.lastName || "");

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const { isOpen, toggle } = useSidebar();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={toggle}
            aria-label="Open menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="min-w-0 border-l-[3px] border-[var(--flare)] pl-3">
            <h1 className="truncate font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.03em] text-foreground sm:text-lg lg:text-2xl">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden truncate text-sm text-muted-foreground lg:block">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {action && (
            <Button
              onClick={action.onClick}
              size="sm"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{action.label}</span>
            </Button>
          )}

          <div className="hidden sm:block">
            <LanguageSelector />
          </div>

          {user?.role != "superadmin" && (
            <>
              <button
                onClick={() => setLocation("/settings?tab=support")}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                title="Support"
              >
                <Headphones className="h-[18px] w-[18px]" />
              </button>
              <button
                onClick={() => setLocation("/settings?tab=message_logs")}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                title="Message Logs"
              >
                <ScrollText className="h-[18px] w-[18px]" />
              </button>
              <NotificationBell />
            </>
          )}

          <div className="relative" ref={dropdownRef}>
            <button
              className="h-9 w-9 overflow-hidden rounded-xl border border-border transition-colors hover:border-primary"
              onClick={() => setDropdownOpen((x) => !x)}
            >
              <img
                src={
                  userPhotoUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    username
                  )}&background=08A957&color=fff`
                }
                className="h-full w-full object-cover"
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-popover shadow-[0_18px_40px_-20px_rgba(22,18,46,0.5)]">
                <div className="border-b border-border px-4 py-3">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {username}
                  </p>
                  <p className="truncate text-xs capitalize text-muted-foreground">
                    {user?.role}
                  </p>
                </div>

                <div className="p-1.5">
                  <button
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary"
                    onClick={() => {
                      setLocation("/settings");
                      setDropdownOpen(false);
                    }}
                  >
                    <Settings className="h-4 w-4 opacity-70" />
                    {t("Landing.header.Settings")}
                  </button>

                  <button
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary hover:text-primary"
                    onClick={() => {
                      setLocation("/account");
                      setDropdownOpen(false);
                    }}
                  >
                    <User className="h-4 w-4 opacity-70" />
                    {t("Landing.header.Account")}
                  </button>

                  <div className="my-1 h-px bg-border" />

                  <button
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-[var(--bad)] transition-colors hover:bg-[var(--bad-soft)]"
                    onClick={logout}
                  >
                    <LogOut className="h-4 w-4 opacity-70" />
                    {t("Landing.header.logout")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
