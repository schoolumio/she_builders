import { Notice } from "@/components/ui/card";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold text-plum-900">{title}</h1>
      <Notice tone="warning" className="mt-4" title="Draft — requires legal review">
        This document is a working draft prepared for product development. It has not been reviewed by a lawyer and is not a claim of legal or regulatory compliance. It must be reviewed and adapted before launch.
      </Notice>
      <div className="prose-text mt-8 space-y-6 text-[15px] leading-7 text-ink [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-plum-900 [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </article>
  );
}
