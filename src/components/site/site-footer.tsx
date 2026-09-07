import Link from "next/link";

import { BrandLogo } from "@/components/site/brand-mark";
import { NewsletterForm } from "@/components/site/newsletter-form";
import { FooterPaymentMethods } from "@/components/site/footer-payment-methods";
import {
  getApprovedStorefrontContent,
  type ControlledContentRecord,
} from "@/content/storefront-content";
import {
  footerNavigationGroups,
  footerSocialUrls,
  newsletterConfiguration,
  projectFooterSocialLinks,
  projectNewsletterPrivacyLinkView,
  researchRestrictions,
  siteName,
  type ApprovedNewsletterPrivacyHref,
  type FooterNavigationGroup,
  type FooterSocialPlatform,
} from "@/lib/site-content";

type SiteFooterProps = Readonly<{
  navigationGroups?: readonly FooterNavigationGroup[];
  socialUrls?: Readonly<Partial<Record<FooterSocialPlatform, unknown>>>;
  legalNotices?: readonly ControlledContentRecord[];
  newsletterPrivacyHref?: ApprovedNewsletterPrivacyHref | null | undefined;
}>;

const footerLinkClassName =
  "footer-nav-link inline-flex min-h-11 min-w-11 items-center rounded-md px-2 py-2 text-sm text-canvas/80 transition-colors duration-200 hover:text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas";

