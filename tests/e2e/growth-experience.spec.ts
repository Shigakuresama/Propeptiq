import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type JSHandle,
  type Page,
} from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const origin = "http://127.0.0.1:4631";
const variantId = "55000000-0000-4000-8000-000000000001";
const referralCode = "ref_LocalRuntimeReferrer01";
const sharedSetCode = "set_LocalRuntimeResearch01";
const seededAffiliateProfileId = "6c000000-0000-4000-8000-000000000008";
const screenshotDirectory = path.resolve(
  process.cwd(),
  ".superpowers/sdd/2026-08-27-propeptiq-rewards-referrals/screenshots",
);

type CaretStyleObservation = Readonly<{
  caretMutationCount: number;
  caretStyleMutationDetected: boolean;
  observedControlCount: number;
  styleMutationCount: number;
  styleStateUnchanged: boolean;
}>;

type BrowserCaretStyleObserver = {
  initialStyles: Map<Element, string | null>;
  inspect: (records: readonly MutationRecord[]) => void;
  observer: MutationObserver;
  result: {
    caretMutationCount: number;
    caretStyleMutationDetected: boolean;
    observedControlCount: number;
    styleMutationCount: number;
  };
};

test.describe.configure({ mode: "serial" });

async function resetGrowth(
  request: APIRequestContext,
  scenario: "active" | "inactive" = "active",
) {
  const response = await request.post("/api/__local/growth/reset", {
    headers: { Origin: origin },
    data: { scenario },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

async function inspectGrowth(request: APIRequestContext) {
  const response = await request.get("/api/__local/growth/inspect", {
    headers: { Origin: origin },
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<Readonly<{
    revision: number;
    rewardReservationCount: number;
    rewardLedgerCount: number;
    referralCodeCount: number;
    affiliateProfileCount: number;
    payoutCount: number;
  }>>;
}

async function resetCommerce(request: APIRequestContext) {
  const response = await request.post("/api/__local/commerce/reset", {
    headers: { Origin: origin },
  });
  expect(response.status()).toBe(200);
}

async function signInAs(page: Page, actor: string) {
  await page.goto("/sign-in");
  await page.getByRole("radio", { name: actor }).check();
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await expect(page).toHaveURL(/\/checkout$/u);
}

async function seedCart(page: Page, quantity = 2) {
  await page.goto("/cart");
  await page.evaluate(({ id, count }) => {
    localStorage.setItem("propeptiq.cart.v2", JSON.stringify({
      version: 2,
      items: [{ variantId: id, quantity: count }],
    }));
    dispatchEvent(new StorageEvent("storage", { key: "propeptiq.cart.v2", storageArea: window.localStorage }));
  }, { id: variantId, count: quantity });
}

async function waitForFiniteAnimations(page: Page, selector: string) {
  await page.locator(selector).evaluateAll(async (elements) => {
    await Promise.all(elements.flatMap((element) => (
      element.getAnimations().map((animation) => animation.finished)
    )));
  });
}

async function inspectStaticRewardsScene(page: Page) {
  const scene = page.locator(".rewards-science-scene");
  const svg = scene.locator(".rewards-science-visual__svg");
  await expect(scene).toBeVisible();
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute("aria-hidden", "true");
  await expect(svg).toHaveAttribute("focusable", "false");
  await waitForFiniteAnimations(
    page,
    ".rewards-hero__copy, .rewards-science-scene, .rewards-records",
  );

  return scene.evaluate((element) => {
    const sceneBounds = element.getBoundingClientRect();
    const svgElement = element.querySelector(".rewards-science-visual__svg");
    if (!(svgElement instanceof SVGSVGElement)) {
      throw new Error("Expected the rewards science SVG");
    }
    const svgBounds = svgElement.getBoundingClientRect();
    const orbits = [...element.querySelectorAll<SVGGElement>(
      ".rewards-science-visual__orbit",
    )].map((orbit) => {
      const styles = getComputedStyle(orbit);
      const continuingAnimations = orbit.getAnimations().filter((animation) => {
        const effect = animation.effect;
        return effect instanceof AnimationEffect &&
          effect.getTiming().iterations === Infinity &&
          animation.playState === "running";
      });
      return {
        animationName: styles.animationName,
        className: orbit.getAttribute("class") ?? "",
        continuingAnimationCount: continuingAnimations.length,
        transform: styles.transform,
      };
    });

    return {
      contained: sceneBounds.left >= 0 &&
        sceneBounds.right <= document.documentElement.clientWidth + 1 &&
        svgBounds.left >= sceneBounds.left - 1 &&
        svgBounds.right <= sceneBounds.right + 1,
      interactiveCount: element.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ).length,
      meaningfulShapeCount: svgElement.querySelectorAll("path, ellipse, circle").length,
      orbits,
      svgViewBox: svgElement.getAttribute("viewBox"),
    };
  });
}

async function observeCaretStyleDuringScreenshot(
  page: Page,
  screenshot: () => Promise<unknown>,
): Promise<CaretStyleObservation> {
  const observation: JSHandle<BrowserCaretStyleObserver> = await page.evaluateHandle(() => {
    const controls = [...document.querySelectorAll("input, textarea")];
    const initialStyles = new Map(
      controls.map((control) => [control, control.getAttribute("style")]),
    );
    const result = {
      caretMutationCount: 0,
      caretStyleMutationDetected: false,
      observedControlCount: controls.length,
      styleMutationCount: 0,
    };
    const inspect = (records: readonly MutationRecord[]): void => {
      for (const record of records) {
        const target = record.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
          continue;
        }
        result.styleMutationCount += 1;
        const oldStyle = record.oldValue ?? "";
        const currentStyle = target.getAttribute("style") ?? "";
        if (/caret-color\s*:\s*transparent(?:\s*!important)?/iu.test(oldStyle) ||
          /caret-color\s*:\s*transparent(?:\s*!important)?/iu.test(currentStyle)) {
          result.caretMutationCount += 1;
          result.caretStyleMutationDetected = true;
        }
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, {
      attributeFilter: ["style"],
      attributeOldValue: true,
      attributes: true,
      subtree: true,
    });
    return { initialStyles, inspect, observer, result };
  });

  let result: CaretStyleObservation | undefined;
  try {
    await screenshot();
  } finally {
    result = await observation.evaluate((state) => {
      state.inspect(state.observer.takeRecords());
      state.observer.disconnect();
      return {
        ...state.result,
        styleStateUnchanged: [...state.initialStyles].every(
          ([control, initialStyle]) => control.getAttribute("style") === initialStyle,
        ),
      };
    });
    await observation.dispose();
  }
  if (result === undefined) throw new Error("Caret style observation did not complete");
  return result;
}

function checkoutBody() {
  return {
    items: [{ variantId, quantity: 2 }],
    destination: {
      recipientName: "Synthetic Growth Buyer",
      line1: "100 Test Way",
      line2: null,
      city: "Los Angeles",
      stateCode: "CA",
      postalCode: "90001",
      countryCode: "US",
    },
    rewardRedemptionPoints: 1_000,
  };
}

test.beforeAll(() => mkdirSync(screenshotDirectory, { recursive: true }));
test.beforeEach(async ({ request }) => {
  await resetGrowth(request, "active");
  await resetCommerce(request);
});

test("publishes the deterministic local rewards projection and can fail closed", async ({ page, request }) => {
  await resetGrowth(request, "active");
  await page.goto("/rewards");
  await expect(page.getByText("Synthetic local test only", { exact: true })).toBeVisible();
  await expect(page.getByText(/2 points per eligible dollar/i)).toBeVisible();

  await resetGrowth(request, "inactive");
  await page.reload();
  await expect(page.getByText("Rewards are not currently available.", { exact: true })).toBeVisible();

  await page.goto("/catalog");
  await expect(page.locator("article.catalog-listing-card")).toHaveCount(56);
  const browseText = await page.locator("main#main-content").innerText();
  expect(browseText).not.toMatch(/Earn\s+\d+\s+points/iu);
  expect(browseText).toContain("$41.99");
  await expect(page.getByRole("button", { name: /^add .+(?:: choose a variant| to (?:preview )?cart)$/iu })).toHaveCount(56);
  await expect(page.getByRole("link", { name: /checkout/iu })).toHaveCount(0);
});

test("binds a referral cookie and reserves authoritative points only once", async ({ page, request }) => {
  const landing = await page.goto(`/r/${referralCode}`);
  expect(landing?.status()).toBe(200);
  await expect(page).toHaveURL(/\/catalog$/u);
  const attributionCookie = (await page.context().cookies()).find(({ name }) => name === "propeptiq_attribution_v1");
  expect(attributionCookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });

  await seedCart(page);
  await signInAs(page, "Fixed growth owner");
  await expect(page.getByText("Synthetic local test only", { exact: true })).toBeVisible();

  const firstKey = "6d000000-0000-4000-8000-000000000001";
  const quote = await page.request.post("/api/checkout/quote", {
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": firstKey },
    data: checkoutBody(),
  });
  expect(quote.status()).toBe(200);
  const quoteBody = await quote.json();
  expect(quoteBody).toMatchObject({
    status: "quoted",
    pricingRevision: expect.stringMatching(/^[0-9a-f]{64}$/u),
    quote: {
      referralDiscountMinor: 480,
      rewardsBenefitAvailable: true,
      rewardRedemptionPoints: 1_000,
      rewardRedemptionMinor: 1_000,
    },
  });
  expect((await inspectGrowth(request)).rewardReservationCount).toBe(0);

  const sessionRequestBody = {
    ...checkoutBody(),
    pricingRevision: quoteBody.pricingRevision,
  };
  const session = await page.request.post("/api/checkout/sessions", {
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": firstKey },
    data: sessionRequestBody,
  });
  expect(session.status()).toBe(200);
  const sessionBody = await session.json();
  expect(sessionBody).toMatchObject({ status: "open", hostedUrl: expect.stringContaining("/__synthetic_local_checkout/") });
  const reserved = await inspectGrowth(request);
  expect(reserved).toMatchObject({ rewardReservationCount: 1, rewardLedgerCount: 3 });

  const replay = await page.request.post("/api/checkout/sessions", {
    headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": firstKey },
    data: sessionRequestBody,
  });
  expect(replay.status()).toBe(200);
  expect(await replay.json()).toEqual(sessionBody);
  expect(await inspectGrowth(request)).toEqual(reserved);

  await page.goto(sessionBody.hostedUrl);
  await page.getByRole("button", { name: "Return without payment event" }).click();
  await expect(page.getByRole("heading", { name: "Payment verification pending" })).toBeVisible();
  const successUrl = page.url();
  const beforeRefresh = await inspectGrowth(request);
  await page.reload();
  await expect(page).toHaveURL(successUrl);
  await expect(page.getByRole("heading", { name: "Payment verification pending" })).toBeVisible();
  expect(await inspectGrowth(request)).toEqual(beforeRefresh);

  await page.goto("/account/rewards");
  await expect(page.getByText("Refund reversal", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Minimum redemption progress" }))
    .toHaveAttribute("aria-valuemax", "500");
});

test("lets an active owner create one code and one pending partner application", async ({ page, request }) => {
  await signInAs(page, "Fixed growth owner");

  await page.goto("/account/rewards");
  await expect(page.getByRole("heading", { name: "Rewards", level: 1 })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: /minimum redemption progress/i })).toBeVisible();
  await expect(page.getByText("2500", { exact: true }).first()).toBeVisible();

  await page.goto("/account/referrals");
  const referralForm = page.getByRole("form", { name: "Activate referral code" });
  await referralForm.getByRole("checkbox").check();
  await referralForm.getByRole("button", { name: "Activate referral code" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Referral code activated" }),
  ).toContainText("Referral code activated");
  await expect(page.getByText(/\/r\/ref_LocalOwner/u)).toBeVisible();
  expect((await inspectGrowth(request)).referralCodeCount).toBe(2);

  await page.goto("/account/partner");
  const partnerForm = page.getByRole("form", { name: "Apply for partner program" });
  await partnerForm.getByLabel("Public channel URL or handle").fill("@growth-owner-lab");
  await partnerForm.getByLabel("Promotion method").selectOption("website");
  await partnerForm.getByRole("checkbox").check();
  await partnerForm.getByRole("button", { name: "Submit partner application" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Partner application submitted" }),
  ).toContainText("Partner application submitted");
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  expect((await inspectGrowth(request)).affiliateProfileCount).toBe(2);
});

test("keeps blocked owner growth reads while withholding every growth mutation", async ({ page }) => {
  await signInAs(page, "Fixed blocked customer");
  await page.goto("/account/rewards");
  await expect(page.getByText(/blocked account remains able to read/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rewards", level: 1 })).toBeVisible();
  await page.goto("/account/referrals");
  await expect(page.getByText(/Referral activation is unavailable while this account is blocked/i)).toBeVisible();
  await expect(page.getByRole("form", { name: "Activate referral code" })).toHaveCount(0);
  await page.goto("/account/partner");
  await expect(page.getByRole("form", { name: "Apply for partner program" })).toHaveCount(0);
});

test("keeps each signed owner confined to their own private growth history", async ({ page }) => {
  await signInAs(page, "Fixed referred buyer");
  await page.goto("/account/rewards");
  await expect(page.getByText("900", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("No reward ledger entries exist for this account.", { exact: true }))
    .toBeVisible();
  await expect(page.getByText("Refund reversal", { exact: true })).toHaveCount(0);
});

test("projects a privacy-safe product-only shared set without inventing variant cart identity", async ({ page }) => {
  await page.goto(`/sets/${sharedSetCode}`);
  await expect(page.getByText("Synthetic local test only", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Synthetic analytical reference set" })).toBeVisible();
  await expect(page.getByText(/One saved product is no longer available/i)).toBeVisible();
  const html = await page.locator("main").innerText();
  expect(html).not.toContain("fixed-growth-owner@local.test");
  expect(html).not.toContain("50000000-0000-4000-8000-000000000007");
  expect(html).not.toMatch(/commission|payout|available points/i);
  const cartBefore = await page.evaluate(() => localStorage.getItem("propeptiq.cart.v2"));
  await expect(page.getByRole("button", { name: "Variant selection unavailable" })).toBeDisabled();
  await expect(page.getByRole("status").filter({
    hasText: "Select exact variants before adding a research set",
  })).toContainText(
    "Select exact variants before adding a research set",
  );
  expect(await page.evaluate(() => localStorage.getItem("propeptiq.cart.v2")))
    .toBe(cartBefore);
});

test("supports one-MFA-admin policy, affiliate, payout, and redacted-audit lifecycles", async ({ page, request }) => {
  await signInAs(page, "Fixed capable administrator");

  await page.goto("/admin/loyalty-policies");
  const draftForm = page.getByRole("form", { name: "Create loyalty policy draft" });
  await expect(draftForm.getByLabel("Effective time (UTC)")).toHaveValue("2026-08-27T12:00");
  await expect(draftForm.getByLabel("Points earned per dollar")).toHaveValue("2");
  await expect(draftForm.getByLabel("Redemption minor units per point")).toHaveValue("1");
  await expect(draftForm.getByLabel("Minimum redemption points")).toHaveValue("500");
  await expect(draftForm.getByLabel("Maximum redemption basis points")).toHaveValue("2500");
  await draftForm.getByRole("button", { name: "Submit guarded command" }).click();
  await expect(page).toHaveURL(/\/admin\/loyalty-policies\?result=saved$/u);
  const activateForm = page.getByRole("form", { name: /Activate loyalty policy draft/u });
  await activateForm.getByRole("button", { name: "Submit guarded command" }).click();
  await expect(page).toHaveURL(/\/admin\/loyalty-policies\?result=saved$/u);
  await expect(page.getByText("Retired", { exact: true }).first()).toBeVisible();

  await page.goto("/admin/affiliate-applications");
  const approve = page.getByRole("form", { name: /Approve affiliate application/u });
  await approve.getByRole("button", { name: "Approve application" }).click();
  await expect(page).toHaveURL(/\/admin\/affiliate-applications\?result=saved$/u);
  await expect(page.getByRole("form", { name: /Suspend affiliate/u })).toBeVisible();

  await page.goto("/admin/payouts");
  const createPayout = page.getByRole("form", { name: "Create affiliate payout batch" });
  await createPayout.getByLabel("Affiliate profile ID").fill(seededAffiliateProfileId);
  await createPayout.getByRole("button", { name: "Create payout batch record" }).click();
  await expect(page).toHaveURL(/\/admin\/payouts\?result=saved$/u);
  await expect(page.getByText(/does not transmit funds/i)).toBeVisible();
  const paidForm = page.getByRole("form", { name: /Record payout paid/u });
  await paidForm.getByLabel("Provider name").fill("Synthetic external settlement record");
  await paidForm.getByLabel("External reference").fill("private-evidence-must-not-render");
  await paidForm.getByRole("button", { name: "Record external payment evidence" }).click();
  await expect(page).toHaveURL(/\/admin\/payouts\?result=saved$/u);
  await expect(page.getByText("private-evidence-must-not-render")).toHaveCount(0);
  expect((await inspectGrowth(request)).payoutCount).toBe(1);

  await page.goto("/admin/affiliate-applications");
  const suspend = page.getByRole("form", { name: /Suspend affiliate/u });
  await suspend.getByRole("button", { name: "Suspend affiliate" }).click();
  await expect(page).toHaveURL(/\/admin\/affiliate-applications\?result=saved$/u);
  await expect(page.getByText("suspended", { exact: true }).first()).toBeVisible();

  await page.goto("/admin/audit");
  const auditText = await page.getByRole("list", { name: "Redacted audit history" }).innerText();
  expect(auditText).toContain("growth.policy.activated");
  expect(auditText).toContain("growth.affiliate_payout.paid");
  expect(auditText).not.toContain("private-evidence-must-not-render");
});

test("fails closed on stale policy versions and browser-supplied resource authority", async ({ page }) => {
  await signInAs(page, "Fixed capable administrator");
  await page.goto("/admin/loyalty-policies");
  const draftForm = page.getByRole("form", { name: "Create loyalty policy draft" });
  await draftForm.getByRole("button", { name: "Submit guarded command" }).click();
  await expect(page).toHaveURL(/\/admin\/loyalty-policies\?result=saved$/u);

  const staleActivation = page.getByRole("form", { name: /Activate loyalty policy draft/u });
  await staleActivation.locator('input[name="expectedVersion"]').evaluate((input) => {
    if (!(input instanceof HTMLInputElement)) throw new Error("Expected a version input");
    input.value = "999";
  });
  await staleActivation.getByRole("button", { name: "Submit guarded command" }).click();
  await expect(page).toHaveURL(/\/admin\/loyalty-policies\?result=stale$/u);
  await expect(page.getByText("Command not completed", { exact: true })).toBeVisible();

  const wrongResourceDraft = page.getByRole("form", { name: "Create loyalty policy draft" });
  await wrongResourceDraft.evaluate((form) => {
    const resource = document.createElement("input");
    resource.type = "hidden";
    resource.name = "resource";
    resource.value = "payouts";
    form.append(resource);
  });
  await wrongResourceDraft.getByRole("button", { name: "Submit guarded command" }).click();
  await expect(page).toHaveURL(/\/admin\/loyalty-policies\?result=denied$/u);
  await expect(page.getByText("Command not completed", { exact: true })).toBeVisible();
});

test("supports a separate rejected affiliate state without exposing a payout action", async ({ page }) => {
  await signInAs(page, "Fixed capable administrator");
  await page.goto("/admin/affiliate-applications");
  const reject = page.getByRole("form", { name: /Reject affiliate application/u });
  await reject.getByRole("button", { name: "Reject application" }).click();
  await expect(page).toHaveURL(/\/admin\/affiliate-applications\?result=saved$/u);
  await expect(page.getByText("rejected", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("form", { name: /Suspend affiliate/u })).toHaveCount(0);
});

test("denies growth administration without capability or current-session MFA", async ({ page }) => {
  await signInAs(page, "Fixed non-administrator");
  await page.goto("/admin/loyalty-policies");
  await expect(page.getByRole("heading", { name: "Required capability is not granted" })).toBeVisible();

  await signInAs(page, "Fixed administrator without MFA");
  await page.goto("/admin/affiliate-applications");
  await expect(page.getByRole("heading", { name: "Multi-factor authentication is not configured" })).toBeVisible();

  await signInAs(page, "Fixed limited administrator");
  await page.goto("/admin/payouts");
  await expect(page.getByRole("heading", { name: "Required capability is not granted" })).toBeVisible();
});

test("keeps rewards orbits static and the teal logo accent finite", async ({
  baseURL,
  browser,
  page,
}) => {
  if (baseURL === undefined) throw new Error("Playwright baseURL is required.");

  const expectStaticScene = (evidence: Awaited<ReturnType<typeof inspectStaticRewardsScene>>) => {
    expect(evidence.contained).toBe(true);
    expect(evidence.interactiveCount).toBe(0);
    expect(evidence.meaningfulShapeCount).toBeGreaterThanOrEqual(10);
    expect(evidence.svgViewBox).toBe("0 0 620 500");
    expect(evidence.orbits.map(({ className }) => className)).toEqual([
      "rewards-science-visual__orbit rewards-science-visual__orbit--outer",
      "rewards-science-visual__orbit rewards-science-visual__orbit--inner",
    ]);
    expect(evidence.orbits.every(({ animationName, continuingAnimationCount, transform }) => (
      animationName === "none" && continuingAnimationCount === 0 && transform === "none"
    ))).toBe(true);
  };

  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/rewards");
    await expect(page.locator(".header-brand-motion")).toHaveAttribute(
      "data-motion-state",
      "running",
    );
    expectStaticScene(await inspectStaticRewardsScene(page));
    const continuingPublicAnimations = await page.evaluate(() => (
      document.getAnimations()
        .filter((animation) => {
          const effect = animation.effect;
          return effect instanceof AnimationEffect &&
            effect.getTiming().iterations === Infinity &&
            animation.playState === "running";
        })
        .map((animation) => {
          const effect = animation.effect;
          const target = effect instanceof KeyframeEffect ? effect.target : null;
          return {
            animationName: animation instanceof CSSAnimation ? animation.animationName : "",
            isHeaderBrandField: target instanceof Element &&
              target.matches(".header-brand-motion__field"),
          };
        })
    ));
    expect(continuingPublicAnimations).toEqual([]);
    await expect(page.locator(".header-brand-motion__field")).toHaveCSS("animation-iteration-count", "2");
    await expect(page.locator(".header-brand-motion__field")).toHaveCSS("color", "rgb(20, 125, 120)");
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/rewards");
    expectStaticScene(await inspectStaticRewardsScene(page));
    await expect(page.locator(".header-brand-motion__field")).toHaveCSS(
      "animation-name",
      "none",
    );
  }

  const noJavaScript = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    reducedMotion: "reduce",
    viewport: { width: 375, height: 1000 },
  });
  const noJavaScriptPage = await noJavaScript.newPage();
  try {
    for (const width of [375, 1440]) {
      await noJavaScriptPage.setViewportSize({ width, height: 1000 });
      await noJavaScriptPage.goto("/rewards");
      expectStaticScene(await inspectStaticRewardsScene(noJavaScriptPage));
      await expect(noJavaScriptPage.locator(".header-brand-motion__field")).toHaveCSS(
        "animation-name",
        "none",
      );
    }
  } finally {
    await noJavaScript.close();
  }
});

test("keeps growth routes responsive, keyboard-visible, reduced-motion-safe, and free of serious a11y issues", async ({ page }) => {
  const publicRoutes = ["/", "/catalog", "/rewards", "/partners", `/sets/${sharedSetCode}`];
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of publicRoutes) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${route} at ${width}`).toBeLessThanOrEqual(1);
      await expect(page.locator("main#main-content")).toHaveCount(1);
      await expect(page.locator("p.text-base").first()).toHaveCSS("font-size", "16px");
    }
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/rewards");
  expect(await page.locator([
    ".rewards-page .data-label",
    ".rewards-action",
    ".rewards-science-scene__header",
    ".rewards-science-scene__records li",
    ".rewards-program-card__meta",
  ].join(", ")).evaluateAll((elements) => elements.every((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize) >= 16
  ))).toBe(true);
  expect(await page.locator([
    ".rewards-hero__copy",
    ".rewards-science-scene",
    ".rewards-records",
    ".rewards-science-visual__orbit",
  ].join(", ")).evaluateAll((elements) => elements.every((element) => {
    const styles = getComputedStyle(element);
    return styles.animationName === "none" && styles.transform === "none";
  }))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  expect(await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    const styles = getComputedStyle(active);
    return styles.outlineStyle !== "none" || styles.boxShadow !== "none";
  })).toBe(true);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.locator("header a:visible, header button:visible").evaluateAll((targets) => targets.every((target) => {
    const box = target.getBoundingClientRect();
    return box.width >= 44 && box.height >= 44;
  }))).toBe(true);

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/rewards");
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.locator([
    "#rewards-heading",
    ".rewards-hero__actions",
    ".rewards-science-scene",
    ".rewards-records",
  ].join(", ")).evaluateAll((elements) => elements.every((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= window.innerWidth + 1;
  }))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await signInAs(page, "Fixed growth owner");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/account/rewards");
  await expect(page.getByRole("list", { name: "Reward ledger" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Minimum redemption progress" }))
    .toHaveAttribute("aria-valuetext", "500 of 500 points toward the minimum redemption");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/account/rewards");
  // Playwright does not expose literal browser zoom. This is the explicitly
  // labeled 200% CSS layout proxy required by the responsive handoff.
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator("main#main-content")).toBeVisible();
});

test("captures the required growth surfaces at narrow and desktop widths", async ({ page }) => {
  const pageErrors: string[] = [];
  const hydrationErrors: string[] = [];
  const otherConsoleDiagnostics: string[] = [];
  const screenshotObservations: Array<Readonly<{
    captureName: string;
    observation: CaretStyleObservation;
  }>> = [];
  let screenshotCaptureCount = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (!["error", "warning"].includes(message.type())) return;
    const diagnostic = `${message.type()}: ${message.text()}`;
    if (
      message.type() === "error" &&
      /hydration|hydrated|server rendered html.*didn.t match/iu.test(message.text())
    ) {
      hydrationErrors.push(diagnostic);
      return;
    }
    otherConsoleDiagnostics.push(diagnostic);
  });

  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, route] of [
      ["home", "/"],
      ["catalog", "/catalog"],
      ["rewards", "/rewards"],
      ["shared-set", `/sets/${sharedSetCode}`],
      ["cart", "/cart"],
    ] as const) {
      await page.goto(route);
      const captureName = `${name}-${width}`;
      const observation = await observeCaretStyleDuringScreenshot(page, () => (
        page.screenshot({
          path: path.join(screenshotDirectory, `${captureName}.png`),
          fullPage: true,
          caret: "initial",
        })
      ));
      screenshotObservations.push({ captureName, observation });
      screenshotCaptureCount += 1;
    }

    await page.goto("/");
    const headerLogo = page.locator("header img").first();
    await expect(headerLogo).toHaveCSS("object-fit", "contain");
    expect(await headerLogo.evaluate((image) => {
      const wrapper = image.parentElement;
      if (!wrapper) return false;
      const styles = getComputedStyle(wrapper);
      return styles.borderRadius === "0px" && styles.backgroundColor === "rgba(0, 0, 0, 0)";
    })).toBe(true);

    await signInAs(page, "Fixed growth owner");
    for (const [name, route] of [
      ["referrals", "/account/referrals"],
      ["partner", "/account/partner"],
    ] as const) {
      await page.goto(route);
      const captureName = `${name}-${width}`;
      const observation = await observeCaretStyleDuringScreenshot(page, () => (
        page.screenshot({
          path: path.join(screenshotDirectory, `${captureName}.png`),
          fullPage: true,
          caret: "initial",
        })
      ));
      screenshotObservations.push({ captureName, observation });
      screenshotCaptureCount += 1;
    }

    await signInAs(page, "Fixed capable administrator");
    await page.goto("/admin/loyalty-policies");
    const captureName = `admin-loyalty-policy-${width}`;
    const observation = await observeCaretStyleDuringScreenshot(page, () => (
      page.screenshot({
        path: path.join(screenshotDirectory, `${captureName}.png`),
        fullPage: true,
        caret: "initial",
      })
    ));
    screenshotObservations.push({ captureName, observation });
    screenshotCaptureCount += 1;
  }

  const adminObservations = screenshotObservations.filter(({ captureName }) => (
    captureName.startsWith("admin-loyalty-policy-")
  ));
  expect(screenshotCaptureCount).toBe(16);
  expect(screenshotObservations).toHaveLength(16);
  expect(adminObservations).toHaveLength(2);
  expect(adminObservations.every(({ observation }) => observation.observedControlCount > 0))
    .toBe(true);
  expect(adminObservations.filter(({ observation }) => observation.caretStyleMutationDetected))
    .toEqual([]);
  expect(screenshotObservations.filter(({ observation }) => !observation.styleStateUnchanged))
    .toEqual([]);
  expect(screenshotObservations.filter(({ observation }) => observation.caretMutationCount > 0))
    .toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(hydrationErrors).toEqual([]);
  console.info(
    `Growth screenshot diagnostics (${otherConsoleDiagnostics.length}): ${JSON.stringify(otherConsoleDiagnostics)}`,
  );
  console.info(`Growth screenshot captures: ${screenshotCaptureCount}`);
});
