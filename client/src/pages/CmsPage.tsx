import { ReactNode } from "react";
import Seo from "@/components/Seo";
import { useCmsPage, useCmsSlugs } from "@/hooks/useCms";

const CSS = `
.cms-body{color:var(--ink-700,#334155);line-height:1.75;font-size:1rem}
.cms-body h1,.cms-body h2,.cms-body h3,.cms-body h4{color:var(--ink,#0f172a);font-weight:700;line-height:1.25;margin:1.6em 0 .6em}
.cms-body h1{font-size:2rem}.cms-body h2{font-size:1.5rem}.cms-body h3{font-size:1.2rem}
.cms-body p{margin:0 0 1em}
.cms-body a{color:var(--brand,#08a957);text-decoration:underline}
.cms-body ul{list-style:disc;padding-left:1.4em;margin:0 0 1em}
.cms-body ol{list-style:decimal;padding-left:1.4em;margin:0 0 1em}
.cms-body img,.cms-body video,.cms-body iframe{max-width:100%;border-radius:12px;margin:1em 0}
.cms-body blockquote{border-left:4px solid var(--brand,#08a957);padding:.2em 1em;margin:1em 0;color:#475569;background:rgba(8,169,87,.05)}
.cms-body table{width:100%;border-collapse:collapse;margin:1em 0}
.cms-body th,.cms-body td{border:1px solid #e2e8f0;padding:.5em .75em;text-align:left}
.cms-body th{background:#f8fafc}
`;

export function CmsView({ page }: { page: any }) {
  const wide = page.template === "full";
  const legal = page.template === "legal";
  return (
    <div className="pt-16">
      <Seo
        title={page.metaTitle || page.title}
        description={page.metaDescription || page.excerpt}
        keywords={page.metaKeywords}
        image={page.ogImage}
        canonical={page.canonicalUrl}
        noindex={page.noindex}
        schemaJson={page.schemaJson}
      />
      <style>{CSS}</style>
      <section className={`px-4 sm:px-6 lg:px-8 ${legal ? "py-12 bg-[var(--canvas)]" : "py-16"}`}>
        <div className={`mx-auto ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
          {page.showTitle && (
            <header className="mb-8">
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-[var(--ink)]">{page.title}</h1>
              {legal && page.updatedAt && (
                <p className="mt-3 text-sm text-[var(--ink-500)]">Last updated: {new Date(page.updatedAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</p>
              )}
              {!legal && page.excerpt && <p className="mt-4 text-lg text-[var(--ink-500)]">{page.excerpt}</p>}
            </header>
          )}
          <div className={legal ? "bg-white rounded-2xl border border-[var(--mist)] p-6 md:p-10" : ""}>
            <div className="cms-body" dangerouslySetInnerHTML={{ __html: page.content }} />
          </div>
        </div>
      </section>
    </div>
  );
}

/** Renders the published CMS page for `slug`, otherwise the built-in `fallback`. */
export function CmsOverride({ slug, fallback }: { slug: string; fallback: ReactNode }) {
  const { data, isLoading } = useCmsPage(slug);
  if (isLoading) return <div className="pt-32 pb-32" />;
  return data?.data ? <CmsView page={data.data} /> : <>{fallback}</>;
}

/**
 * Catch-all for single-segment URLs. Published CMS slug → CMS page (with Header/Footer);
 * anything else → the app's normal (protected / 404) routes.
 */
export function CmsOrApp({ slug, Header, Footer, App }: { slug: string; Header: any; Footer: any; App: any }) {
  const slugs = useCmsSlugs();
  const isCms = !!slugs.data?.slugs?.includes(slug.toLowerCase());
  const page = useCmsPage(slug, isCms);
  if (slugs.isLoading || (isCms && page.isLoading)) return <div className="fixed inset-0 bg-white" />;
  if (isCms && page.data?.data) {
    return (<><Header /><CmsView page={page.data.data} /><Footer /></>);
  }
  return <App />;
}
