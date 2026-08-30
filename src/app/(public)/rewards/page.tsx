import type { Metadata } from "next";
import { BadgeCheck, Share2 } from "lucide-react";
import Link from "next/link";

import {
  authRouteWithDestination,
  SIGN_IN_ROUTE,
  SIGN_UP_ROUTE,
} from "@/auth/routes";
import { getRequestIdentity } from "@/auth/server";
import { PageTransition } from "@/components/site/page-transition";
import { RewardsScienceScene } from "@/components/site/rewards-science-scene";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export const metadata: Metadata = {
  title: "Rewards",
  description: "Current PROPEPTIQ LABS rewards program information.",
};

export default async function RewardsPage() {
  const [result, request] = await Promise.all([
    getPublicGrowthProjection(),
    getRequestIdentity().catch(() => null),
  ]);
  const projection = result.status === "active" ? result.projection : null;
  const loyalty = projection?.loyalty?.status === "active" ? projection.loyalty : null;
  const referral = projection?.referral?.status === "active" ? projection.referral : null;
  const available = loyalty !== null || referral !== null;
  const accountAction =
    !available || !request || request.environment.AUTH_MODE === "disabled"
    ? null
    : request.identity?.emailVerifiedAt
      ? { href: "/account/rewards" as const, label: "View your rewards" }
      : request.identity
        ? {
            href: authRouteWithDestination(
              SIGN_IN_ROUTE,
              "/account/rewards",
            ),
            label: "Verify account",
          }
        : {
            href: authRouteWithDestination(
              SIGN_UP_ROUTE,
              "/account/rewards",
            ),
            label: "Create account",
          };
  const termsAvailable = available && Boolean(projection?.terms.rewards);
  const publicStatus =
    result.status === "read_error" ? "read_error" : available ? "active" : "inactive";

  return (
    <PageTransition>
      <div className="rewards-page pb-20">
        <div className="site-container">
          <section aria-labelledby="rewards-heading" className="rewards-hero">
            <div className="rewards-hero__copy">
              <p className="data-label data-label-inverse">Current program record</p>
              <h1 id="rewards-heading" className="rewards-hero__title">
                Rewards
              </h1>
              <p className="rewards-hero__lead">
                Policy-backed program details, surfaced only when an active server record is
                available.
              </p>
              {accountAction || termsAvailable ? (
                <div className="rewards-hero__actions">
                  {accountAction ? (
                    <Link
                      className="rewards-action rewards-action--primary"
                      href={accountAction.href}
                    >
                      {accountAction.label}
                    </Link>
                  ) : null}
                  {termsAvailable ? (
                    <Link
                      className="rewards-action rewards-action--secondary"
                      href="/rewards/terms"
                    >
                      Read current rewards terms
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>

            <RewardsScienceScene
              loyaltyAvailable={loyalty !== null}
              referralAvailable={referral !== null}
              status={publicStatus}
            />
          </section>

          {result.syntheticLocal === true ? (
            <p className="warning-record rewards-synthetic-note text-base font-semibold">
              Synthetic local test only
            </p>
          ) : null}

          <section aria-label="Current rewards program" className="rewards-records">
            <div className="rewards-records__intro">
              <p className="eyebrow">Verified program details</p>
              <p className="rewards-records__description">
                Only records currently marked active are presented as program benefits.
              </p>
            </div>

            {result.status === "read_error" ? (
              <p className="record-sheet rewards-state-panel" role="status">
                <span className="data-label">Record status</span>
                <span className="rewards-state-panel__message">
                  Rewards are temporarily unavailable. Please try again.
                </span>
              </p>
            ) : !available ? (
              <p className="record-sheet rewards-state-panel">
                <span className="data-label">Record status</span>
                <span className="rewards-state-panel__message">
                  Rewards are not currently available.
                </span>
              </p>
            ) : (
              <div className="rewards-records__grid">
                {loyalty ? (
                  <section
                    aria-labelledby="loyalty-heading"
                    className="record-card rewards-program-card"
                  >
                    <div className="rewards-program-card__meta">
                      <BadgeCheck aria-hidden="true" className="size-5" />
                      <span>Active loyalty record</span>
                    </div>
                    <h2 id="loyalty-heading" className="rewards-program-card__title">
                      Earn points
                    </h2>
                    <p className="rewards-program-card__primary">
                      Earn {loyalty.pointsPerDollar} points per eligible dollar.
                    </p>
                    <p className="rewards-program-card__secondary">
                      Redemption begins at{" "}
                      {loyalty.minimumRedemptionPoints.toLocaleString("en-US")} points and
                      remains subject to the active policy at checkout.
                    </p>
                  </section>
                ) : null}
                {referral ? (
                  <section
                    aria-labelledby="referral-heading"
                    className="record-card rewards-program-card"
                  >
                    <div className="rewards-program-card__meta">
                      <Share2 aria-hidden="true" className="size-5" />
                      <span>Active referral record</span>
                    </div>
                    <h2 id="referral-heading" className="rewards-program-card__title">
                      Research referrals
                    </h2>
                    <p className="rewards-program-card__primary">
                      {referral.attributionDays}-day referral attribution window.
                    </p>
                    <p className="rewards-program-card__secondary">
                      Rewards apply only after the qualifying lifecycle events defined by the
                      current policy.
                    </p>
                  </section>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </PageTransition>
  );
}
