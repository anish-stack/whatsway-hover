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

import React, { useState, useEffect } from "react";
import { ArrowRight, ArrowLeft, CheckCircle, Play } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useTranslation } from "@/lib/i18n";

import step1Image from "../images/Connect_Your_Meta_API.png";
import step2Image from "../images/Import_Your_Contacts.png";
import step3Image from "../images/create_lanch_campaigns.png";
import step4Image from "../images/Track_&_Optimize.png";
import { Link } from "wouter";

interface FeatureStep {
  icon: keyof typeof LucideIcons;
  title: string;
  description: string;
  details: string[];
  color: string;
  bgColor: string;
  demo?: {
    title?: string;
    stats?: string;
    features?: string[];
  };
}

const HowItWorks: React.FC = () => {
  const [activeStep, setActiveStep] = useState<number>(0);
  const { t } = useTranslation();

  const steps: FeatureStep[] = (t as any)("Landing.howItWorksSec.steps", {
    returnObjects: true,
  });

  const stepImages = [step1Image, step2Image, step3Image, step4Image];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [steps.length]);

  const progressBarLabels = (t as any)("Landing.howItWorksSec.progressBar", {
    returnObjects: true,
  }) as { previous: string; nextStep: string };

  const visualDemoLabel = t(
    "Landing.howItWorksSec.visualDemo.whatsAppBusinessDashboard"
  );

  const cta = (t as any)("Landing.howItWorksSec.cta", {
    returnObjects: true,
  }) as {
    readyToGetStarted: string;
    joinText: string;
    startFreeTrial: string;
  };

  return (
    <section id="how-it-works" className="band canvas-bg">
      <div className="shell">
        <div className="max-w-3xl">
          <span className="chip chip-flare">
            <Play className="h-3.5 w-3.5" />
            {t("Landing.howItWorksSec.introTagline")}
          </span>
          <h2 className="display-lg mt-5 text-[var(--ink)]">
            {t("Landing.howItWorksSec.headlinePre")}{" "}
            {t("Landing.howItWorksSec.headlineHighlight")}
          </h2>
          <p className="lede mt-5">{t("Landing.howItWorksSec.subHeadline")}</p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-12 lg:gap-14">
          {/* numbered sequence — content really is a sequence */}
          <ol className="lg:col-span-6">
            {steps.map((step: FeatureStep, index: number) => {
              const isActive = index === activeStep;
              const Icon = LucideIcons[
                step.icon
              ] as unknown as React.ComponentType<any>;
              return (
                <li key={index}>
                  <button
                    onClick={() => setActiveStep(index)}
                    className={`flex w-full gap-4 border-b border-[var(--mist)] py-5 text-left transition-colors ${
                      isActive ? "" : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                        isActive
                          ? "bg-[var(--brand)] text-white"
                          : "bg-[var(--mist)] text-[var(--ink-500)]"
                      }`}
                    >
                      {index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {Icon && (
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              isActive
                                ? "text-[var(--flare)]"
                                : "text-[var(--ink-300)]"
                            }`}
                          />
                        )}
                        <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
                          {step.title}
                        </h3>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-500)]">
                        {step.description}
                      </p>

                      {isActive && step.details && (
                        <div className="mt-4 grid gap-2">
                          {step.details.map((detail, idx) => (
                            <div key={idx} className="flex items-start gap-2.5">
                              <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ok)]" />
                              <span className="text-sm text-[var(--ink-700)]">
                                {detail}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}

            <li className="flex gap-3 pt-6">
              <button
                onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
                disabled={activeStep === 0}
                className="btn btn-quiet px-4 py-2 text-sm disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
                {progressBarLabels.previous}
              </button>
              <button
                onClick={() =>
                  setActiveStep(Math.min(steps.length - 1, activeStep + 1))
                }
                disabled={activeStep === steps.length - 1}
                className="btn btn-brand px-4 py-2 text-sm disabled:opacity-40"
              >
                {progressBarLabels.nextStep}
                <ArrowRight className="h-4 w-4" />
              </button>
            </li>
          </ol>

          {/* visual */}
          <div className="lg:col-span-6">
            <div className="plate plate-flare overflow-hidden lg:sticky lg:top-24">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--mist)] px-5 py-3.5">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {visualDemoLabel}
                </p>
                <span className="text-xs text-[var(--ink-500)]">
                  {activeStep + 1} / {steps.length}
                </span>
              </div>
              <div className="bg-[var(--canvas)] p-3">
                <img
                  src={stepImages[activeStep]}
                  alt={`Step ${activeStep + 1}: ${steps[activeStep].title}`}
                  className="w-full rounded-xl border border-[var(--mist)] object-cover"
                  key={activeStep}
                />
              </div>
              <div className="h-1 w-full bg-[var(--mist)]">
                <div
                  className="h-full bg-[var(--flare)] transition-all duration-700"
                  style={{
                    width: `${((activeStep + 1) / steps.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="surface-soft mt-16 flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h3 className="display-md text-[var(--ink)]">
              {cta.readyToGetStarted}
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--ink-500)]">
              {cta.joinText}
            </p>
          </div>
          <Link href="/contact" className="btn btn-brand shrink-0">
            {cta.startFreeTrial}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
