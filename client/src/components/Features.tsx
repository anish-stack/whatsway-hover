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

import React, { useState } from "react";
import {
  MessageSquare,
  Workflow,
  BarChart3,
  Users,
  Bot,
  Calendar,
  Globe,
  Target,
  Send,
  CheckCircle,
  Smartphone,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const Features = () => {
  const [activeTab, setActiveTab] = useState(0);
  const { t } = useTranslation();

  const features = [
    {
      icon: MessageSquare,
      title: t("Landing.featuresSec.featureTabs.0.title"),
      description: t("Landing.featuresSec.featureTabs.0.description"),
      demo: {
        title: t("Landing.featuresSec.featureTabs.0.demo.title"),
        stats: t("Landing.featuresSec.featureTabs.0.demo.stats"),
        features: (t as any)(
          "Landing.featuresSec.featureTabs.0.demo.features",
          { returnObjects: true }
        ),
      },
    },
    {
      icon: Workflow,
      title: t("Landing.featuresSec.featureTabs.1.title"),
      description: t("Landing.featuresSec.featureTabs.1.description"),
      demo: {
        title: t("Landing.featuresSec.featureTabs.1.demo.title"),
        stats: t("Landing.featuresSec.featureTabs.1.demo.stats"),
        features: (t as any)(
          "Landing.featuresSec.featureTabs.1.demo.features",
          { returnObjects: true }
        ),
      },
    },
    {
      icon: BarChart3,
      title: t("Landing.featuresSec.featureTabs.2.title"),
      description: t("Landing.featuresSec.featureTabs.2.description"),
      demo: {
        title: t("Landing.featuresSec.featureTabs.2.demo.title"),
        stats: t("Landing.featuresSec.featureTabs.2.demo.stats"),
        features: (t as any)(
          "Landing.featuresSec.featureTabs.2.demo.features",
          { returnObjects: true }
        ),
      },
    },
    {
      icon: Users,
      title: t("Landing.featuresSec.featureTabs.3.title"),
      description: t("Landing.featuresSec.featureTabs.3.description"),
      demo: {
        title: t("Landing.featuresSec.featureTabs.3.demo.title"),
        stats: t("Landing.featuresSec.featureTabs.3.demo.stats"),
        features: (t as any)(
          "Landing.featuresSec.featureTabs.3.demo.features",
          { returnObjects: true }
        ),
      },
    },
    {
      icon: Bot,
      title: t("Landing.featuresSec.featureTabs.4.title"),
      description: t("Landing.featuresSec.featureTabs.4.description"),
      demo: {
        title: t("Landing.featuresSec.featureTabs.4.demo.title"),
        stats: t("Landing.featuresSec.featureTabs.4.demo.stats"),
        features: (t as any)(
          "Landing.featuresSec.featureTabs.4.demo.features",
          { returnObjects: true }
        ),
      },
    },
    {
      icon: Calendar,
      title: t("Landing.featuresSec.featureTabs.5.title"),
      description: t("Landing.featuresSec.featureTabs.5.description"),
      demo: {
        title: t("Landing.featuresSec.featureTabs.5.demo.title"),
        stats: t("Landing.featuresSec.featureTabs.5.demo.stats"),
        features: (t as any)(
          "Landing.featuresSec.featureTabs.5.demo.features",
          { returnObjects: true }
        ),
      },
    },
  ];

  const additionalFeatures = (t as any)(
    "Landing.featuresSec.additionalFeatures",
    {
      returnObjects: true,
    }
  );

  const additionalIcons = [Globe, Target, Send];
  const active = features[activeTab];
  const activeList = Array.isArray(active.demo.features)
    ? (active.demo.features as string[])
    : [];

  return (
    <section id="features" className="band bg-background">
      <div className="shell">
        <div className="max-w-3xl">
          <span className="chip">
            <Smartphone className="h-3.5 w-3.5" />
            {t("Landing.featuresSec.introTagline")}
          </span>
          <h2 className="display-lg mt-5 text-[var(--ink)]">
            {t("Landing.featuresSec.headlinePre")}{" "}
            {t("Landing.featuresSec.headlineHighlight")}
          </h2>
          <p className="lede mt-5">{t("Landing.featuresSec.subHeadline")}</p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-12 lg:gap-12">
          {/* rail */}
          <div className="lg:col-span-4">
            <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
              {features.map((feature, index) => {
                const isActive = activeTab === index;
                return (
                  <button
                    key={index}
                    onClick={() => setActiveTab(index)}
                    className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors lg:w-full lg:shrink lg:rounded-none lg:border-b lg:border-[var(--mist)] lg:px-4 lg:py-4 ${
                      isActive
                        ? "bg-[var(--brand-100)] text-[var(--brand-700)] lg:bg-transparent lg:rule-flare lg:text-[var(--ink)]"
                        : "text-[var(--ink-500)] hover:text-[var(--ink)] lg:border-l-[3px] lg:border-l-transparent"
                    }`}
                  >
                    <feature.icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? "text-[var(--flare)]" : "text-[var(--ink-300)]"
                      }`}
                    />
                    <span className="whitespace-nowrap lg:whitespace-normal">
                      {feature.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* panel */}
          <div className="lg:col-span-8">
            <div className="plate overflow-hidden">
              <div className="border-b border-[var(--mist)] p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
                    {React.createElement(active.icon, { className: "h-5 w-5" })}
                  </div>
                  <div>
                    <h3 className="display-md text-[var(--ink)]">
                      {active.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--ink-500)]">
                      {active.description}
                    </p>
                  </div>
                </div>

                {activeList.length > 0 && (
                  <div className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                    {activeList.map((feat: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ok)]" />
                        <span className="text-sm text-[var(--ink-700)]">
                          {feat}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[var(--canvas)] p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--ink-500)]">
                      {t("Landing.featuresSec.whatsAppAPI")}
                    </p>
                    <p className="mt-1 text-base font-semibold text-[var(--ink)]">
                      {active.demo.title}
                    </p>
                  </div>
                  <span className="chip chip-flare">{active.demo.stats}</span>
                </div>

                <div className="mt-5 space-y-2">
                  {activeList.slice(0, 3).map((feat: string, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--mist)] bg-background px-4 py-3"
                    >
                      <span className="text-sm text-[var(--ink-700)]">
                        {feat}
                      </span>
                      <CheckCircle className="h-4 w-4 shrink-0 text-[var(--ok)]" />
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--ink-500)]">
                      {t("Landing.featuresSec.campaign_progress")}
                    </span>
                    <span className="font-semibold text-[var(--ink)]">
                      {Math.round((activeTab + 1) * 16.67)}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--mist)]">
                    <div
                      className="h-full rounded-full bg-[var(--brand)] transition-all duration-700"
                      style={{ width: `${(activeTab + 1) * 16.67}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* supporting capabilities — ruled list, not card kit */}
        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-[var(--mist)] bg-[var(--mist)] sm:grid-cols-2 lg:grid-cols-3">
          {additionalFeatures.map(
            (item: { title: string; desc: string }, index: number) => (
              <div key={index} className="bg-background p-6 sm:p-7">
                {React.createElement(additionalIcons[index] || Globe, {
                  className: "h-5 w-5 text-[var(--brand)]",
                })}
                <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-500)]">
                  {item.desc}
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
};

export default Features;
