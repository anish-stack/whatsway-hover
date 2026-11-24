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

import React, { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChannelProvider } from "@/contexts/channel-context";
import { UnreadCountProvider } from "@/contexts/UnreadCountContext";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { SocketProvider } from "./contexts/socket-context";
import { useI18n } from "@/lib/i18n";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Contacts from "@/pages/contacts";
import Campaigns from "@/pages/campaigns";
import Templates from "@/pages/templates";
import Inbox from "@/pages/inbox";
import Automations from "@/pages/automations";
import Analytics from "@/pages/analytics";
import CampaignAnalytics from "@/pages/campaign-analytics";
import Settings from "@/pages/settings";
import Logs from "@/pages/logs";
import Team from "@/pages/team";
import Sidebar from "@/components/layout/sidebar";
import Account from "./pages/account";
import { AppLayout } from "./components/layout/AppLayout";
import BillingOverviewPage from "@/pages/billing/overview";
import CostCalculatorPage from "@/pages/billing/cost-calculator";
import WhatsAppUsagePage from "@/pages/whatsapp/usage";
import AccountHealthPage from "@/pages/whatsapp/account-health";
import TemplateLibraryPage from "@/pages/template-library";
import WhatsAppFlowsPage from "@/pages/whatsapp-flows";
import FlowStudioEditor from "@/pages/flow-studio-editor";
import AppIntegrationsPage from "@/pages/app-integrations";
import MiniStorePage from "@/pages/mini-store";
import AppointmentsPage from "@/pages/appointments";
import BookDemoDialog from "@/components/BookDemoDialog";
import DemoRequestsPage from "@/pages/admin/demo-requests";
import MetaRateCardsPage from "@/pages/admin/meta-rate-cards";
import AdminWhatsAppAccountsPage from "@/pages/admin/whatsapp-accounts";
import AdminMetaBillingPage from "@/pages/admin/meta-billing";
import CapsPage from "@/pages/billing/caps";
import ResellerDashboard from "@/pages/reseller-portal/dashboard";
import { ResellerAddCustomerPage, ResellerCustomerDetailPage, ResellerCustomersPage } from "@/pages/reseller-portal/customers";
import { ResellerPricingPage, ResellerProfilePage, ResellerSalesPage, ResellerSubscriptionsPage, ResellerTransactionsPage } from "@/pages/reseller-portal/other";
import AdminResellersPage from "@/pages/admin/resellers";
import AdminResellerDetailPage from "@/pages/admin/reseller-detail";
import AcceptInvitePage from "@/pages/accept-invite";
import PayPage from "@/pages/pay";
import BlueTickPage from "@/pages/blue-tick";
import BlueTickAdmin from "@/pages/blue-tick-admin";
import ChatbotBuilder from "./pages/chatbot-builder";
import AddChatbotBuilder from "./pages/add-chatbot-builder";
import WidgetBuilder from "./pages/widget-builder";
import Websites from "./pages/websites";
import Home from "./pages/Home";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Signup from "./pages/Signup";
import LoadingAnimation from "./components/LoadingAnimation";
import Plans from "./pages/plans";
import GatewaySettings from "./pages/GatewaySettings";
import BotFlowBuilder from "./pages/BotFlowBuilder";
import Workflows from "./pages/Workflows";
import AIAssistant from "./pages/AIAssistant";
import AutoResponses from "./pages/AutoResponses";
import WABAConnection from "./pages/WABAConnection";
import MultiNumber from "./pages/MultiNumber";
import Webhooks from "./pages/Webhooks";
import QRCodes from "./pages/QRCodes";
import CRMSystem from "./pages/CRMSystem";
import LeadManagement from "./pages/LeadManagement";
import BulkImport from "./pages/BulkImport";
import Segmentation from "./pages/Segmentation";
import Reports from "./pages/Reports";
import Notifications from "./pages/Notifications";
import UserNotifications from "./pages/UserNotifications";
import ChatHub from "./pages/ChatHub";
import User from "./pages/users";
import TransactionsPage from "./pages/transactions-page";
import ContactsManagements from "./pages/contacts-managements";
import SupportTicketsNew from "./pages/support-tickets";
import userDetails from "./pages/userDetails";
import UserSupportTicketsNew from "./pages/user-support-tickets";
import GroupsUI from "./pages/group-list";
import AllSubscriptionsPage from "./pages/masterSubscriptions";
import DemoPage from "./pages/DemoPage";
import MinimalLoader from "./components/MinimalLoader";
import { TermsPage } from "./pages/TermsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { DataDeletionPage } from "./pages/DataDeletionPage";
import VerifyEmail from "./pages/verify-email";
import AboutUs from "./pages/AboutUs";
import { ScrollToTop } from "./components/ScrollToTop";
import Integrations from "./components/Integrations";
import PressKit from "./components/PressKit";
import CaseStudies from "./components/CaseStudies";
import WhatsAppGuide from "./components/WhatsAppGuide";
import BestPractices from "./components/BestPractices";
import CookiePolicy from "./components/CookiePolicy";
import ContactusLanding from "./components/ContactusLanding";
import { SignupPopupHandler } from "./components/SignupPopupHandler";
import Careers from "./components/Careers";
import LanguageManagement from "./pages/LanguageManagement";
import SuperadminMessageLogs from "./pages/SuperadminMessageLogs";
import ApiDocs from "./pages/api-docs";
import ChannelsManagement from "./pages/channels-management";
import AppUpdate from "./pages/app-update";
import WidgetChat from "./pages/WidgetChat";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";

