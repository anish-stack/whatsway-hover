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
import {
  Check,
  X,
  Zap,
  Crown,
  Rocket,
  Building,
  ArrowRight,
  AlertCircle,
  Star,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PaymentProvidersResponse, Plan, PlansDataTypes } from "@/types/types";
import { useToast } from "@/hooks/use-toast";
import CheckoutModal from "./modals/CheckoutPage";
import { useAuth } from "@/contexts/auth-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";
import { Link, useLocation } from "wouter";

const Pricing = () => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const { toast } = useToast();
  const { user, currencySymbol, currency } = useAuth();

  const [, setLocation] = useLocation();
  // Fetch payment providers
  const { data: paymentProviders, isLoading: isLoadingProviders } =
    useQuery<PaymentProvidersResponse>({
      queryKey: ["/api/payment-providers"],
      queryFn: async () => {
        const res = await apiRequest("GET", "/api/payment-providers");
        if (!res.ok) throw new Error("Failed to fetch payment providers");
        const data = await res.json();
        return data;
      },
      enabled: !!user?.id,
    });

  // Fetch currency map
  const { data: currencyMapData } = useQuery<{
    success: boolean;
    data: {
      currencyMap: Record<string, { providerKey: string; providerId: string; providerName: string }[]>;
      availableCurrencies: string[];
    };
  }>({
    queryKey: ["/api/payment-providers/currency-map"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/payment-providers/currency-map");
      return res.json();
    },
    enabled: !!user?.id,
  });

  const availableCurrencies = currencyMapData?.data?.availableCurrencies || [];
  const [selectedCurrency, setSelectedCurrency] = useState<string>("");

  // Filter currencies to only show those configured by admin, plus default/USD
  const displayedCurrencies = availableCurrencies.filter(cur => {
    if (cur === "USD" || cur === currency?.toUpperCase()) return true;
    return plans.some(p => p.multiCurrencyPrices && p.multiCurrencyPrices[cur]);
  });

  useEffect(() => {
    if (displayedCurrencies.length > 0 && !selectedCurrency) {
      if (displayedCurrencies.includes("USD")) {
        setSelectedCurrency("USD");
      } else {
        const upper = currency?.toUpperCase() || "";
        if (displayedCurrencies.includes(upper)) {
          setSelectedCurrency(upper);
        } else {
          setSelectedCurrency(displayedCurrencies[0]);
        }
      }
    }
  }, [displayedCurrencies, currency]);

  const currencySymbolMap: Record<string, string> = {
    USD: "$",
    INR: "₹",
    EUR: "€",
    GBP: "£",
    AED: "د.إ",
    SGD: "S$",
    AUD: "A$",
    CAD: "C$",
    JPY: "¥",
    CNY: "¥",
    BRL: "R$",
    MXN: "MX$",
    ZAR: "R",
  };

  const activeCurrencySymbol = selectedCurrency
    ? (currencySymbolMap[selectedCurrency] || selectedCurrency + " ")
    : currencySymbol;

  // Icon mapping
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    Zap,
    Crown,
    Rocket,
    Star,
    Building,
  };

  const fetchPlans = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await apiRequest("GET", "/api/admin/plans");
      const data: PlansDataTypes = await response.json();
      if (data.success) {
        setPlans(data.data);
      }
    } catch (error) {
      console.error("Error fetching plans:", error);
      toast({
        title: "Error",
        description: "Failed to fetch plans",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  // Handle plan selection
  const handleSelectPlan = (plan: Plan) => {
    if (!user) {
      setLocation("/login");
      // return toast({
      //   title: t("Landing.pricingSec.authRequired.title"),
      //   description: t("Landing.pricingSec.authRequired.description"),
      //   variant: "destructive",
      // });
    }
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  const renderPlansContent = () => {
    if (loading) {
      return (
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mb-4"></div>
          <p className="text-[var(--ink-500)] font-medium">
            {t("Landing.pricingSec.loading")}
          </p>
        </div>
      );
    }

    if (plans.length === 0) {
      return (
        <div className="text-center py-20 bg-[var(--canvas)] rounded-2xl">
          <AlertCircle className="w-16 h-16 text-[var(--ink-300)] mx-auto mb-4" />
          <h3 className="text-xl font-bold text-[var(--ink)] mb-2">
            {t("Landing.pricingSec.noPlans.title")}
          </h3>
          <p className="text-[var(--ink-500)]">
            {t("Landing.pricingSec.noPlans.description")}
          </p>
        </div>
      );
    }
    const sortedPlans = plans.sort((a, b) => {
      const priceA = Number(isAnnual ? a.annualPrice : a.monthlyPrice);
      const priceB = Number(isAnnual ? b.annualPrice : b.monthlyPrice);
      return priceA - priceB;
    });
    return (
      <div className="mb-16 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {sortedPlans.map((plan, index) => {
          const IconComponent = iconMap[plan.icon] || Zap;
          const isPopular = plan.popular;

          return (
            <div
              key={plan.id}
              className={`relative flex h-full flex-col rounded-2xl border bg-background p-7 transition-shadow ${
                isPopular
                  ? "border-[var(--brand)] shadow-[0_18px_44px_-24px_rgba(8,169,87,0.6)]"
                  : "border-[var(--mist)] hover:shadow-[0_14px_34px_-24px_rgba(22,18,46,0.55)]"
              }`}
              style={{ borderColor: plan.color || undefined }}
            >
              {/* Popular Badge */}
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="rounded-full bg-[var(--flare)] px-4 py-1.5 text-xs font-semibold text-[#3d2409]">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-7 flex-shrink-0">
                {/* Icon */}
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand-100)]">
                  <IconComponent className="h-5 w-5 text-[var(--brand)]" />
                </div>

                {/* Plan Name */}
                <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                  {plan.name}
                </h3>

                {/* Description */}
                <p className="mb-5 mt-1.5 min-h-[40px] text-sm leading-relaxed text-[var(--ink-500)]">
                  {plan.description}
                </p>

                {/* Price */}
                <div className="mb-3 flex items-baseline">
                  <span className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.04em] text-[var(--ink)]">
                    {(() => {
                      let monthlyPrice = plan.monthlyPrice;
                      let annualPrice = plan.annualPrice;
                      let planCurrencySymbol = currencySymbol; // Default to brand symbol

                      if (selectedCurrency && plan.multiCurrencyPrices && plan.multiCurrencyPrices[selectedCurrency]) {
                        monthlyPrice = plan.multiCurrencyPrices[selectedCurrency].monthly;
                        annualPrice = plan.multiCurrencyPrices[selectedCurrency].annual;
                        planCurrencySymbol = currencySymbolMap[selectedCurrency] || selectedCurrency + " ";
                      }

                      return (
                        <>
                          {planCurrencySymbol}
                          {isAnnual ? annualPrice : monthlyPrice}
                        </>
                      );
                    })()}
                  </span>
                  <span className="ml-1.5 text-sm text-[var(--ink-500)]">
                    /
                    {isAnnual
                      ? t("Landing.pricingSec.pricing.year")
                      : t("Landing.pricingSec.pricing.month")}
                  </span>
                </div>

                {/* Permissions */}
                {plan.permissions && (
                  <div className="space-y-1">
                    <div className="text-sm text-[var(--ink-500)]">
                      {t("Landing.pricingSec.pricing.upTo")}{" "}
                      {plan.permissions.contacts}{" "}
                      {t("Landing.pricingSec.pricing.contacts")}
                    </div>
                    <div className="text-sm text-[var(--ink-500)]">
                      {plan.permissions.channel}{" "}
                      {t("Landing.pricingSec.pricing.channels")}
                    </div>
                    {plan.permissions.automation && (
                      <div className="text-sm text-[var(--ink-500)]">
                        {plan.permissions.automation}{" "}
                        {t("Landing.pricingSec.pricing.automation")}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Features - Grow to fill space */}
              <ul className="space-y-4 mb-8 flex-grow">
                {plan.features && plan.features.length > 0 ? (
                  plan.features.map((feature, featureIndex) => (
                    <li
                      key={`${feature.name}-${featureIndex}`}
                      className="flex items-start space-x-3"
                    >
                      {feature.included ? (
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--ok)]" />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--ink-300)]" />
                      )}
                      <span
                        className={`text-sm ${
                          feature.included ? "text-[var(--ink-700)]" : "text-[var(--ink-300)]"
                        }`}
                      >
                        {feature.name}
                      </span>
                    </li>
                  ))
                ) : (
                  <>
                    <li className="flex items-start space-x-3">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--ok)]" />
                      <span className="text-sm text-[var(--ink-700)]">
                        {plan.permissions.contacts}{" "}
                        {t("Landing.pricingSec.pricing.contacts")}
                      </span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--ok)]" />
                      <span className="text-sm text-[var(--ink-700)]">
                        {plan.permissions.channel}{" "}
                        {t("Landing.pricingSec.pricing.channels")}
                      </span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--ok)]" />
                      <span className="text-sm text-[var(--ink-700)]">
                        {plan.permissions.automation}{" "}
                        {t("Landing.pricingSec.pricing.automation")}
                      </span>
                    </li>
                  </>
                )}
              </ul>

              {/* CTA Button - Always at bottom */}
              <button
                onClick={() => handleSelectPlan(plan)}
                className="btn btn-brand w-full flex-shrink-0"
                style={
                  plan.buttonColor
                    ? { backgroundColor: plan.buttonColor }
                    : undefined
                }
              >
                {Number.parseFloat(plan.monthlyPrice) === 0
                  ? t("Landing.pricingSec.planCTA.freeButton")
                  : t("Landing.pricingSec.planCTA.paidButton")}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // Get FAQ data from translation
  const faqData = t("Landing.pricingSec.faq.questions") as unknown as Array<{
    q: string;
    a: string;
  }>;

  return (
    <>
      <section id="pricing" className="band bg-background">
        <div className="shell">
          {/* Header Section */}
          <div className="mb-12">
            <span className="chip">
              <Crown className="h-3.5 w-3.5" />
              {t("Landing.pricingSec.introTagline")}
            </span>
            <h2 className="display-lg mt-5 text-[var(--ink)]">
              {t("Landing.pricingSec.headlinePre")}{" "}
              {t("Landing.pricingSec.headlineHighlight")}
            </h2>
            <p className="lede mt-5">
              {t("Landing.pricingSec.subHeadline")}
            </p>

            {/* Billing Toggle */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <span
                className={`text-sm font-semibold ${
                  isAnnual ? "text-[var(--ink-500)]" : "text-[var(--ink)]"
                }`}
              >
                {t("Landing.pricingSec.billingToggle.monthly")}
              </span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                className={`relative h-7 w-14 rounded-full transition-colors ${
                  isAnnual ? "bg-[var(--brand)]" : "bg-[var(--mist)]"
                }`}
              >
                <div
                  className={`absolute w-5 h-5 bg-white rounded-full top-1 transition-transform ${
                    isAnnual ? "translate-x-7" : "translate-x-1"
                  }`}
                ></div>
              </button>
              <span
                className={`text-sm font-semibold ${
                  isAnnual ? "text-[var(--ink)]" : "text-[var(--ink-500)]"
                }`}
              >
                {t("Landing.pricingSec.billingToggle.annual")}
              </span>
              {isAnnual && (
                <span className="chip chip-flare">
                  {t("Landing.pricingSec.billingToggle.saveLabel")}
                </span>
              )}
              {displayedCurrencies.length > 1 && (
                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  className="cursor-pointer rounded-xl border border-[var(--mist)] bg-background px-3 py-2 text-sm font-medium outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-100)]"
                >
                  {displayedCurrencies.map((cur) => (
                    <option key={cur} value={cur}>
                      {currencySymbolMap[cur] || ""} {cur}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Plans Content */}
          {renderPlansContent()}

          {/* FAQ Section */}
          <div>
            <h3 className="display-md text-[var(--ink)]">
              {t("Landing.pricingSec.faq.title")}
            </h3>
            <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-[var(--mist)] bg-[var(--mist)] lg:grid-cols-2">
              {faqData.map((faq, index) => (
                <div key={`${faq.q}-${index}`} className="bg-background p-6">
                  <h4 className="font-semibold text-[var(--ink)]">{faq.q}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ink-500)]">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Enterprise CTA */}
          <div className="mt-16 flex flex-col items-start gap-6 rounded-2xl bg-[var(--ink)] p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div>
              <h3 className="display-md text-white">
                {t("Landing.pricingSec.enterprise.title")}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">
                {t("Landing.pricingSec.enterprise.description")}
              </p>
            </div>
            <Link
              href="/contact"
              className="btn btn-flare group shrink-0"
            >
              {t("Landing.pricingSec.enterprise.button")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* Checkout Modal */}
      {selectedPlan && (
        <CheckoutModal
          plan={selectedPlan}
          isAnnual={isAnnual}
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          userId={user?.id}
          paymentProviders={paymentProviders?.data}
          isLoadingProviders={isLoadingProviders}
          selectedCurrency={selectedCurrency}
        />
      )}
    </>
  );
};

export default Pricing;
