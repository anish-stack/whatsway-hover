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

import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { MdOutlinePayment } from "react-icons/md";
import {
    LayoutDashboard,
    Users,
    Megaphone,
    FileText,
    MessageSquare,
    Bot,
    BarChart3,
    Settings,
    Zap,
    ScrollText,
    UsersRound,
    Menu,
    LogOut,
    X,
    Bell,
    CheckCircle,
    SlidersHorizontal,
    Star,
    User,
    Globe,
    Code,
    BookOpen,
    Smartphone,
    Gauge,
    Handshake,
    BadgeCheck,
    IndianRupee,
    Activity,
    CreditCard,
    Calculator,
    UserPlus,
    Receipt,
    Tag,
  Workflow,
  Plug,
  Store,
  CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelSwitcher } from "@/components/channel-switcher";
import { useChannelContext } from "@/contexts/channel-context";
import { useTranslation } from "@/lib/i18n";
import { LanguageSelector } from "@/components/language-selector";
import { useAuth } from "@/contexts/auth-context";
// import logo from "../../images/logo1924.jpg";
import { GiUpgrade } from "react-icons/gi";
import { RiSecurePaymentFill } from "react-icons/ri";
import { AiOutlineTransaction } from "react-icons/ai";
import { MdOutlineSupportAgent, MdGroups } from "react-icons/md";
import { useSidebar } from "@/contexts/sidebar-context";
import { AdminCreditBox } from "../AdminCreditBox";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSettings } from "@/types/types";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Role = "superadmin" | "admin" | "user" | "team" | "reseller";

interface NavItem {
    /** Optional sidebar group heading (customer menu). */
    section?: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    labelKey: string;
    badge?: string | number;
    color?: string;
    alwaysVisible?: boolean;
    requiredPrefix?: string;
    allowedRoles?: Role[];
    /** reseller feature flag required to show this item */
    resellerPermission?: string;
}