// Route permissions map. Every authenticated route must have an entry here.
// Missing routes are treated as DENY (redirect to /dashboard). Empty string
// means authenticated-only (no specific permission required).
const ROUTE_PERMISSIONS: Record<string, string> = {
  "/dashboard": "",
  // v3.8 — billing, partner panel and verification
  "/billing/rates": "",
  // v3.9 — Meta usage, account health, cost calculator (no Meta wallet)
  "/whatsapp-usage": "",
  "/account-health": "",
  "/cost-calculator": "",
  "/admin/billing": "",
  "/admin/whatsapp-accounts": "",
  "/admin/meta-rate-cards": "",
  "/billing/caps": "",
  "/partner": "",
  "/resellers": "",
  // v3.10 — reseller portal + super-admin reseller management
  "/reseller": "",
  "/reseller/customers": "",
  "/reseller/customers/new": "",
  "/reseller/customers/:id": "",
  "/reseller/subscriptions": "",
  "/reseller/sales": "",
  "/reseller/transactions": "",
  "/reseller/pricing": "",
  "/reseller/profile": "",
  "/admin/resellers": "",
  "/admin/resellers/:id": "",
  "/green-tick": "",
  "/green-tick/review": "",
  "/contacts": "contacts.view",
  "/users": "",
  "/channels-management": "",
  "/campaigns": "campaigns.view",
  "/templates": "templates.view",
  "/template-library": "templates.view",
  "/whatsapp-flows": "templates.view",
  "/app-integrations": "",
  "/store": "",
  "/appointments": "",
  "/demo-requests": "",
  "/inbox": "inbox.view",
  "/plans": "",
  "/plan-upgrade": "",
  "/billing": "",
  "/payment/success": "",
  "/payment-success": "",
  "/gateway": "",
  "/languages": "",
  "/team": "team.view",
  "/automation": "automations.view",
  "/analytics": "analytics.view",
  "/analytics/campaign/:campaignId": "analytics.view",
  "/websites": "",
  "/add/chatbot-builder": "",
  "/widget-builder": "",
  "/chatbot-builder": "",
  "/settings": "settings.view",
  "/logs": "logs.view",
  "/account": "",
  "/bot-builder": "",
  "/workflows": "",
  "/ai-assistant": "",
  "/auto-responses": "",
  "/waba-connection": "",
  "/multi-number": "",
  "/webhooks": "",
  "/qr-codes": "",
  "/crm-systems": "",
  "/leads": "",
  "/bulk-import": "",
  "/segmentation": "",
  "/message-logs": "",
  "/health-monitor": "",
  "/reports": "",
  "/transactions-logs": "",
  "/contacts-management": "",
  "/support-tickets": "",
  "/groups": "",
  "/api-docs": "",
  "/user-support-tickets": "",
  "/notifications": "",
  "/user-notifications": "",
  "/chat-hub": "",
  "/master-subscriptions": "",
  "/app-update": "",
};

