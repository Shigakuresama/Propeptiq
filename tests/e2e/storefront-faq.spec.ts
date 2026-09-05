import { expect, test, type Page } from "@playwright/test";

async function expectFaqLanding(page: Page) {
  await expect(page).toHaveURL(/\/#faq$/u);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const heading = page.getByRole("heading", { name: "Frequently Asked Questions", exact: true });
  await expect(heading).toBeVisible();
  await expect(heading).toBeInViewport({ ratio: 1 });
  await expect.poll(async () => page.evaluate(async () => {
    const heading = document.getElementById("faq-heading")!;
    const header = document.querySelector("header")!;
    const first = heading.getBoundingClientRect();
    const initialScroll = window.scrollY;
    for (let frame = 0; frame < 6; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    const settled = heading.getBoundingClientRect();
    return Math.abs(window.scrollY - initialScroll) <= 1 &&
      Math.abs(settled.top - first.top) <= 1 &&
      settled.top >= header.getBoundingClientRect().bottom &&
      settled.bottom <= window.innerHeight;
  })).toBe(true);
}

async function followFooterFaqWithKeyboard(page: Page, route: "/" | "/catalog/items/tirzepatide") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const viewport of [{ width: 375, height: 900 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto(route);
    const footerFaq = page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "FAQ", exact: true });
    await expect(footerFaq).toHaveAttribute("href", "/#faq");
    await footerFaq.scrollIntoViewIfNeeded();
    await page.keyboard.press("Tab");
    await footerFaq.focus();
    await expect(footerFaq).toBeFocused();
    const target = await footerFaq.evaluate((link) => {
      const rect = link.getBoundingClientRect();
      return {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        focusVisible: link.matches(":focus-visible"),
        hitTarget: link.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
      };
    });
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
    expect(target.focusVisible).toBe(true);
    expect(target.hitTarget).toBe(true);
    const search = await page.getByRole("button", { name: "Search PropeptIQ", exact: true }).boundingBox();
    expect(search).not.toBeNull();
    expect(target.x + target.width <= search!.x || search!.x + search!.width <= target.x ||
      target.y + target.height <= search!.y || search!.y + search!.height <= target.y).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    await page.keyboard.press("Enter");
    await expectFaqLanding(page);
    const first = page.locator("#faq details").first();
    await first.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("open", "");
    await expect(first.locator("p")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
}

test("homepage footer FAQ link supports keyboard navigation at phone, tablet, and desktop widths", async ({ page }) => {
  await followFooterFaqWithKeyboard(page, "/");
});

test("product footer FAQ link reaches the homepage section by keyboard at phone, tablet, and desktop widths", async ({ page }) => {
  await followFooterFaqWithKeyboard(page, "/catalog/items/tirzepatide");
});

test("footer FAQ keyboard activation returns to the section repeatedly when the URL already has its fragment", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const viewport of [{ width: 375, height: 900 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/#faq");
    await expectFaqLanding(page);
    for (let activation = 0; activation < 2; activation += 1) {
      const footer = page.getByRole("navigation", { name: "Footer" });
      const tracking = footer.getByRole("link", { name: "Order tracking", exact: true });
      const faq = footer.getByRole("link", { name: "FAQ", exact: true });
      await tracking.scrollIntoViewIfNeeded();
      await tracking.focus();
      await page.keyboard.press("Tab");
      await expect(faq).toBeFocused();
      await expect(faq).toBeInViewport({ ratio: 1 });
      await expect(page).toHaveURL(/\/#faq$/u);
      await expect(page.getByRole("heading", { name: "Frequently Asked Questions", exact: true }))
        .not.toBeInViewport();
      await page.keyboard.press("Enter");
      await expectFaqLanding(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(1);
    }
  }
  expect(errors).toEqual([]);
});

test("homepage FAQ keeps one answer open and structured data matches its visible copy", async ({ page }) => {
  await page.goto("/");
  const entries = page.locator("#faq details");
  await expect(entries).toHaveCount(8);
  const first = entries.nth(0).locator("summary");
  const second = entries.nth(1).locator("summary");
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(entries.nth(0)).toHaveAttribute("open", "");
  await second.focus();
  await page.keyboard.press("Space");
  await expect(second).toBeFocused();
  await expect(entries.nth(1)).toHaveAttribute("open", "");
  await expect(entries.nth(0)).not.toHaveAttribute("open");
  await expect(page.locator("#faq details[open]")).toHaveCount(1);

  const visible = await entries.evaluateAll((nodes) => nodes.map((entry) => ({
    name: entry.querySelector("summary > span")!.textContent,
    text: entry.querySelector("p")!.textContent,
  })));
  const structured = await page.locator('script[type="application/ld+json"]').evaluateAll((nodes) =>
    nodes.map((node) => JSON.parse(node.textContent!)).filter((value) => value["@type"] === "FAQPage"),
  );
  expect(structured).toHaveLength(1);
  expect(structured[0].mainEntity.map((entry: { name: string; acceptedAnswer: { text: string } }) => ({
    name: entry.name, text: entry.acceptedAnswer.text,
  }))).toEqual(visible);
});

test("product footer reaches the homepage FAQ and native disclosure works without JavaScript", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("The storefront browser base URL must be configured.");
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  try {
    const page = await context.newPage();
    await page.goto("/catalog/items/tirzepatide");
    const footerFaq = page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: "FAQ", exact: true });
    await expect(footerFaq).toHaveAttribute("href", "/#faq");
    await footerFaq.click();
    await expect(page).toHaveURL(/\/#faq$/u);
    await expect(page.getByRole("heading", { name: "Frequently Asked Questions", exact: true })).toBeInViewport({ ratio: 1 });
    const entries = page.locator("#faq details");
    await expect(entries).toHaveCount(8);
    await entries.nth(0).locator("summary").click();
    await expect(entries.nth(0).locator("p")).toBeVisible();
    await entries.nth(1).locator("summary").click();
    await expect(entries.nth(1).locator("p")).toBeVisible();
    await expect(entries.nth(0)).not.toHaveAttribute("open");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  } finally {
    await context.close();
  }
});
