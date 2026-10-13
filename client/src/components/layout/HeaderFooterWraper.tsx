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

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { setMeta } from "@/hooks/setMeta";
import { AppSettings } from "@/types/types";

interface LayoutProps {
  children: React.ReactNode;
}

export const HeaderFooterWraper = ({ children }: LayoutProps) => {
  const [location] = useLocation();

  const { data: brandSettings } = useQuery<AppSettings>({
    queryKey: ["/api/brand-settings"],
    queryFn: () => fetch("/api/brand-settings").then((res) => res.json()),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location]);

  useEffect(() => {
    if (brandSettings) {
      setMeta({
        title: brandSettings.title,
        favicon: brandSettings.favicon || undefined,
        description: brandSettings.tagline || undefined,
      });
    }
  }, [brandSettings]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
};
