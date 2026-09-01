import Link from "next/link";

import { BrandLogo } from "@/components/site/brand-mark";
import {
  getApprovedStorefrontContent,
  type ControlledContentRecord,
} from "@/content/storefront-content";
import {
  footerNavigationGroups,
  footerSocialUrls,
  projectFooterSocialLinks,
  researchRestrictions,
  siteName,
  type FooterNavigationGroup,
  type FooterSocialPlatform,
} from "@/lib/site-content";

type SiteFooterProps = Readonly<{
  navigationGroups?: readonly FooterNavigationGroup[];
  socialUrls?: Readonly<Partial<Record<FooterSocialPlatform, unknown>>>;
  legalNotices?: readonly ControlledContentRecord[];
}>;

const footerLinkClassName =
  "inline-flex min-h-11 min-w-11 items-center rounded-md px-2 py-2 text-sm text-canvas/80 transition-colors duration-200 hover:text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas";

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

  return (
    <footer className="bg-ink text-canvas">
      <div className="site-container py-12 md:py-16">
        <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="min-w-0 max-w-xl">
            <Link
              href="/"
              aria-label={`${siteName} home`}
              className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
            >
              <BrandLogo className="max-w-full sm:w-56" />
            </Link>
            <p className="mt-6 font-heading text-3xl leading-tight text-canvas sm:text-4xl">
              Research materials, governed by evidence.
            </p>
            <p className="mt-5 max-w-[62ch] text-base leading-7 text-canvas/70">
              Catalog names and package configurations come from owner-supplied records;
              cart and checkout facts remain server-authoritative.
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="grid min-w-0 content-start gap-8 sm:grid-cols-2 lg:grid-cols-4"
          >
            {renderedGroups.map((group, groupIndex) => {
              const headingId = `footer-group-${groupIndex}`;
              return (
                <section key={`${group.label}-${groupIndex}`} aria-labelledby={headingId}>
                  <h2
                    id={headingId}
                    className="font-heading text-sm uppercase tracking-[0.16em] text-canvas"
                  >
                    {group.label}
                  </h2>
                  <ul className="mt-3 space-y-1">
                    {group.links.map((item) => (
                      <li key={`${item.label}-${item.href}`}>
                        <Link href={item.href} className={footerLinkClassName}>
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </nav>
        </div>

        <section
          aria-label="Social media"
          className="mt-10 border-t border-canvas/20 pt-8"
        >
          <h2 className="font-heading text-sm uppercase tracking-[0.16em] text-canvas">
            Social media
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {socialLinks.map((social) => (
              <li key={social.platform}>
                <a
                  href={social.href}
                  aria-label={social.label}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-canvas/30 text-canvas/80 transition-colors duration-200 hover:border-canvas/60 hover:text-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas"
                >
                  <SocialIcon platform={social.platform} />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="footer-notices-heading"
          className="mt-8 border-t border-canvas/20 pt-8"
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
        </section>
      </div>
    </footer>
  );
}
