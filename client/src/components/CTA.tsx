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

import React from "react";
import { ArrowRight, MessageCircle, Zap, Shield, Clock } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Link } from "wouter";

const CTA: React.FC = () => {
  const { t } = useTranslation();

  const iconMap = {
    "Instant Setup": Zap,
    "Secure & Compliant": Shield,
    "24/7 Support": Clock,
    "Free Forever": MessageCircle,
  };

  return (
    <section className="band ink-bg relative overflow-hidden">
      <div
        className="pointer-events-none absolute -left-32 top-0 h-[380px] w-[380px] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(8,169,87,0.55), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 right-0 h-[320px] w-[320px] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(255,138,52,0.3), transparent 70%)",
        }}
      />

      <div className="shell relative">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-14">
          <div className="lg:col-span-7">
            <span className="chip bg-white/10 text-white/85">
              <MessageCircle className="h-3.5 w-3.5" />
              {t("Landing.ctaSec.introTagline")}
            </span>
            <h2 className="display-lg mt-5 text-white">
              {t("Landing.ctaSec.headline")}
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65">
              {t("Landing.ctaSec.subHeadline")}
            </p>
          </div>

          <div className="lg:col-span-5 lg:justify-self-end">
            <Link href="/contact" className="btn btn-flare group w-full justify-center sm:w-auto">
              {t("Landing.ctaSec.buttons.startTrial")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {(t("Landing.ctaSec.trustIndicators") as unknown as any[]).map(
            (item: any, index: number) => {
              const IconComponent =
                iconMap[item.title as keyof typeof iconMap] || Zap;
              return (
                <div
                  key={`${item.title}-${index}`}
                  className="bg-[var(--ink)] p-6"
                >
                  <IconComponent className="h-5 w-5 text-[var(--flare)]" />
                  <h3 className="mt-4 text-base font-semibold text-white">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/55">
                    {item.desc}
                  </p>
                </div>
              );
            }
          )}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-8 border-t border-white/10 pt-8 md:grid-cols-4">
          {(t("Landing.ctaSec.stats") as unknown as any[]).map(
            (stat: any, index: number) => (
              <div key={`${stat.label}-${index}`}>
                <div className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white md:text-4xl">
                  {stat.number}
                </div>
                <div className="mt-1 text-sm text-white/50">{stat.label}</div>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
};

export default CTA;