function getNavItems(role: string): NavItem[] {
    // A reseller is not a platform operator: it gets its own short menu
    // rather than the admin one with pieces hidden.
    if (role === "reseller") {
        // Reseller portal menu. Items gated by permissions are filtered
        // in the component using /api/reseller/me (server enforces too).
        const R: Role[] = ["reseller"];
        return [
            { section: "Reseller", href: "/reseller", icon: LayoutDashboard, labelKey: "Dashboard", color: "text-green-600", alwaysVisible: true, allowedRoles: R },
            { section: "Reseller", href: "/reseller/customers", icon: Users, labelKey: "My Customers", color: "text-blue-600", alwaysVisible: true, allowedRoles: R },
            { section: "Reseller", href: "/reseller/customers/new", icon: UserPlus, labelKey: "Add Customer", color: "text-[var(--brand)]", alwaysVisible: true, allowedRoles: R, resellerPermission: "createCustomers" },
            { section: "Reseller", href: "/reseller/subscriptions", icon: CreditCard, labelKey: "Subscriptions", color: "text-[var(--brand)]", alwaysVisible: true, allowedRoles: R },
            { section: "Earnings", href: "/reseller/sales", icon: IndianRupee, labelKey: "Sales & Earnings", color: "text-[var(--brand)]", alwaysVisible: true, allowedRoles: R },
            { section: "Earnings", href: "/reseller/transactions", icon: Receipt, labelKey: "Invoices / Transactions", color: "text-[var(--brand)]", alwaysVisible: true, allowedRoles: R, resellerPermission: "viewTransactions" },
            { section: "Earnings", href: "/reseller/pricing", icon: Tag, labelKey: "Pricing & Plans", color: "text-[var(--brand)]", alwaysVisible: true, allowedRoles: R },
            { section: "Account", href: "/user-support-tickets", icon: Bell, labelKey: "Support", color: "text-blue-400", alwaysVisible: true, allowedRoles: R },
            { section: "Account", href: "/reseller/profile", icon: User, labelKey: "Profile & Settings", color: "text-muted-foreground", alwaysVisible: true, allowedRoles: R },
        ];
    }

    if (role === "admin") {
        // Customer (tenant owner) menu, grouped into sections.
        return [
            // ── Main ──
            { section: "Main", href: "/dashboard", icon: LayoutDashboard, labelKey: "navigation.dashboard", color: "text-green-600", alwaysVisible: true, allowedRoles: ["superadmin", "admin", "user", "team"] },
            { section: "Main", href: "/inbox", icon: MessageSquare, labelKey: "navigation.inbox", color: "text-blue-400", allowedRoles: ["admin"] },
            { section: "Main", href: "/campaigns", icon: Megaphone, labelKey: "navigation.campaigns", color: "text-orange-600", allowedRoles: ["superadmin", "admin"] },
            { section: "Main", href: "/contacts", icon: Users, labelKey: "navigation.contacts", color: "text-blue-600", allowedRoles: ["superadmin", "admin"] },
            { section: "Main", href: "/groups", icon: MdGroups, labelKey: "navigation.groups", color: "text-blue-400", allowedRoles: ["admin"] },
            { section: "Main", href: "/templates", icon: FileText, labelKey: "navigation.templates", color: "text-[var(--brand)]", allowedRoles: ["superadmin", "admin"] },
            { section: "Main", href: "/template-library", icon: BookOpen, labelKey: "Template Library", color: "text-[var(--brand)]", allowedRoles: ["admin"] },
            { section: "Main", href: "/whatsapp-flows", icon: Workflow, labelKey: "WhatsApp Flows", color: "text-[var(--brand)]", allowedRoles: ["admin"] },
            { section: "Main", href: "/appointments", icon: CalendarCheck, labelKey: "Appointments", color: "text-[var(--brand)]", allowedRoles: ["admin"] },
            { section: "Main", href: "/store", icon: Store, labelKey: "WhatsApp Store", color: "text-[var(--brand)]", allowedRoles: ["admin"] },
            { section: "Main", href: "/app-integrations", icon: Plug, labelKey: "Integrations", color: "text-[var(--brand)]", allowedRoles: ["admin"] },
            { section: "Main", href: "/automation", icon: Zap, labelKey: "navigation.automations", color: "text-[var(--brand)]", allowedRoles: ["superadmin", "admin"] },
            { section: "Main", href: "/settings?tab=ai_setting", icon: Bot, labelKey: "AI Assistant", color: "text-teal-600", allowedRoles: ["admin"] },
            { section: "Main", href: "/analytics", icon: BarChart3, labelKey: "navigation.analytics", color: "text-pink-600", allowedRoles: ["superadmin", "admin"] },
            { section: "Main", href: "/widget-builder", icon: Bot, labelKey: "navigation.widgetBuilder", color: "text-teal-600", alwaysVisible: true, allowedRoles: ["superadmin", "admin", "user"] },
            { section: "Main", href: "/api-docs", icon: Code, labelKey: "navigation.apiDocs", color: "text-cyan-600", allowedRoles: ["admin"] },

            // ── WhatsApp Management ──
            { section: "WhatsApp Management", href: "/settings?tab=whatsapp", icon: Smartphone, labelKey: "WhatsApp Accounts", color: "text-[var(--brand)]", allowedRoles: ["admin"] },
            { section: "WhatsApp Management", href: "/account-health", icon: Activity, labelKey: "Account Health", color: "text-[var(--brand)]", allowedRoles: ["admin"] },
            { section: "WhatsApp Management", href: "/whatsapp-usage", icon: BarChart3, labelKey: "WhatsApp Usage", color: "text-[var(--brand)]", allowedRoles: ["admin"] },
            { section: "WhatsApp Management", href: "/green-tick", icon: BadgeCheck, labelKey: "navigation.greenTick", color: "text-[var(--ok)]", allowedRoles: ["admin"] },

            // ── Billing & Settings ──
            { section: "Billing & Settings", href: "/billing", icon: CreditCard, labelKey: "Subscription & Billing", color: "text-[var(--brand)]", allowedRoles: ["admin"] },
            { section: "Billing & Settings", href: "/cost-calculator", icon: Calculator, labelKey: "Cost Calculator", color: "text-[var(--brand)]", allowedRoles: ["admin"] },
            { section: "Billing & Settings", href: "/settings", icon: Settings, labelKey: "navigation.settings", color: "text-muted-foreground", allowedRoles: ["admin"] },
        ];
    } else {
        // Team or default role
        return [
            {
                href: "/dashboard",
                icon: LayoutDashboard,
                labelKey: "navigation.dashboard",
                color: "text-green-600",
                alwaysVisible: true,
                allowedRoles: ["superadmin", "admin", "user", "team"],
            },
            {
                href: "/inbox",
                icon: MessageSquare,
                labelKey: "navigation.inbox",
                color: "text-blue-400",
                requiredPrefix: "inbox.",
                allowedRoles: ["team"],
            },
            {
                href: "/contacts",
                icon: Users,
                labelKey: "navigation.contacts",
                color: "text-blue-600",
                requiredPrefix: "contacts.",
                allowedRoles: ["team"],
            },
            {
                href: "/groups",
                icon: MdGroups,
                labelKey: "navigation.groups",
                color: "text-blue-400",
                requiredPrefix: "groups.",
                allowedRoles: ["team"],
            },
            {
                href: "/campaigns",
                icon: Megaphone,
                labelKey: "navigation.campaigns",
                color: "text-orange-600",
                requiredPrefix: "campaigns.",
                allowedRoles: ["team"],
            },
            {
                href: "/templates",
                icon: FileText,
                labelKey: "navigation.templates",
                color: "text-[var(--brand)]",
                requiredPrefix: "templates.",
                allowedRoles: ["team"],
            },
            {
                href: "/template-library",
                icon: BookOpen,
                labelKey: "Template Library",
                color: "text-[var(--brand)]",
                requiredPrefix: "templates.",
                allowedRoles: ["team"],
            },

            {
                href: "/automation",
                icon: Zap,
                labelKey: "navigation.automations",
                color: "text-[var(--brand)]",
                requiredPrefix: "automations.",
                allowedRoles: ["team"],
            },
            {
                href: "/analytics",
                icon: BarChart3,
                labelKey: "navigation.analytics",
                color: "text-pink-600",
                requiredPrefix: "analytics.",
                allowedRoles: ["team"],
            },
            {
                href: "/widget-builder",
                icon: Bot,
                labelKey: "navigation.widgetBuilder",
                color: "text-teal-600",
                alwaysVisible: true,
                requiredPrefix: "widgetbuilder.",
                allowedRoles: ["team"],
            },


            // {
            //   href: "/settings",
            //   icon: Settings,
            //   labelKey: "navigation.settings",
            //   color: "text-muted-foreground",
            //   alwaysVisible: true,
            //   requiredPrefix: "settings.",
            //   allowedRoles: ["team"],
            // },

            {
                href: "/plans",
                icon: Bell,
                labelKey: "navigation.plans",
                color: "text-blue-400",
                requiredPrefix: "plans.",
                allowedRoles: ["team"],
            },
            {
                href: "/gateway",
                icon: Bell,
                labelKey: "navigation.plans",
                color: "text-blue-400",
                requiredPrefix: "gateway.",
                allowedRoles: ["team"],
            },
            {
                href: "/billing/caps",
                icon: Gauge,
                labelKey: "navigation.sendingCaps",
                color: "text-[var(--flare)]",
                alwaysVisible: true,
                allowedRoles: ["superadmin", "admin", "user", "team"],
            },
            {
                href: "/account-health",
                icon: Activity,
                labelKey: "Account Health",
                color: "text-[var(--brand)]",
                requiredPrefix: "analytics.",
                allowedRoles: ["team"],
            },
            {
                href: "/whatsapp-usage",
                icon: BarChart3,
                labelKey: "WhatsApp Usage",
                color: "text-[var(--brand)]",
                requiredPrefix: "analytics.",
                allowedRoles: ["team"],
            },
            {
                href: "/green-tick",
                icon: BadgeCheck,
                labelKey: "navigation.greenTick",
                color: "text-[var(--ok)]",
                alwaysVisible: true,
                allowedRoles: ["superadmin", "admin", "user", "team"],
            },
        ];
    }
}

