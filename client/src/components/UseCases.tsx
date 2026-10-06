/**
 * ============================================================
 * © 2025 Diploy — a brand of Bisht Technologies Private Limited
 * Original Author: BTPL Engineering Team
 * Website: https://diploy.in
 * Contact: cs@diploy.in
 *
 * Distributed under the Envato / CodeCanyon License Agreement.
 * Licensed to the purchaser for use as defined by the
 * Envato Market (CodeCanyon) Regular or Extended License.
 *
 * You are NOT permitted to redistribute, resell, sublicense,
 * or share this source code, in whole or in part.
 * Respect the author's rights and Envato licensing terms.
 * ============================================================
 */

import React, { useState } from "react";
import {
  ShoppingCart,
  GraduationCap,
  Heart,
  Building,
  Utensils,
  Car,
  ArrowRight,
  TrendingUp,
  Users,
  MessageCircle,
} from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "@/lib/i18n";

const UseCases = () => {
  const [activeUseCase, setActiveUseCase] = useState(0);
  const { t } = useTranslation();

  const useCases = [
    {
      icon: ShoppingCart,
      title: t("Landing.useCasesSec.useCases.0.title"),
      description: t("Landing.useCasesSec.useCases.0.description"),
      color: "from-green-500 to-green-600",
      bgColor: "bg-green-50",
      stats: {
        increase: "300%",
        metric: t("Landing.useCasesSec.useCases.0.stats.metric"),
      },
      features: [
        t("Landing.useCasesSec.useCases.0.features.0"),
        t("Landing.useCasesSec.useCases.0.features.1"),
        t("Landing.useCasesSec.useCases.0.features.2"),
        t("Landing.useCasesSec.useCases.0.features.3"),
      ],
    },
    {
      icon: GraduationCap,
      title: t("Landing.useCasesSec.useCases.1.title"),
      description: t("Landing.useCasesSec.useCases.1.description"),
      color: "from-blue-500 to-blue-600",
      bgColor: "bg-blue-50",
      stats: {
        increase: "85%",
        metric: t("Landing.useCasesSec.useCases.1.stats.metric"),
      },
      features: [
        t("Landing.useCasesSec.useCases.1.features.0"),
        t("Landing.useCasesSec.useCases.1.features.1"),
        t("Landing.useCasesSec.useCases.1.features.2"),
        t("Landing.useCasesSec.useCases.1.features.3"),
      ],
    },
    {
      icon: Heart,
      title: t("Landing.useCasesSec.useCases.2.title"),
      description: t("Landing.useCasesSec.useCases.2.description"),
      color: "from-red-500 to-red-600",
      bgColor: "bg-red-50",
      stats: {
        increase: "60%",
        metric: t("Landing.useCasesSec.useCases.2.stats.metric"),
      },
      features: [
        t("Landing.useCasesSec.useCases.2.features.0"),
        t("Landing.useCasesSec.useCases.2.features.1"),
        t("Landing.useCasesSec.useCases.2.features.2"),
        t("Landing.useCasesSec.useCases.2.features.3"),
      ],
    },
    {
      icon: Building,
      title: t("Landing.useCasesSec.useCases.3.title"),
      description: t("Landing.useCasesSec.useCases.3.description"),
      color: "from-[var(--brand)] to-[var(--brand-700)]",
      bgColor: "bg-[var(--brand-100)]",
      stats: {
        increase: "45%",
        metric: t("Landing.useCasesSec.useCases.3.stats.metric"),
      },
      features: [
        t("Landing.useCasesSec.useCases.3.features.0"),
        t("Landing.useCasesSec.useCases.3.features.1"),
        t("Landing.useCasesSec.useCases.3.features.2"),
        t("Landing.useCasesSec.useCases.3.features.3"),
      ],
    },
    {
      icon: Utensils,
      title: t("Landing.useCasesSec.useCases.4.title"),
      description: t("Landing.useCasesSec.useCases.4.description"),
      color: "from-orange-500 to-orange-600",
      bgColor: "bg-orange-50",
      stats: {
        increase: "120%",
        metric: t("Landing.useCasesSec.useCases.4.stats.metric"),
      },
      features: [
        t("Landing.useCasesSec.useCases.4.features.0"),
        t("Landing.useCasesSec.useCases.4.features.1"),
        t("Landing.useCasesSec.useCases.4.features.2"),
        t("Landing.useCasesSec.useCases.4.features.3"),
      ],
    },
    {
      icon: Car,
      title: t("Landing.useCasesSec.useCases.5.title"),
      description: t("Landing.useCasesSec.useCases.5.description"),
      color: "from-[var(--brand)] to-[var(--brand-700)]",
      bgColor: "bg-[var(--brand-100)]",
      stats: {
        increase: "75%",
        metric: t("Landing.useCasesSec.useCases.5.stats.metric"),
      },
      features: [
        t("Landing.useCasesSec.useCases.5.features.0"),
        t("Landing.useCasesSec.useCases.5.features.1"),
        t("Landing.useCasesSec.useCases.5.features.2"),
        t("Landing.useCasesSec.useCases.5.features.3"),
      ],
    },
  ];

  const active = useCases[activeUseCase];

  return (
    <section id="use-cases" className="band canvas-bg">
      <div className="shell">
        <div className="max-w-3xl">
          <span className="chip">
            <Building className="h-3.5 w-3.5" />
            {t("Landing.useCasesSec.introTagline")}
          </span>
          <h2 className="display-lg mt-5 text-[var(--ink)]">
            {t("Landing.useCasesSec.headlinePre")}{" "}
            {t("Landing.useCasesSec.headlineHighlight")}
          </h2>
          <p className="lede mt-5">{t("Landing.useCasesSec.subHeadline")}</p>
        </div>

        <div className="mt-10 flex flex-wrap gap-2">
          {useCases.map((useCase, index) => (
            <button
              key={index}
              onClick={() => setActiveUseCase(index)}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeUseCase === index
                  ? "bg-[var(--ink)] text-white"
                  : "border border-[var(--mist)] bg-background text-[var(--ink-500)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
              }`}
            >
              <useCase.icon className="h-4 w-4" />
              <span>{useCase.title}</span>
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <div className="plate p-7 sm:p-9">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
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

              <div className="mt-7 flex items-end justify-between gap-4 rounded-xl bg-[var(--canvas)] p-5 rule-flare">
                <div>
                  <p className="text-xs text-[var(--ink-500)]">Success metric</p>
                  <p className="mt-1.5 text-sm font-medium text-[var(--ink-700)]">
                    {active.stats.metric}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-[var(--flare)]" />
                  <span className="stat-figure">{active.stats.increase}</span>
                </div>
              </div>

              <h4 className="mt-8 text-sm font-semibold text-[var(--ink)]">
                {t("Landing.useCasesSec.keyFeatures")}
              </h4>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {active.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" />
                    <span className="text-sm text-[var(--ink-700)]">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              <Link
                href="/case-studies"
                className="btn btn-ink group mt-8 px-5 py-2.5 text-sm"
              >
                {t("Landing.useCasesSec.cta.viewCaseStudyButton")}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-5">
            <div className="surface p-6">
              <div className="flex items-center gap-3.5">
                <img
                  src="https://plus.unsplash.com/premium_photo-1689977968861-9c91dbb16049?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                  alt=""
                  className="h-12 w-12 rounded-xl object-cover"
                />
                <div>
                  <h4 className="font-semibold text-[var(--ink)]">
                    {t("Landing.useCasesSec.cta.testimonialName")}
                  </h4>
                  <p className="text-xs text-[var(--ink-500)]">
                    {t("Landing.useCasesSec.cta.testimonialPosition")}
                  </p>
                </div>
              </div>
              <blockquote className="mt-5 border-l-2 border-[var(--brand)] pl-4 text-sm leading-relaxed text-[var(--ink-700)]">
                {String(t("Landing.useCasesSec.cta.customerSuccessQuote"))
                  .replace("{industry}", active.title.toLowerCase())
                  .replace("{increase}", active.stats.increase)}
              </blockquote>
            </div>

            <div className="surface overflow-hidden">
              <div className="flex items-center gap-3 border-b border-[var(--mist)] px-6 py-4">
                <MessageCircle className="h-4 w-4 text-[var(--brand)]" />
                <h4 className="text-sm font-semibold text-[var(--ink)]">
                  {t("Landing.useCasesSec.quickStatsTitle")}
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-px bg-[var(--mist)]">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="bg-background p-5">
                    <div className="stat-figure text-[var(--brand)]">
                      {t(`Landing.useCasesSec.quickStats.${i}.value`)}
                    </div>
                    <div className="stat-label mt-1">
                      {t(`Landing.useCasesSec.quickStats.${i}.label`)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default UseCases;
