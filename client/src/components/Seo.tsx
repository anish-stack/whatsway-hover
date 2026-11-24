import { useEffect } from "react";

type Props = {
  title?: string | null; description?: string | null; keywords?: string | null; image?: string | null;
  canonical?: string | null; noindex?: boolean; schemaJson?: string | null;
};

function setMeta(attr: "name" | "property", key: string, value?: string | null) {
  const sel = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(sel);
  if (!value) { el?.remove(); return; }
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); el.setAttribute("data-cms", "1"); document.head.appendChild(el); }
  el.setAttribute("content", value);
}

/** Minimal head manager (no extra dependency). Restores previous title on unmount. */
export default function Seo({ title, description, keywords, image, canonical, noindex, schemaJson }: Props) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = title;
    setMeta("name", "description", description);
    setMeta("name", "keywords", keywords);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:image", image);
    setMeta("property", "og:type", "website");
    setMeta("name", "twitter:card", image ? "summary_large_image" : "summary");

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
      if (!link) { link = document.createElement("link"); link.rel = "canonical"; link.setAttribute("data-cms", "1"); document.head.appendChild(link); }
      link.href = canonical;
    } else link?.remove();

    let ld: HTMLScriptElement | null = null;
    if (schemaJson) {
      try {
        JSON.parse(schemaJson);
        ld = document.createElement("script");
        ld.type = "application/ld+json"; ld.setAttribute("data-cms", "1"); ld.text = schemaJson;
        document.head.appendChild(ld);
      } catch { /* invalid JSON-LD ignored */ }
    }
    return () => {
      document.title = prevTitle;
      document.head.querySelectorAll("[data-cms='1']").forEach((n) => n.remove());
    };
  }, [title, description, keywords, image, canonical, noindex, schemaJson]);
  return null;
}
