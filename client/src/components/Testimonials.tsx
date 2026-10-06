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
import { Star, ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const Testimonials: React.FC = () => {
  const { t } = useTranslation();
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  const testimonials = t(
    "Landing.testimonialsSec.testimonials"
  ) as unknown as Array<{
    name: string;
    role: string;
    company: string;
    image: string;
    rating: number;
    text: string;
    results: string;
  }>;

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  const navButtons = t("Landing.testimonialsSec.navButtons") as unknown as {
    previous: string;
    next: string;
  };

  const statsGrid = t("Landing.testimonialsSec.statsGrid") as unknown as Array<{
    number: string;
    label: string;
  }>;

  const prevTestimonial = () => {
    setCurrentTestimonial(
      (prev) => (prev - 1 + testimonials.length) % testimonials.length
    );
  };

  const nextTestimonial = () => {
    setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
  };

  const active = testimonials[currentTestimonial];

  return (
    <section className="band bg-background">
      <div className="shell">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-4">
            <span className="chip chip-flare">
              <Star className="h-3.5 w-3.5 fill-current" />
              {t("Landing.testimonialsSec.introTagline")}
            </span>
            <h2 className="display-lg mt-5 text-[var(--ink)]">
              {t("Landing.testimonialsSec.headlinePre")}{" "}
              {t("Landing.testimonialsSec.headlineHighlight")}
            </h2>
            <p className="lede mt-5">
              {t("Landing.testimonialsSec.subHeadline")}
            </p>

            <div className="mt-8 flex items-center gap-3">
              <button
                onClick={prevTestimonial}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--mist)] text-[var(--ink-500)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
                aria-label={navButtons.previous}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                onClick={nextTestimonial}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--mist)] text-[var(--ink-500)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
                aria-label={navButtons.next}
              >
                <ArrowRight className="h-4 w-4" />
              </button>
              <div className="ml-2 flex items-center gap-1.5">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentTestimonial(index)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      index === currentTestimonial
                        ? "w-7 bg-[var(--flare)]"
                        : "w-1.5 bg-[var(--mist)] hover:bg-[var(--ink-300)]"
                    }`}
                    aria-label={`Go to testimonial ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            <figure className="plate p-7 sm:p-10">
              <div className="flex items-center gap-1">
                {[...Array(active.rating)].map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-[var(--warn)] text-[var(--warn)]"
                  />
                ))}
              </div>

              <blockquote className="mt-6 font-[family-name:var(--font-display)] text-xl leading-[1.35] tracking-[-0.02em] text-[var(--ink)] sm:text-2xl">
                {active.text}
              </blockquote>

              <figcaption className="mt-8 flex flex-wrap items-center justify-between gap-5 border-t border-[var(--mist)] pt-6">
                <div className="flex items-center gap-3.5">
                  <img
                    src={active.image}
                    alt={active.name}
                    className="h-12 w-12 rounded-xl object-cover"
                  />
                  <div>
                    <p className="font-semibold text-[var(--ink)]">
                      {active.name}
                    </p>
                    <p className="text-sm text-[var(--ink-500)]">
                      {active.role} · {active.company}
                    </p>
                  </div>
                </div>
                <span className="chip chip-ok">{active.results}</span>
              </figcaption>
            </figure>

            <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--mist)] bg-[var(--mist)] md:grid-cols-4">
              {statsGrid.map((stat, index) => (
                <div key={index} className="bg-background p-5 text-center">
                  <div className="stat-figure text-[var(--brand)]">
                    {stat.number}
                  </div>
                  <div className="stat-label mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
