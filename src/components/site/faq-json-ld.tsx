import type { ApprovedFaqEntry } from "@/content/storefront-content";

export function FaqJsonLd({ entries }: { entries: readonly ApprovedFaqEntry[] }) {
  if (entries.length === 0) return null;

  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</gu, "\\u003c"),
      }}
    />
  );
}
