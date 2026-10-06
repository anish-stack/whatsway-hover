import { useEffect, useState } from "react";
import { ArrowRight, Users, TrendingUp, Zap } from "lucide-react";
import LoadingAnimation from "./LoadingAnimation";
import { useTranslation } from "@/lib/i18n";
import { Link } from "wouter";

const TYPING_WORDS = [
  "WhatsApp Marketing",
  "Customer Engagement",
  "Business Growth",
];

const Hero = () => {
  const [currentStat, setCurrentStat] = useState(0);
  const [animatedNumbers, setAnimatedNumbers] = useState({
    users: 0,
    delivery: 0,
    engagement: 0,
  });
  const { t } = useTranslation();
  const [startTrialLoading, setStartTrialLoading] = useState(false);

  const [wordIndex, setWordIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = TYPING_WORDS[wordIndex];
    let timeout: NodeJS.Timeout;

    if (!isDeleting && displayText === currentWord) {
      timeout = setTimeout(() => setIsDeleting(true), 2000);
    } else if (isDeleting && displayText === "") {
      setIsDeleting(false);
      setWordIndex((prev) => (prev + 1) % TYPING_WORDS.length);
    } else {
      const speed = isDeleting ? 40 : 80;
      timeout = setTimeout(() => {
        setDisplayText(
          isDeleting
            ? currentWord.substring(0, displayText.length - 1)
            : currentWord.substring(0, displayText.length + 1)
        );
      }, speed);
    }

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, wordIndex]);

  const stats = [
    {
      icon: Users,
      value: 50000,
      label: t("Landing.heroSec.stats.0.label"),
      suffix: "+",
    },
    {
      icon: TrendingUp,
      value: 98,
      label: t("Landing.heroSec.stats.1.label"),
      suffix: t("Landing.heroSec.stats.1.suffix"),
    },
    {
      icon: Zap,
      value: 5,
      label: t("Landing.heroSec.stats.2.label"),
      suffix: t("Landing.heroSec.stats.2.suffix"),
    },
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStat((prev) => (prev + 1) % stats.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const animateNumbers = () => {
      const duration = 2000;
      const steps = 60;
      const stepDuration = duration / steps;

      let step = 0;
      const timer = setInterval(() => {
        step++;
        const progress = step / steps;

        setAnimatedNumbers({
          users: Math.floor(50000 * progress),
          delivery: Math.floor(98 * progress),
          engagement: Math.floor(5 * progress),
        });

        if (step >= steps) clearInterval(timer);
      }, stepDuration);
    };

    animateNumbers();
  }, []);

  const handleStartTrial = () => {
    setStartTrialLoading(true);
    setTimeout(() => {
      setStartTrialLoading(false);
    }, 2000);
  };

  const statValue = (index: number) =>
    index === 0
      ? animatedNumbers.users.toLocaleString()
      : index === 1
      ? animatedNumbers.delivery
      : animatedNumbers.engagement;

  return (
    <section className="relative overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-20 canvas-bg">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] grid-bg opacity-60" />
      <div
        className="pointer-events-none absolute -right-24 top-10 h-[420px] w-[420px] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--brand) 28%, transparent), transparent 70%)",
        }}
      />

      <div className="shell relative">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          {/* ---------------- copy ---------------- */}
          <div className="lg:col-span-7 rise">
            <span className="chip">
              <Zap className="h-3.5 w-3.5" />
              {t("Landing.heroSec.animatedBgGreenText")}
            </span>

            <h1 className="display-xl mt-6 text-[var(--ink)]">
              {t("Landing.heroSec.headline")}{" "}
              <span className="text-[var(--brand)]">
                {displayText}
                <span
                  className="ml-1 inline-block h-[0.78em] w-[3px] align-middle bg-[var(--flare)]"
                  style={{ animation: "pulseGentle 1s steps(2) infinite" }}
                />
              </span>
            </h1>

            <p className="lede mt-6">{t("Landing.heroSec.subHeadline")}</p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/contact"
                onClick={handleStartTrial}
                className="btn btn-brand group w-full justify-center sm:w-auto"
              >
                {startTrialLoading ? (
                  <LoadingAnimation size="md" color="white" />
                ) : (
                  <>
                    {t("Landing.heroSec.startTrialButton")}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </>
                )}
              </Link>
              <a
                href="#how-it-works"
                className="btn btn-quiet w-full justify-center sm:w-auto"
              >
                {t("Landing.howItWorksSec.introTagline")}
              </a>
            </div>

            {/* stat rail — a single ruled row, not three identical cards */}
            <div className="mt-12 grid grid-cols-1 divide-y divide-[var(--mist)] border-y border-[var(--mist)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {stats.map((stat, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 py-5 transition-colors sm:px-5 sm:first:pl-0 ${
                    currentStat === index ? "rule-flare pl-4 sm:pl-5" : ""
                  }`}
                >
                  <stat.icon
                    className={`h-5 w-5 shrink-0 ${
                      currentStat === index
                        ? "text-[var(--flare)]"
                        : "text-[var(--ink-300)]"
                    }`}
                  />
                  <div>
                    <div className="stat-figure">
                      {statValue(index)}
                      {stat.suffix || ""}
                    </div>
                    <div className="stat-label">{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ---------------- phone mockup panel ---------------- */}
          <div className="lg:col-span-5">
            <div
              className="relative mx-auto max-w-[420px] rise"
              style={{ animationDelay: "0.12s" }}
            >
              <img
                src="/assets/hero-whatsapp-phone.png"
                alt="WhatsApp business chat automation preview"
                className="w-full h-auto select-none pointer-events-none"
                draggable={false}
              />
            </div>
          </div>
        </div>

        {/* trusted-by: one quiet line */}
        <div className="mt-16 border-t border-[var(--mist)] pt-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-8">
            <p className="text-sm text-[var(--ink-500)]">
              {t("Landing.heroSec.trustedByText")}
            </p>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
              {["Shopify", "WooCommerce", "Salesforce", "HubSpot", "Zapier"].map(
                (brand) => (
                  <span
                    key={brand}
                    className="text-sm font-semibold text-[var(--ink-300)] transition-colors hover:text-[var(--ink)]"
                  >
                    {brand}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;