function SocialIcon({ platform }: { platform: FooterSocialPlatform }) {
  if (platform === "instagram") {
    return (
      <svg
        aria-hidden="true"
        className="size-5"
        fill="none"
        focusable="false"
        viewBox="0 0 24 24"
      >
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="17.5" cy="6.7" r="1" fill="currentColor" />
      </svg>
    );
  }

  if (platform === "tiktok") {
    return (
      <svg
        aria-hidden="true"
        className="size-5"
        fill="none"
        focusable="false"
        viewBox="0 0 24 24"
      >
        <path
          d="M14 4v10.2a4.2 4.2 0 1 1-3.2-4.1M14 4c.5 2.7 2.1 4.2 5 4.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (platform === "x") {
    return (
      <svg
        aria-hidden="true"
        className="size-5"
        fill="none"
        focusable="false"
        viewBox="0 0 24 24"
      >
        <path d="M5 4.5 19 19.5M19 4.5 5 19.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="size-5"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M13.8 20v-7h2.7l.5-3h-3.2V8.1c0-.9.4-1.7 1.8-1.7H17V3.7c-.6-.1-1.4-.2-2.4-.2-2.5 0-4.2 1.5-4.2 4.3V10H8v3h2.4v7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function SiteFooter({
  navigationGroups = footerNavigationGroups,
  socialUrls = footerSocialUrls,
  legalNotices,
  newsletterPrivacyHref = newsletterConfiguration.privacyHref,
}: SiteFooterProps = {}) {
  const renderedGroups = navigationGroups
    .map((group) => ({
      label: group.label,
      links: group.links.filter(
        (link): link is typeof link & { href: string } => link.href !== null,
      ),
    }))
    .filter((group) => group.links.length > 0);
  const socialLinks = projectFooterSocialLinks(socialUrls);
  const approvedContent = legalNotices === undefined
    ? getApprovedStorefrontContent()
    : getApprovedStorefrontContent(legalNotices);
  const approvedLegalNotices = approvedContent
    .filter((record) => record.kind === "legal_notice")
    .map((record) => ({ id: record.id, title: record.title, body: record.body }));
  const newsletterPrivacyLink = projectNewsletterPrivacyLinkView(
    newsletterPrivacyHref,
  );
  const currentYear = new Date().getFullYear();

  return (
    <>
    {newsletterConfiguration.enabled ? <div className="newsletter-prefooter bg-ink text-canvas">
      <div className="site-container">
        <NewsletterForm
          available={newsletterConfiguration.enabled}
          presentation="footer"
          privacyHref={newsletterPrivacyLink}
        />
      </div>
    </div> : null}
    <footer className="bg-ink text-canvas">
      <div className="footer-inner site-container pt-10 pb-3 md:pt-12">
        <div className="footer-primary-grid grid min-w-0 gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8 xl:gap-12">
          <div className="footer-brand min-w-0 max-w-xl">
            <Link
              href="/"
              aria-label={`${siteName} home`}
              className="inline-flex min-h-11 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
            >
              <BrandLogo tone="inverse" />
            </Link>
            <p className="mt-6 font-heading text-3xl leading-tight text-canvas sm:text-4xl">
              Research materials,<br />documented with clarity.
            </p>
            <p className="mt-5 max-w-[62ch] text-base leading-7 text-canvas/70">
              Explore research materials, compare product amounts, and review the details
              that matter to your selection.
            </p>

            {socialLinks.length > 0 ? <section aria-label="Social media" className="mt-7 min-w-0">
              <h2 className="font-heading text-sm uppercase tracking-[0.16em] text-canvas">
                Social media
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {socialLinks.map((social) => (
                  <li key={social.platform}>
                    <a
                      href={social.href}
                      aria-label={social.label}
                      data-platform={social.platform}
                      className="footer-social-link inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                    >
                      <SocialIcon platform={social.platform} />
                    </a>
                  </li>
                ))}
              </ul>
            </section> : null}
          </div>

          <nav
            aria-label="Footer"
            className="footer-navigation grid min-w-0 content-start gap-6 md:grid-cols-1 lg:col-span-3 lg:grid-cols-3 lg:gap-8"
          >
            {renderedGroups.map((group, groupIndex) => {
              const summaryId = `footer-group-${groupIndex}-summary`;
              const headingId = `footer-group-${groupIndex}-heading`;
              return (
                <details
                  aria-labelledby={headingId}
                  className="footer-navigation__group min-w-0 border-t border-canvas/20 pt-2 lg:border-t-0 lg:pt-0"
                  key={`${group.label}-${groupIndex}`}
                  open
                >
                  <summary
                    className="min-h-11 cursor-pointer rounded-md py-2 text-canvas marker:text-canvas/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
                    id={summaryId}
                  >
                    <h2
                      className="inline font-heading text-sm uppercase tracking-[0.16em] text-canvas"
                      id={headingId}
                    >
                      {group.label}
                    </h2>
                  </summary>
                  <ul aria-labelledby={summaryId} className="mt-1 space-y-1">
                    {group.links.map((item) => (
                      <li key={`${item.label}-${item.href}`}>
                        {item.href.includes("#") ? (
                          <a href={item.href} className={footerLinkClassName}>
                            {item.label}
                          </a>
                        ) : (
                          <Link href={item.href} className={footerLinkClassName}>
                            {item.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </nav>
        </div>

        <section
          aria-labelledby="footer-notices-heading"
          className="footer-bottom-row mt-8 border-t border-canvas/20 pt-6"
        >
          <h2
            id="footer-notices-heading"
            className="font-heading text-sm uppercase tracking-[0.16em] text-canvas"
          >
            Research use and legal notices
          </h2>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-canvas/75">
            {researchRestrictions.map((restriction) => (
              <li key={restriction}>{restriction}</li>
            ))}
          </ul>
          {approvedLegalNotices.length > 0 ? (
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {approvedLegalNotices.map((notice) => (
                <article key={notice.id} className="min-w-0">
                  <h3 className="font-heading text-base text-canvas">{notice.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-canvas/75">
                    {notice.body}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
          <div className="footer-assurance-row mt-6 border-t border-canvas/20 pt-4">
          {/* The release checklist verifies this origin with verify:production-https.
              This describes the linked production origin, not a certification. */}
          <a href="https://propeptiq.com" className={`footer-ssl ${footerLinkClassName}`}
            aria-label="SSL secured connection to propeptiq.com">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="mr-2 size-4" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            SSL SECURED · propeptiq.com
          </a>
          <FooterPaymentMethods />
          <p className="footer-copyright text-sm leading-6 text-canvas/70">
            © {currentYear} {siteName}
          </p>
          </div>
        </section>
      </div>
    </footer>
    </>
  );
}
