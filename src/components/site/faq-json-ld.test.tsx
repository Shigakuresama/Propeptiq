import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getApprovedHomepageContent, storefrontContentRecords } from "@/content/storefront-content";
import { FaqJsonLd } from "./faq-json-ld";
import { FaqSection } from "./faq-section";

describe("FAQ structured data", () => {
  it("matches each published question and answer exactly and in visible order", () => {
    const entries = getApprovedHomepageContent(storefrontContentRecords).faqs;
    expect(entries).toHaveLength(8);
    const { container } = render(<><FaqSection entries={entries} /><FaqJsonLd entries={entries} /></>);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0]!.textContent!);
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("FAQPage");
    const details = [...container.querySelectorAll("details")];
    expect(data.mainEntity).toEqual(details.map((entry) => ({
      "@type": "Question",
      name: entry.querySelector("summary > span")!.textContent,
      acceptedAnswer: { "@type": "Answer", text: entry.querySelector("p")!.textContent },
    })));
    expect(details.every((entry) => entry.getAttribute("name") === "propeptiq-home-faq")).toBe(true);
  });

  it("escapes script-closing text without changing the question or answer data", () => {
    const entries = [{ id: "fictional", anchor: "faq-fictional" as const,
      question: "Fictional </script><script>alert(1)</script> question?",
      answer: "Fictional <b>answer</b> & details.",
    }];
    const markup = renderToStaticMarkup(<FaqJsonLd entries={entries} />);
    expect(markup.match(/<script/gu)).toHaveLength(1);
    expect(markup.match(/<\/script>/gu)).toHaveLength(1);
    const payload = markup.slice(markup.indexOf(">") + 1, markup.lastIndexOf("</script>"));
    expect(JSON.parse(payload).mainEntity[0]).toMatchObject({
      name: entries[0]!.question,
      acceptedAnswer: { text: entries[0]!.answer },
    });
  });

  it("omits structured data when there are no published questions", () => {
    expect(renderToStaticMarkup(<FaqJsonLd entries={[]} />)).toBe("");
  });
});