// Route patterns (regex) that correspond to dynamic routes. Keep keys aligned
// with ROUTE_PERMISSIONS so we can resolve dynamic paths like
// /analytics/campaign/:campaignId or /users/:id.
const DYNAMIC_ROUTE_PATTERNS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /^\/analytics\/campaign\/[^/]+$/, key: "/analytics/campaign/:campaignId" },
  { pattern: /^\/users\/[^/]+$/, key: "/users" },
  { pattern: /^\/whatsapp-flows\/[^/]+$/, key: "/whatsapp-flows" },
  { pattern: /^\/reseller\/customers\/[^/]+$/, key: "/reseller/customers/:id" },
  { pattern: /^\/admin\/resellers\/[^/]+$/, key: "/admin/resellers/:id" },
];

function resolveRouteKey(location: string): string | undefined {
  const path = location.split("?")[0];
  if (path in ROUTE_PERMISSIONS) return path;
  for (const { pattern, key } of DYNAMIC_ROUTE_PATTERNS) {
    if (pattern.test(path)) return key;
  }
  return undefined;
}

function UnauthorizedPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-600">
          You don't have permission to access this page.
        </p>
      </div>
    </div>
  );
}

// Permission wrapper component
function PermissionRoute({
  component: Component,
  requiredPermission,
  requiredRoles,
}: Readonly<{
  component: React.ComponentType;
  requiredPermission?: string;
  requiredRoles?: string[];
}>) {
  const { user } = useAuth();

  if (requiredRoles && requiredRoles.length > 0) {
    if (!user?.role || !requiredRoles.includes(user.role)) {
      return <UnauthorizedPage />;
    }
  }

  const hasPermission = (permission?: string) => {
    if (!permission) return true;
    if (!user?.permissions) return false;
    if (user.role === "superadmin") return true;

    const perms = Array.isArray(user.permissions)
      ? user.permissions
      : Object.keys(user.permissions);

    if (perms.includes("*")) return true;

    const normalize = (str: string) => str.replace(".", ":");

    return perms.some(
      (perm) =>
        perm.startsWith(normalize(permission)) &&
        (Array.isArray(user.permissions) ? true : user.permissions[perm])
    );
  };

  if (!hasPermission(requiredPermission)) {
    return <UnauthorizedPage />;
  }

  return <Component />;
}