const sidebarItemsCategories = [
    {
        name: "navigation.dashboard",
        icon: LayoutDashboard,
        path: "/dashboard",
        color: "text-green-600",
    },
    {
        name: "navigation.users",
        icon: Users,
        path: "/users",
        color: "text-green-600",
    },
    {
        name: "navigation.channels",
        icon: Smartphone,
        path: "/channels-management",
        color: "text-blue-500",
    },
    {
        name: "navigation.master_campaigns",
        icon: Megaphone,
        path: "/campaigns",
        badge: "",
        color: "text-blue-600",
    },
    {
        name: "navigation.master_templates",
        icon: FileText,
        path: "/templates",
        badge: "",
        color: "text-[var(--brand)]",
    },
    {
        name: "navigation.master_contacts",
        icon: Users,
        path: "/contacts-management",
        badge: "",
        color: "text-yellow-600",
    },
    {
        name: "navigation.analytics",
        icon: BarChart3,
        path: "/analytics",
        color: "text-teal-500",
    },
    {
        name: "navigation.notifications",
        icon: Bell,
        path: "/notifications",
        color: "text-pink-400",
    },
    {
        name: "navigation.subscription_plans",
        icon: MdOutlinePayment,
        path: "/plans",
        color: "text-blue-400",
    },
    {
        name: "navigation.master_subscriptions",
        icon: CheckCircle,
        path: "/master-subscriptions",
        badge: "",
        color: "text-green-600",
    },
    {
        name: "navigation.transactions_logs",
        icon: AiOutlineTransaction,
        path: "/transactions-logs",
        color: "text-[#00a63e]",
    },
    {
        name: "Reseller Management",
        icon: Handshake,
        path: "/admin/resellers",
        color: "text-[var(--brand)]",
    },
    {
        name: "Billing & Meta Usage",
        icon: CreditCard,
        path: "/admin/billing",
        color: "text-[var(--brand)]",
    },
    {
        name: "Customer WhatsApp Accounts",
        icon: Activity,
        path: "/admin/whatsapp-accounts",
        color: "text-[var(--brand)]",
    },
    {
        name: "Meta Rate Card",
        icon: IndianRupee,
        path: "/admin/meta-rate-cards",
        color: "text-[var(--brand)]",
    },
    {
        name: "navigation.message_logs",
        icon: MessageSquare,
        path: "/message-logs",
        color: "text-cyan-600",
    },
    {
        name: "navigation.payment_gateway",
        icon: RiSecurePaymentFill,
        path: "/gateway",
        color: "text-[#ffb900]",
    },
    {
        name: "Demo Requests",
        icon: CalendarCheck,
        path: "/demo-requests",
        color: "text-[var(--brand)]",
    },
    {
        name: "navigation.support_tickets",
        icon: MdOutlineSupportAgent,
        path: "/support-tickets",
        color: "text-black-400",
    },
    {
        name: "navigation.app_update",
        icon: GiUpgrade,
        path: "/app-update",
        color: "text-emerald-600",
    },
];

