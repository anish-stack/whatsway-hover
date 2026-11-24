import { useQuery } from "@tanstack/react-query";
import {
  Users, Briefcase, Mail, Zap, BookOpen, Calculator, FileText, Code, TrendingUp, Shield, Info, Phone,
  HelpCircle, Globe, Star, Heart, Newspaper, Scale, type LucideIcon,
} from "lucide-react";

export type CmsNavItem = {
  id: string; label: string; path: string; location: string; description?: string | null;
  icon?: string | null; image?: string | null; sortOrder: number; isVisible: boolean; openInNewTab: boolean;
};

export const ICONS: Record<string, LucideIcon> = {
  Users, Briefcase, Mail, Zap, BookOpen, Calculator, FileText, Code, TrendingUp, Shield, Info, Phone,
  HelpCircle, Globe, Star, Heart, Newspaper, Scale,
};
export const ICON_NAMES = Object.keys(ICONS);
export const DEFAULT_MENU_IMAGE =
  "https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=300&h=200&fit=crop";

export function useCmsNav() {
  const q = useQuery<{ items: CmsNavItem[] }>({
    queryKey: ["/api/cms/nav"],
    queryFn: async () => (await fetch("/api/cms/nav")).json(),
    staleTime: 60_000,
  });
  const items = q.data?.items || [];
  const by = (loc: string) => items.filter((i) => i.location === loc).sort((a, b) => a.sortOrder - b.sortOrder);
  return { loaded: !!q.data, items, by };
}

/** Published CMS slugs (cached). Used to decide if a URL belongs to the CMS. */
export function useCmsSlugs() {
  return useQuery<{ slugs: string[] }>({
    queryKey: ["/api/cms/slugs"],
    queryFn: async () => (await fetch("/api/cms/slugs")).json(),
    staleTime: 60_000,
  });
}

export function useCmsPage(slug: string, enabled = true) {
  return useQuery<{ data: any } | null>({
    queryKey: ["/api/cms/pages", slug],
    enabled,
    queryFn: async () => {
      const r = await fetch(`/api/cms/pages/${encodeURIComponent(slug)}`);
      if (r.status === 404) return null;
      return r.json();
    },
    staleTime: 60_000,
  });
}
