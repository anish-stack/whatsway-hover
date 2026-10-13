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
import { Link } from "wouter";
import {
  Twitter,
  Linkedin,
  Github,
  Mail,
  MessageSquare,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { AppSettings } from "@/types/types";

const Footer: React.FC = () => {
  const { t } = useTranslation();

  const { data: brandSettings } = useQuery<AppSettings>({
    queryKey: ["/api/brand-settings"],
    queryFn: () => fetch("/api/brand-settings").then((res) => res.json()),
    staleTime: 5 * 60 * 1000,
  });

  const productLinks = t(
    "Landing.footerSec.links.product"
  ) as unknown as string[];
  const companyLinks = t(
    "Landing.footerSec.links.company"
  ) as unknown as string[];
  const supportLinks = t(
    "Landing.footerSec.links.support"
  ) as unknown as string[];
  const resourcesLinks = t(
    "Landing.footerSec.links.resources"
  ) as unknown as string[];
  const legalLinks = t("Landing.footerSec.links.legal") as unknown as string[];

  const links = {
    product: [
      { name: productLinks[0], href: "/#features" },
      { name: productLinks[1], href: "/#how-it-works" },
      { name: productLinks[2], href: "/#use-cases" },
    ],
    company: [
      { name: companyLinks[0], href: "/about" },
      { name: companyLinks[1], href: "/contact" },
      { name: companyLinks[2], href: "/careers" },
    ],
    support: [
      { name: supportLinks[0], href: "#" },
      { name: supportLinks[1], href: "#" },
      { name: supportLinks[2], href: "#" },
      { name: supportLinks[3], href: "#" },
    ],
    resources: [
      { name: resourcesLinks[1], href: "/case-studies" },
      { name: resourcesLinks[2], href: "/whatsapp-guide" },
      { name: resourcesLinks[3], href: "/best-practices" },
    ],
    legal: [
      { name: legalLinks[0], href: "/privacy-policy" },
      { name: legalLinks[1], href: "/terms" },
      { name: legalLinks[2], href: "/cookie-policy" },
    ],
  };

  const renderLink = (link: { name: string; href: string }, index: number) => (
    <li key={index}>
      {link.href.startsWith("/") ? (
        <Link
          to={link.href}
          className="text-sm text-white/55 transition-colors hover:text-white"
        >
          {link.name}
        </Link>
      ) : (
        <a
          href={link.href}
          className="text-sm text-white/55 transition-colors hover:text-white"
        >
          {link.name}
        </a>
      )}
    </li>
  );

  const socials = [
    { href: "https://x.com", Icon: Twitter, label: t("Landing.footerSec.socialLinks.twitter") },
    { href: "https://linkedin.com/", Icon: Linkedin, label: t("Landing.footerSec.socialLinks.linkedin") },
    { href: "https://github.com/", Icon: Github, label: t("Landing.footerSec.socialLinks.github") },
    { href: "https://mail.google.com", Icon: Mail, label: t("Landing.footerSec.socialLinks.mail") },
  ];

  return (
    <footer className="ink-bg">
      <div className="shell pb-10 pt-16">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <Link href="/" className="inline-flex items-center">
              {brandSettings?.logo2 && brandSettings.logo2 !== "/uploads/null" ? (
                <img
                  src={brandSettings.logo2}
                  alt="Logo"
                  className="h-11 object-contain"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              ) : brandSettings?.logo ? (
                <img
                  src={brandSettings.logo}
                  alt="Logo"
                  className="h-11 object-contain"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--brand)] text-white">
                  <MessageSquare className="h-6 w-6" />
                </span>
              )}
            </Link>

            <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/55">
              {t("Landing.footerSec.brandSection.description")}
            </p>

            <div className="mt-7 flex gap-2">
              {socials.map(({ href, Icon, label }) => (
                <a
                  key={href}
                  href={href}
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 text-white/60 transition-colors hover:border-[var(--flare)] hover:text-[var(--flare)]"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
            <div>
              <h3 className="text-sm font-semibold text-white">Product</h3>
              <ul className="mt-4 space-y-3">
                {links.product.map((link, index) => renderLink(link, index))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Company</h3>
              <ul className="mt-4 space-y-3">
                {links.company.map((link, index) => renderLink(link, index))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Resources</h3>
              <ul className="mt-4 space-y-3">
                {links.resources.map((link, index) => renderLink(link, index))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Legal</h3>
              <ul className="mt-4 space-y-3">
                {links.legal.map((link, index) => renderLink(link, index))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="shell flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          <p className="text-xs text-white/40">
            {t("Landing.footerSec.bottomBar.copyrightText", {
              appName: brandSettings?.title ?? "",
            })}
          </p>
          <div className="flex items-center gap-6">
            <Link
              to="/terms"
              className="text-xs text-white/40 transition-colors hover:text-white"
            >
              {t("Landing.footerSec.bottomBar.termsLink")}
            </Link>
            <Link
              to="/privacy-policy"
              className="text-xs text-white/40 transition-colors hover:text-white"
            >
              {t("Landing.footerSec.bottomBar.privacyLink")}
            </Link>
            <Link
              to="/cookie-policy"
              className="text-xs text-white/40 transition-colors hover:text-white"
            >
              {t("Landing.footerSec.bottomBar.cookieLink")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