// Category-based structure for superadmin

export default function Sidebar() {
    const [location, setLocation] = useLocation();
    const { user, logout } = useAuth();
    const { t } = useTranslation();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const isSuper = user?.role === "superadmin";
    const isAdmin = user?.role === "admin";
    const { toast } = useToast();

    const navItems = getNavItems(user?.role || "");

    const { data: resellerMe } = useQuery<any>({
        queryKey: ["/api/reseller/me"],
        queryFn: () => apiRequest("GET", "/api/reseller/me").then((r) => r.json()).then((j) => j.data),
        enabled: user?.role === "reseller",
        staleTime: 60_000,
    });

    const { data: brandSettings } = useQuery<AppSettings>({
        queryKey: ["/api/brand-settings"],
        queryFn: () => fetch("/api/brand-settings").then((res) => res.json()),
        staleTime: 5 * 60 * 1000,
    });

    const { data: versionData } = useQuery<{ version: string; product: string }>({
        queryKey: ["/api/version"],
        queryFn: () => fetch("/api/version").then((r) => r.json()),
        staleTime: 30 * 60 * 1000,
        enabled: isSuper,
    });

    const {
        isOpen,
        toggle,
        close,
        open,
        isCollapsed,
        selectedMenu,
        setCollapsed,
        setSelectedMenu,
    } = useSidebar();

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setCollapsed(true);
            } else {
                // Mobile pe sidebar automatically collapse na ho, agar open hai tabhi setCollapsed(false)
                if (isOpen) setCollapsed(false);
            }
        };

        handleResize(); // Initial check on mount

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [isOpen, setCollapsed]); // isOpen dependency add karo taaki resize pe updated value mile
    const canView = (item: NavItem): boolean => {
        if (!user) return false;

        const role = user.role as Role;

        if (role === "reseller") {
            if (!item.allowedRoles?.includes("reseller")) return false;
            if (item.resellerPermission) return resellerMe?.permissions?.[item.resellerPermission] === true;
            return true;
        }

        // SUPERADMIN sees everything
        if (role === "superadmin") return true;

        // TEAM role must ONLY use permissions — but allow alwaysVisible items
        if (role === "team") {
            // allow items with no requiredPrefix if they are alwaysVisible
            if (!item.requiredPrefix) {
                return item.alwaysVisible === true;
            }

            if (!user.permissions) return false;

            const perms = Array.isArray(user.permissions)
                ? user.permissions
                : Object.keys(user.permissions);

            const normalize = (str: string) => str.replace(".", ":");

            return perms.some((perm) =>
                perm.startsWith(normalize(item.requiredPrefix!))
            );
        }

        // ---- ADMIN / USER LOGIC ----
        if (item.allowedRoles && !item.allowedRoles.includes(role)) {
            return false;
        }

        if (item.alwaysVisible) return true;

        if (!item.requiredPrefix) return true;

        if (!user.permissions) return false;

        const perms = Array.isArray(user.permissions)
            ? user.permissions
            : Object.keys(user.permissions);

        const normalize = (str: string) => str.replace(".", ":");

        return perms.some((perm) =>
            perm.startsWith(normalize(item.requiredPrefix!))
        );
    };

    const canViewOld = (item: NavItem): boolean => {
        if (!user) return false;
        if (item.allowedRoles && !item.allowedRoles.includes(user.role as Role)) {
            return false;
        }
        if (user.role === "superadmin") {
            return true;
        }

        // --- TEAM ROLE custom permission-based ---
        if (user.role === "team") {
            if (!user.permissions) return false;

            // requiredPrefix must match permission
            if (!item.requiredPrefix) return false;

            const perms = Array.isArray(user.permissions)
                ? user.permissions
                : Object.keys(user.permissions);

            const normalize = (str: string) => str.replace(".", ":");

            return perms.some((perm) =>
                perm.startsWith(normalize(item.requiredPrefix!))
            );
        }
        if (item.alwaysVisible) {
            return true;
        }
        if (!item.requiredPrefix) {
            return true;
        }
        if (!user.permissions) {
            return false;
        }
        const perms = Array.isArray(user.permissions)
            ? user.permissions
            : Object.keys(user.permissions);
        const normalize = (str: string) => str.replace(".", ":");
        return perms.some((perm) =>
            perm.startsWith(normalize(item.requiredPrefix!))
        );
    };

    const renderLink = (
        name: string,
        Icon: React.ComponentType<{ className?: string }>,
        path: string,
        badge?: string | number,
        colorClass?: string
    ) => {
        const isActive = location === path;
        return (
            <Link
                key={path}
                href={path}
                className={cn(
                    "group flex items-center rounded-xl border-l-[3px] px-3 py-2.5 text-sm font-semibold transition-colors duration-200",
                    isActive
                        ? "border-[var(--flare)] bg-primary/10 text-primary"
                        : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
                onClick={toggle}
            >
                <Icon
                    className={cn(
                        "w-5 h-5 mr-3",
                        isActive ? "text-primary" : colorClass
                    )}
                />

                {name}
                {badge && (
                    <span className="ml-auto rounded-full bg-[var(--flare)] px-2 py-0.5 text-[11px] font-bold text-[#3d2409]">
                        {badge}
                    </span>
                )}
            </Link>
        );
    };

    const queryClient = useQueryClient();
    const { selectedChannel } = useChannelContext();
    const channelId = selectedChannel?.id;

    const {
        data: aiData,
        isLoading,
        error,
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ["/api/ai-settings/channel", channelId],
        queryFn: async () => {
            if (!channelId) return null;
            const res = await fetch(`/api/ai-settings/channel/${channelId}`);
            if (!res.ok) throw new Error("Failed to fetch settings");
            return res.json();
        },
        enabled: !!channelId,
    });

    const aiSettings = aiData || null;
    const isAIActive = aiSettings?.isActive ?? false;

    const handleToggleAI = async () => {
        // if (!aiSettings) return;
        if (!aiSettings) {
            toast({
                title: "No settings found",
                description: "Please add AI settings.",
                variant: "destructive",
            });
            return;
        }

        const updatedValue = !isAIActive;

        try {
            const res = await apiRequest("PUT", `/api/ai-settings/${aiSettings.id}`, { isActive: updatedValue });

            if (!res.ok) throw new Error();

            toast({
                title: "Updated",
                description: "AI status updated successfully.",
            });

            refetch();
            queryClient.invalidateQueries({ queryKey: ["/api/ai-settings/channel", channelId] });
        } catch {
            toast({
                title: "Error",
                description: "Unable to update AI status.",
                variant: "destructive",
            });
        }
    };

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-[var(--ink)]/55 backdrop-blur-sm lg:hidden"
                    onClick={toggle}
                />
            )}

            <div
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-background transition-transform duration-300",
                    isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between border-b border-border px-5 py-4">
                        <Link
                            href="/dashboard"
                            className="flex items-center flex-col space-x-2 sm:space-x-3"
                        >
                            {brandSettings?.logo ? (
                                <img
                                    src={brandSettings?.logo}
                                    alt="Logo"
                                    className=" h-10 object-contain"
                                />
                            ) : (
                                <div className="rounded-xl bg-primary p-2.5 text-primary-foreground">
                                    <MessageSquare className="h-6 w-6" />
                                </div>
                            )}
                            <span className=" text-[10px] sm:text-xs pl-8">
                                {brandSettings?.tagline}
                            </span>
                        </Link>
                        <button
                            onClick={toggle}
                            className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {isAdmin || user?.role == "team" ? (
                        <div className="border-b border-border px-5 py-3">
                            <ChannelSwitcher />
                        </div>
                    ) : (
                        ""
                    )}

                    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                        {isSuper
                            ? sidebarItemsCategories.map((item) =>
                                renderLink(
                                    t(item.name),
                                    item.icon,
                                    item.path,
                                    item.badge,
                                    item.color
                                )
                            )
                            : navItems
                                .filter(canView)
                                .map((item, idx, arr) => (
                                    <React.Fragment key={item.href}>
                                        {item.section && item.section !== arr[idx - 1]?.section && (
                                            <p className={cn("px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", idx === 0 ? "pt-0" : "pt-4")}>
                                                {item.section}
                                            </p>
                                        )}
                                        {renderLink(
                                            t(item.labelKey),
                                            item.icon,
                                            item.href,
                                            item.badge,
                                            item.color
                                        )}
                                    </React.Fragment>
                                ))}
                    </nav>

                    <div className="w-[180px] border-t border-border px-4 py-2 sm:hidden">
                        <LanguageSelector />
                    </div>
                    {/* {isAdmin ? (
          ) : (
            ""
          )} */}

                    {/* {isAdmin && (
            <div className="px-3 py-2">
              <AdminCreditBox />
            </div>
          )} */}

                    {/* Smaller Toggle Button with Green Color */}
                    {isAdmin && (
                        <div className="p-2 border-t border-border">
                            <div className="flex items-center space-x-3 rounded-xl border border-primary/15 bg-primary/[0.06] p-3">
                                {/* Icon Box */}
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>

                                {/* Text + Status Dot */}
                                <div className="flex-1">
                                    <p className="text-sm font-semibold text-foreground">
                                        {t("common.aiAssistant")}
                                    </p>
                                    <div className="flex items-center space-x-2">
                                        <div className="flex items-center space-x-3">
                                            {/* Status Dot */}
                                            <div
                                                className={`w-2 h-2 rounded-full transition-all ${isAIActive
                                                    ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]"
                                                    : "bg-gray-400"
                                                    }`}
                                            ></div>

                                            {/* Status Text */}
                                            <span className="text-xs text-muted-foreground">
                                                {isAIActive ? t("common.active") : t("common.inactive")}
                                            </span>

                                            {/* Toggle Button */}
                                            <button
                                                onClick={handleToggleAI}
                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors 
                                                    ${!aiSettings
                                                        ? "bg-gray-300 cursor-not-allowed"
                                                        : isAIActive
                                                            ? "bg-primary"
                                                            : "bg-border"
                                                    }
                                                `}
                                            >
                                                <span
                                                    className={`inline-block h-3 w-3 transform rounded-full bg-background transition 
        ${isAIActive ? "translate-x-5" : "translate-x-1"}
      `}
                                                />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <Link href="/settings?tab=ai_setting">
                                    <button
                                        className="p-1.5 rounded-md hover:bg-primary/10 transition-colors"
                                        title={t("common.aiSettings")}
                                    >
                                        <SlidersHorizontal className="w-4 h-4 text-primary" />
                                    </button>
                                </Link>
                            </div>
                        </div>
                    )}

                    {isSuper && versionData?.version && (
                        <div className="px-4 py-1.5 border-t border-border">
                            <p className="text-center text-[10px] text-muted-foreground">v{versionData.version}</p>
                        </div>
                    )}

                    {/* User Profile */}
                    <div className="p-2 border-t border-border">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="flex w-full items-center space-x-3 rounded-xl p-2 transition-colors hover:bg-secondary">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
                                        <span className="text-sm font-medium text-white">
                                            {user
                                                ? (
                                                    user.firstName?.[0] || user.username[0]
                                                ).toUpperCase()
                                                : "U"}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0 text-left">
                                        <p className="text-sm font-semibold text-foreground truncate">
                                            {user
                                                ? user.firstName && user.lastName
                                                    ? `${user.firstName} ${user.lastName}`
                                                    : user.username
                                                : t("common.user")}
                                        </p>
                                        <p className="truncate text-xs capitalize text-muted-foreground">
                                            {user?.role || t("common.user")}
                                        </p>
                                    </div>
                                    <Settings className="h-4 w-4 text-muted-foreground" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                {isAdmin && (
                                    <div className="px-3 py-2">
                                        <AdminCreditBox />
                                    </div>
                                )}
                                <DropdownMenuLabel>{t("common.myAccount")}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <Link href="/settings" className="cursor-pointer">
                                        <Settings className="mr-2 h-4 w-4" />
                                        <span>{t("navigation.settings")}</span>
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                    <Link href="/account" className="cursor-pointer">
                                        <User className="mr-2 h-4 w-4" />
                                        <span>{t("navigation.account")}</span>
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={logout}
                                    className="cursor-pointer text-red-600"
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>{t("common.logout")}</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
        </>
    );
}