function ProtectedRoutes() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location, setLocation] = useLocation();

  // Check flag immediately on mount - synchronously
  const fromLoginFlag =
    typeof window !== "undefined" &&
    sessionStorage.getItem("fromLogin") === "true";

  const [showLoading, setShowLoading] = useState(fromLoginFlag);
  const [isLoginRedirect] = useState(fromLoginFlag);

  // Clear flag immediately after reading
  useEffect(() => {
    if (fromLoginFlag) {
      sessionStorage.removeItem("fromLogin");
    }
  }, [fromLoginFlag]);

  // Check if user has access to current route. Default policy is DENY:
  // unmapped routes redirect to /dashboard. Empty-string permissions mean
  // "authenticated-only" (allowed).
  // A reseller has no use for the operator dashboard — send it to the
  // partner panel, which is that role's home screen.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const path = location.split("?")[0];
    if (user.role === "reseller") {
      // Resellers only see the reseller portal (+ support/notifications).
      const allowed = path.startsWith("/reseller") || ["/user-support-tickets", "/user-notifications"].includes(path);
      if (!allowed) setLocation("/reseller");
    } else if (path === "/reseller" || path.startsWith("/reseller/") || path === "/partner") {
      setLocation("/dashboard");
    }
  }, [location, isAuthenticated, user, setLocation]);

  useEffect(() => {
    if (isAuthenticated && user && location !== "/" && location !== "/dashboard") {
      const routeKey = resolveRouteKey(location);
      if (routeKey === undefined) {
        setLocation("/dashboard");
        return;
      }
      const requiredPermission = ROUTE_PERMISSIONS[routeKey];
      if (requiredPermission && !hasRoutePermission(requiredPermission, user)) {
        setLocation("/dashboard");
      }
    }
  }, [location, isAuthenticated, user, setLocation]);

  // Priority 1: Show login animation loader immediately
  if (showLoading && isLoginRedirect) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-[9999]">
        <LoadingAnimation onComplete={() => setShowLoading(false)} />
      </div>
    );
  }

  // Priority 2: Show minimal loader during auth check
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-[9999]">
        <MinimalLoader variant="ring" color="green" />
      </div>
    );
  }

  // Priority 3: Not authenticated - show public routes
  if (!isAuthenticated) {
    return (
      <>
        <Header />
        <Switch>
          <Route path="/" component={Home} />
          <Route component={Home} />
        </Switch>
        <Footer />
      </>
    );
  }

  // Priority 4: Authenticated - show dashboard and protected routes
  return (
    <div className="flex min-h-screen bg-background text-foreground transition-colors duration-300">
      <Sidebar />
      <div className="flex-1 min-w-0 lg:ml-64">
        <Switch>
          <Route path="/dashboard">
            <Dashboard />
          </Route>
          <Route path="/contacts">
            <PermissionRoute
              component={Contacts}
              requiredPermission="contacts:view"
            />
          </Route>
          <Route path="/users">
            <PermissionRoute component={User} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/channels-management">
            <PermissionRoute component={ChannelsManagement} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/users/:id">
            <PermissionRoute component={userDetails} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/campaigns">
            <PermissionRoute
              component={Campaigns}
              requiredPermission="campaigns:view"
            />
          </Route>
          <Route path="/template-library">
            <PermissionRoute component={TemplateLibraryPage} requiredPermission="templates:view" />
          </Route>
          <Route path="/demo-requests">
            <PermissionRoute component={DemoRequestsPage} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/appointments">
            <PermissionRoute component={AppointmentsPage} />
          </Route>
          <Route path="/store">
            <PermissionRoute component={MiniStorePage} />
          </Route>
          <Route path="/app-integrations">
            <PermissionRoute component={AppIntegrationsPage} />
          </Route>
          <Route path="/whatsapp-flows/:id">
            <PermissionRoute component={FlowStudioEditor} requiredPermission="templates:view" />
          </Route>
          <Route path="/whatsapp-flows">
            <PermissionRoute component={WhatsAppFlowsPage} requiredPermission="templates:view" />
          </Route>
          <Route path="/templates">
            <PermissionRoute
              component={Templates}
              requiredPermission="templates:view"
            />
          </Route>
          <Route path="/inbox">
            <PermissionRoute
              component={Inbox}
              requiredPermission="inbox:view"
            />
          </Route>
          <Route path="/plans">
            <PermissionRoute component={Plans} />
          </Route>
          <Route path="/billing/rates">
            <PermissionRoute component={MetaRateCardsPage} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/admin/meta-rate-cards">
            <PermissionRoute component={MetaRateCardsPage} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/admin/whatsapp-accounts">
            <PermissionRoute component={AdminWhatsAppAccountsPage} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/admin/billing">
            <PermissionRoute component={AdminMetaBillingPage} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/whatsapp-usage">
            <PermissionRoute component={WhatsAppUsagePage} />
          </Route>
          <Route path="/account-health">
            <PermissionRoute component={AccountHealthPage} />
          </Route>
          <Route path="/cost-calculator">
            <PermissionRoute component={CostCalculatorPage} />
          </Route>
          <Route path="/billing/caps">
            <PermissionRoute component={CapsPage} />
          </Route>
          <Route path="/partner">
            <PermissionRoute component={ResellerDashboard} requiredRoles={["reseller"]} />
          </Route>
          <Route path="/reseller">
            <PermissionRoute component={ResellerDashboard} requiredRoles={["reseller"]} />
          </Route>
          <Route path="/reseller/customers/new">
            <PermissionRoute component={ResellerAddCustomerPage} requiredRoles={["reseller"]} />
          </Route>
          <Route path="/reseller/customers/:id">
            <PermissionRoute component={ResellerCustomerDetailPage} requiredRoles={["reseller"]} />
          </Route>
          <Route path="/reseller/customers">
            <PermissionRoute component={ResellerCustomersPage} requiredRoles={["reseller"]} />
          </Route>
          <Route path="/reseller/subscriptions">
            <PermissionRoute component={ResellerSubscriptionsPage} requiredRoles={["reseller"]} />
          </Route>
          <Route path="/reseller/sales">
            <PermissionRoute component={ResellerSalesPage} requiredRoles={["reseller"]} />
          </Route>
          <Route path="/reseller/transactions">
            <PermissionRoute component={ResellerTransactionsPage} requiredRoles={["reseller"]} />
          </Route>
          <Route path="/reseller/pricing">
            <PermissionRoute component={ResellerPricingPage} requiredRoles={["reseller"]} />
          </Route>
          <Route path="/reseller/profile">
            <PermissionRoute component={ResellerProfilePage} requiredRoles={["reseller"]} />
          </Route>
          <Route path="/resellers">
            <PermissionRoute component={AdminResellersPage} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/admin/resellers/:id">
            <PermissionRoute component={AdminResellerDetailPage} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/admin/resellers">
            <PermissionRoute component={AdminResellersPage} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/green-tick">
            <PermissionRoute component={BlueTickPage} />
          </Route>
          <Route path="/green-tick/review">
            <PermissionRoute component={BlueTickAdmin} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/gateway">
            <PermissionRoute component={GatewaySettings} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/languages">
            <PermissionRoute component={LanguageManagement} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/team">
            <PermissionRoute component={Team} requiredPermission="team:view" />
          </Route>
          <Route path="/automation">
            <PermissionRoute
              component={Automations}
              requiredPermission="automations:view"
            />
          </Route>
          <Route path="/analytics">
            <PermissionRoute component={Analytics} />
          </Route>
          <Route path="/websites">
            <PermissionRoute component={Websites} />
          </Route>
          <Route path="/add/chatbot-builder">
            <PermissionRoute component={AddChatbotBuilder} />
          </Route>
          <Route path="/widget-builder">
            <PermissionRoute component={WidgetBuilder} />
          </Route>
          <Route path="/chatbot-builder">
            <PermissionRoute component={ChatbotBuilder} />
          </Route>
          <Route path="/settings">
            <PermissionRoute
              component={Settings}
              requiredPermission="settings:view"
            />
          </Route>
          <Route path="/analytics/campaign/:campaignId">
            <PermissionRoute
              component={CampaignAnalytics}
            // requiredPermission="settings:view"
            />
          </Route>
          <Route path="/account">
            <PermissionRoute component={Account} />
          </Route>
          <Route path="/bot-builder">
            <PermissionRoute component={BotFlowBuilder} />
          </Route>
          <Route path="/workflows">
            <PermissionRoute component={Workflows} />
          </Route>
          <Route path="/ai-assistant">
            <PermissionRoute component={AIAssistant} />
          </Route>
          <Route path="/auto-responses">
            <PermissionRoute component={AutoResponses} />
          </Route>
          <Route path="/waba-connection">
            <PermissionRoute component={WABAConnection} />
          </Route>
          <Route path="/multi-number">
            <PermissionRoute component={MultiNumber} />
          </Route>
          <Route path="/webhooks">
            <PermissionRoute component={Webhooks} />
          </Route>
          <Route path="/qr-codes">
            <PermissionRoute component={QRCodes} />
          </Route>
          <Route path="/crm-systems">
            <PermissionRoute component={CRMSystem} />
          </Route>
          <Route path="/leads">
            <PermissionRoute component={LeadManagement} />
          </Route>
          <Route path="/bulk-import">
            <PermissionRoute component={BulkImport} />
          </Route>
          <Route path="/segmentation">
            <PermissionRoute component={Segmentation} />
          </Route>
          <Route path="/message-logs">
            <PermissionRoute component={SuperadminMessageLogs} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/health-monitor">
            <PermissionRoute component={AccountHealthPage} />
          </Route>
          <Route path="/reports">
            <PermissionRoute component={Reports} />
          </Route>
          <Route path="/transactions-logs">
            <PermissionRoute component={TransactionsPage} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/contacts-management">
            <PermissionRoute component={ContactsManagements} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/support-tickets">
            <PermissionRoute component={SupportTicketsNew} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/groups">
            <PermissionRoute component={GroupsUI} />
          </Route>
          <Route path="/api-docs">
            <PermissionRoute component={ApiDocs} requiredRoles={["admin"]} />
          </Route>
          <Route path="/user-support-tickets">
            <PermissionRoute component={UserSupportTicketsNew} />
          </Route>
          <Route path="/plan-upgrade">
            <PermissionRoute component={Plans} />
          </Route>
          <Route path="/billing">
            <PermissionRoute component={BillingOverviewPage} />
          </Route>
          <Route path="/payment/success">
            <PermissionRoute component={PaymentSuccessPage} />
          </Route>
          <Route path="/payment-success">
            <PermissionRoute component={PaymentSuccessPage} />
          </Route>
          <Route path="/notifications">
            <PermissionRoute component={Notifications} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/user-notifications">
            <PermissionRoute component={UserNotifications} />
          </Route>
          <Route path="/chat-hub">
            <PermissionRoute component={ChatHub} />
          </Route>
          <Route path="/master-subscriptions">
            <PermissionRoute component={AllSubscriptionsPage} requiredRoles={["superadmin"]} />
          </Route>
          <Route path="/app-update">
            <PermissionRoute component={AppUpdate} requiredRoles={["superadmin"]} />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

// Helper function to check route permissions
function hasRoutePermission(permission: string, user: any) {
  if (!user?.permissions) return false;
  if (user.role === "superadmin") return true;

  const perms = Array.isArray(user.permissions)
    ? user.permissions
    : Object.keys(user.permissions);

  if (perms.includes("*")) return true;

  const normalize = (str: string) => str.replace(".", ":");

  return perms.some(
    (perm: string) =>
      perm.startsWith(normalize(permission)) &&
      (Array.isArray(user.permissions) ? true : user.permissions[perm])
  );
}

// Custom hook for permission checking
export function usePermissions() {
  const { user } = useAuth();

  const hasPermission = (permission: string) => {
    if (!user?.permissions) return false;

    const perms = Array.isArray(user.permissions)
      ? user.permissions
      : Object.keys(user.permissions);

    const normalize = (str: string) => str.replace(".", ":");
    const normalizedPermission = normalize(permission);

    return perms.some(
      (perm) =>
        perm.startsWith(normalizedPermission) &&
        (Array.isArray(user.permissions) ? true : user.permissions[perm])
    );
  };

  const canAccessRoute = (route: string) => {
    const routeKey = resolveRouteKey(route);
    if (routeKey === undefined) return false; // default DENY for unmapped routes
    const requiredPermission = ROUTE_PERMISSIONS[routeKey];
    return requiredPermission ? hasPermission(requiredPermission) : true;
  };

  return { hasPermission, canAccessRoute, user };
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <SignupPopupHandler />
      <BookDemoDialog />
      <Switch>
        <Route path="/widget-chat" component={WidgetChat} />
        <Route path="/demo">
          <>
            <DemoPage />
          </>
        </Route>
        <Route path="/login" component={LoginPage} />
        <Route path="/accept-invite" component={AcceptInvitePage} />
        <Route path="/pay/:token" component={PayPage} />
        <Route path="/verify-email">
          <>
            <Header />
            <VerifyEmail />
            <Footer />
          </>
        </Route>
        <Route path="/signup" component={Signup} />
        <Route path="/privacy-policy">
          <>
            <Header />
            <PrivacyPage />
            <Footer />
          </>
        </Route>
        <Route path="/terms">
          <>
            <Header />
            <TermsPage />
            <Footer />
          </>
        </Route>
        <Route path="/data-deletion">
          <>
            <Header />
            <DataDeletionPage />
            <Footer />
          </>
        </Route>
        <Route path="/about">
          <>
            <Header />
            <AboutUs />
            <Footer />
          </>
        </Route>
        <Route path="/integrations">
          <>
            <Header />
            <Integrations />
            <Footer />
          </>
        </Route>
        <Route path="/press-kit">
          <>
            <Header />
            <PressKit />
            <Footer />
          </>
        </Route>
        <Route path="/case-studies">
          <>
            <Header />
            <CaseStudies />
            <Footer />
          </>
        </Route>
        <Route path="/whatsapp-guide">
          <>
            <Header />
            <WhatsAppGuide />
            <Footer />
          </>
        </Route>
        <Route path="/best-practices">
          <>
            <Header />
            <BestPractices />
            <Footer />
          </>
        </Route>
        <Route path="/cookie-policy">
          <>
            <Header />
            <CookiePolicy />
            <Footer />
          </>
        </Route>
        <Route path="/contact">
          <>
            <Header />
            <ContactusLanding />
            <Footer />
          </>
        </Route>
        <Route path="/careers">
          <>
            <Header />
            <Careers />
            <Footer />
          </>
        </Route>
        <Route path="/">
          <>
            <Header />
            <Home />
            <Footer />
          </>
        </Route>
        <Route component={ProtectedRoutes} />
      </Switch>
    </>
  );
}

function App() {
  useEffect(() => {
    useI18n.getState().fetchEnabledLanguages();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SocketProvider>
          <UnreadCountProvider>
            <AppLayout>
              <ChannelProvider>
                <TooltipProvider>
                  <Toaster />
                  <Router />
                </TooltipProvider>
              </ChannelProvider>
            </AppLayout>
          </UnreadCountProvider>
        </SocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;