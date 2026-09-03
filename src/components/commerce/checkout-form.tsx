"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useCart } from "@/cart/cart-provider";
import {
  loadPreviewPresentation,
  parsePreviewPresentation,
  savePreviewPresentation,
} from "@/cart/preview-presentation";
import { canContinueFromPreview, type CartPreview } from "@/cart/preview-types";
import { isCanonicalUuid } from "@/commerce/checkout-identity";
import { Button } from "@/components/ui/button";

type PromotionOption = Readonly<{ id: string; name: string }>;
type DestinationField = "recipientName" | "line1" | "city" | "stateCode" | "postalCode";
type Errors = Partial<Record<DestinationField | "items" | "rewardRedemptionPoints", string>>;

type SafeQuote = Readonly<{
  status: "ready" | "review_required";
  reviewRequired: boolean;
  reasons: readonly string[];
  currency: "USD";
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  promotionDiscountMinor: number;
  referralDiscountMinor: number;
  rewardRedemptionPoints: number;
  rewardRedemptionMinor: number;
  pendingBaseEarnPoints: number;
  rewardsBenefitAvailable: boolean;
  rewardsUnavailableReason: string | null;
  lines: readonly Readonly<{
    variantId: string;
    sku: string;
    variantLabel: string;
    productName: string;
    packageForm?: string;
    quantity: number;
    unitAmountMinor: number;
    subtotalMinor: number;
    discountMinor: number;
    totalMinor: number;
  }>[];
}>;

type QuoteView = Readonly<{
  fingerprint: string;
  body: string;
  pricingRevision: string;
  quote: SafeQuote;
}>;

const stateCodes = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ");

const initialDestination = {
  recipientName: "",
  line1: "",
  line2: "",
  city: "",
  stateCode: "",
  postalCode: "",
};

function money(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountMinor / 100);
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every((key) => typeof key === "string" && keys.includes(key));
}

function recordWithRequiredAndAllowedKeys(
  value: unknown,
  requiredKeys: readonly string[],
  allowedKeys: ReadonlySet<string>,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    Reflect.ownKeys(value).every((key) => typeof key === "string" && allowedKeys.has(key));
}

function safeMoney(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function boundedText(value: unknown, maximum = 240): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 &&
    value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value);
}

function parseSafeQuote(value: unknown): SafeQuote | null {
  const baseKeys = [
    "status", "reviewRequired", "reasons", "currency", "subtotalMinor", "discountMinor",
    "shippingMinor", "taxMinor", "totalMinor", "lines",
  ] as const;
  const acquisitionKeys = ["promotionDiscountMinor", "referralDiscountMinor"] as const;
  const rewardKeys = [
    "rewardRedemptionPoints", "rewardRedemptionMinor", "pendingBaseEarnPoints",
    "rewardsBenefitAvailable", "rewardsUnavailableReason",
  ] as const;
  const allowedKeys = new Set<string>([...baseKeys, ...acquisitionKeys, ...rewardKeys]);
  if (!recordWithRequiredAndAllowedKeys(value, baseKeys, allowedKeys)) {
    return null;
  }
  const hasAcquisition = acquisitionKeys.map((key) => Object.hasOwn(value, key));
  const hasRewards = rewardKeys.map((key) => Object.hasOwn(value, key));
  if (!hasAcquisition.every(Boolean) || !hasRewards.every(Boolean)) return null;
  if (
    (value.status !== "ready" && value.status !== "review_required") ||
    typeof value.reviewRequired !== "boolean" ||
    value.reviewRequired !== (value.status === "review_required") ||
    value.currency !== "USD" ||
    !safeMoney(value.subtotalMinor) ||
    !safeMoney(value.discountMinor) ||
    !safeMoney(value.shippingMinor) ||
    !safeMoney(value.taxMinor) ||
    !safeMoney(value.totalMinor) ||
    value.discountMinor > value.subtotalMinor ||
    value.totalMinor !== value.subtotalMinor - value.discountMinor + value.shippingMinor + value.taxMinor ||
    !Array.isArray(value.reasons) || value.reasons.length > 12 ||
    value.reasons.some((reason) => !boundedText(reason, 80)) ||
    (value.status === "ready" ? value.reasons.length !== 0 : value.reasons.length < 1) ||
    !Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 50
  ) return null;
  if (!safeMoney(value.promotionDiscountMinor) || !safeMoney(value.referralDiscountMinor)) {
    return null;
  }
  if (!safeMoney(value.rewardRedemptionPoints) ||
    !safeMoney(value.rewardRedemptionMinor) ||
    !safeMoney(value.pendingBaseEarnPoints) ||
    typeof value.rewardsBenefitAvailable !== "boolean" ||
    (value.rewardsUnavailableReason !== null && !boundedText(value.rewardsUnavailableReason, 80))) {
    return null;
  }
  if ((value.promotionDiscountMinor as number) +
    (value.referralDiscountMinor as number) +
    (value.rewardRedemptionMinor as number) !== value.discountMinor) {
    return null;
  }
  const lines: Array<SafeQuote["lines"][number]> = [];
  const variantIds = new Set<string>();
  let lineSubtotal = 0;
  let lineDiscount = 0;
  for (const line of value.lines) {
    if (!recordWithRequiredAndAllowedKeys(line, [
      "variantId", "sku", "variantLabel", "productName", "quantity", "unitAmountMinor",
      "subtotalMinor", "discountMinor", "totalMinor",
    ], new Set([
      "variantId", "sku", "variantLabel", "productName", "packageForm", "quantity",
      "unitAmountMinor", "subtotalMinor", "discountMinor", "totalMinor",
    ])) || !isCanonicalUuid(line.variantId) || variantIds.has(line.variantId) ||
      !boundedText(line.sku, 120) || !boundedText(line.variantLabel) ||
      !boundedText(line.productName) ||
      (Object.hasOwn(line, "packageForm") && !boundedText(line.packageForm)) ||
      !Number.isSafeInteger(line.quantity) || (line.quantity as number) < 1 || (line.quantity as number) > 25 ||
      !safeMoney(line.unitAmountMinor) || !safeMoney(line.subtotalMinor) ||
      !safeMoney(line.discountMinor) || !safeMoney(line.totalMinor) ||
      line.subtotalMinor !== line.unitAmountMinor * (line.quantity as number) ||
      line.discountMinor > line.subtotalMinor ||
      line.totalMinor !== line.subtotalMinor - line.discountMinor
    ) return null;
    variantIds.add(line.variantId);
    lineSubtotal += line.subtotalMinor;
    lineDiscount += line.discountMinor;
    lines.push({
      variantId: line.variantId,
      sku: line.sku,
      variantLabel: line.variantLabel,
      productName: line.productName,
      ...(Object.hasOwn(line, "packageForm")
        ? { packageForm: line.packageForm as string }
        : {}),
      quantity: line.quantity as number,
      unitAmountMinor: line.unitAmountMinor,
      subtotalMinor: line.subtotalMinor,
      discountMinor: line.discountMinor,
      totalMinor: line.totalMinor,
    });
  }
  if (lineSubtotal !== value.subtotalMinor || lineDiscount !== value.discountMinor) return null;
  return {
    status: value.status,
    reviewRequired: value.reviewRequired,
    reasons: value.reasons as string[],
    currency: "USD",
    subtotalMinor: value.subtotalMinor,
    discountMinor: value.discountMinor,
    shippingMinor: value.shippingMinor,
    taxMinor: value.taxMinor,
    totalMinor: value.totalMinor,
    promotionDiscountMinor: value.promotionDiscountMinor,
    referralDiscountMinor: value.referralDiscountMinor,
    rewardRedemptionPoints: value.rewardRedemptionPoints,
    rewardRedemptionMinor: value.rewardRedemptionMinor,
    pendingBaseEarnPoints: value.pendingBaseEarnPoints,
    rewardsBenefitAvailable: value.rewardsBenefitAvailable,
    rewardsUnavailableReason: value.rewardsUnavailableReason,
    lines,
  };
}

function safeHostedUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000 || !URL.canParse(value)) return false;
  const url = new URL(value);
  return !url.username && !url.password && !url.hash &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase())));
}

function safeIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function safePricingRevision(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function safeNullableMoney(value: unknown): value is number | null {
  return value === null || safeMoney(value);
}

function safeCartCurrency(value: unknown): value is string | null {
  return value === null ||
    (typeof value === "string" && /^[A-Z]{3}$/u.test(value));
}

function isSafePriceChangedCart(value: unknown): boolean {
  if (!exactRecord(value, [
    "items", "subtotalMinor", "currency", "taxMinor", "shippingMinor",
    "finalDiscountMinor",
  ]) || !Array.isArray(value.items) || value.items.length < 1 ||
    value.items.length > 50 || !safeMoney(value.subtotalMinor) ||
    !safeCartCurrency(value.currency) || value.taxMinor !== null ||
    value.shippingMinor !== null || value.finalDiscountMinor !== null) {
    return false;
  }

  const seen = new Set<string>();
  let subtotalMinor = 0;
  const currencies = new Set<string>();
  for (let index = 0; index < value.items.length; index += 1) {
    if (!Object.hasOwn(value.items, index)) return false;
    const line = value.items[index];
    if (!exactRecord(line, [
      "variantId", "quantity", "available", "name", "packageForm",
      "variantLabel", "sku", "unitAmountMinor", "lineSubtotalMinor",
      "currency",
    ]) || !isCanonicalUuid(line.variantId) || seen.has(line.variantId) ||
      !Number.isSafeInteger(line.quantity) || (line.quantity as number) < 1 ||
      (line.quantity as number) > 25 || typeof line.available !== "boolean" ||
      (line.name !== null && !boundedText(line.name)) ||
      (line.packageForm !== null && !boundedText(line.packageForm)) ||
      (line.variantLabel !== null && !boundedText(line.variantLabel)) ||
      (line.sku !== null && !boundedText(line.sku, 120)) ||
      !safeNullableMoney(line.unitAmountMinor) ||
      !safeNullableMoney(line.lineSubtotalMinor) ||
      !safeCartCurrency(line.currency) ||
      (line.unitAmountMinor !== null && line.lineSubtotalMinor !== null &&
        line.lineSubtotalMinor !==
          line.unitAmountMinor * (line.quantity as number))) {
      return false;
    }
    const nextSubtotal = subtotalMinor + (line.lineSubtotalMinor ?? 0);
    if (!Number.isSafeInteger(nextSubtotal)) return false;
    subtotalMinor = nextSubtotal;
    if (line.currency !== null) currencies.add(line.currency);
    seen.add(line.variantId);
  }
  const coherentCurrency = currencies.size === 1 ? [...currencies][0]! : null;
  return subtotalMinor === value.subtotalMinor && value.currency === coherentCurrency;
}

function responseMessage(status: unknown, component?: unknown): string {
  if (status === "rate_limited") return "Too many checkout requests. Wait briefly, then retry with the same unchanged request.";
  if (status === "review_required") return "Manual review is required before a hosted payment session can open.";
  if (status === "denied") return "Checkout is not permitted for the current authoritative facts.";
  if (status === "invalid_request") return "The checkout request is invalid. Review the destination and cart, then try again.";
  if (status === "PRICE_CHANGED") return "The authoritative price changed. Review and calculate the current total again before continuing.";
  if (status === "CHECKOUT_UNAVAILABLE") return "One or more variants cannot be checked out with the current authoritative facts.";
  if (status === "quote_unavailable" && component === "shipping") return "Shipping facts are temporarily unavailable. No total or paid state is being claimed.";
  if (status === "quote_unavailable" && component === "tax") return "Tax facts are temporarily unavailable. No total or paid state is being claimed.";
  if (status === "facts_changed_retry") return "Checkout facts changed. Calculate a new authoritative total before retrying.";
  if (status === "idempotency_conflict" || status === "conflict") return "This request reference no longer matches. Edit or recalculate the request.";
  if (status === "provider_unknown" || status === "provider_pending") return "The hosted-payment result is not known yet. No paid state is being claimed.";
  if (status === "expired" || status === "failed") return "The hosted-payment attempt is closed. Recalculate current facts before trying again.";
  return "Checkout is temporarily unavailable. Your browser-saved cart has not been cleared.";
}

function rewardsUnavailableCopy(reason: string | null): string | null {
  if (reason === null || reason === "not_requested") return null;
  if (reason === "below_minimum") return "More points are required for redemption.";
  if (reason === "redemption_cap_exceeded") return "The requested redemption exceeds the current checkout limit.";
  if (reason === "insufficient_balance") return "The requested points are not currently available.";
  if (reason === "negative_balance") return "Points redemption is currently unavailable.";
  if (reason === "terms_unavailable" || reason === "acceptance_unavailable") {
    return "Current rewards terms are unavailable or not accepted.";
  }
  if (reason === "invalid_request") return "The requested points could not be applied.";
  return "Rewards are currently unavailable.";
}

export function CheckoutForm({
  syntheticLocal = false,
  navigate = (url) => window.location.assign(url),
}: {
  promotions: readonly PromotionOption[];
  syntheticLocal?: boolean;
  navigate?: (url: string) => void;
}) {
  const { items, hydrated } = useCart();
  const [destination, setDestination] = useState(initialDestination);
  const [rewardRedemptionPoints, setRewardRedemptionPoints] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [quoteView, setQuoteView] = useState<QuoteView | null>(null);
  const [feedback, setFeedback] = useState<Readonly<{
    fingerprint: string;
    message: string;
    lastFailed: "quote" | "session" | null;
  }> | null>(null);
  const [busy, setBusy] = useState<"quote" | "session" | null>(null);
  const [previewReload, setPreviewReload] = useState(0);
  const [previewState, setPreviewState] = useState<Readonly<{
    key: string;
    preview: CartPreview | null;
    loading: boolean;
    error: boolean;
    changes: readonly string[];
    retained: boolean;
  }>>({ key: "", preview: null, loading: false, error: false, changes: [], retained: false });
  const [acknowledgedPreviewToken, setAcknowledgedPreviewToken] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const keyRef = useRef<Readonly<{ fingerprint: string; key: string }> | null>(null);
  const retainedPreviewRef = useRef<CartPreview | null>(null);
  const presentationLoadedRef = useRef(false);
  const previewRequestGenerationRef = useRef(0);

  const checkoutItems = useMemo(
    () => items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    [items],
  );
  const requestedRewardPoints = Number(rewardRedemptionPoints);
  const hasValidRequestedRewardPoints = rewardRedemptionPoints !== "" &&
    Number.isSafeInteger(requestedRewardPoints) && requestedRewardPoints > 0;
  const normalizedRequest = useMemo(() => ({
    items: checkoutItems,
    destination: {
      recipientName: normalizedText(destination.recipientName),
      line1: normalizedText(destination.line1),
      line2: normalizedText(destination.line2) || null,
      city: normalizedText(destination.city),
      stateCode: destination.stateCode,
      postalCode: destination.postalCode.trim(),
      countryCode: "US" as const,
    },
    ...(hasValidRequestedRewardPoints
      ? { rewardRedemptionPoints: requestedRewardPoints }
      : {}),
  }), [checkoutItems, destination, hasValidRequestedRewardPoints, requestedRewardPoints]);
  const fingerprint = useMemo(() => JSON.stringify(normalizedRequest), [normalizedRequest]);
  const cartKey = useMemo(() => JSON.stringify(checkoutItems), [checkoutItems]);
  const currentFeedback = feedback?.fingerprint === fingerprint ? feedback : null;
  const message = currentFeedback?.message ?? "";
  const lastFailed = currentFeedback?.lastFailed ?? null;

  useEffect(() => {
    if (!hydrated || items.length === 0) return;
    if (!presentationLoadedRef.current) {
      presentationLoadedRef.current = true;
      retainedPreviewRef.current = loadPreviewPresentation(window.sessionStorage);
    }
    const retained = retainedPreviewRef.current;
    const controller = new AbortController();
    const requestGeneration = previewRequestGenerationRef.current + 1;
    previewRequestGenerationRef.current = requestGeneration;
    const requestIsCurrent = () => !controller.signal.aborted &&
      previewRequestGenerationRef.current === requestGeneration;
    queueMicrotask(() => {
      if (requestIsCurrent()) {
        setPreviewState({ key: cartKey, preview: null, loading: true, error: false, changes: [], retained: retained !== null });
      }
    });
    void fetch("/api/catalog/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: checkoutItems,
        previousPreviewToken: retained?.previewToken ?? null,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Authoritative cart preview unavailable");
        const parsed = parsePreviewPresentation(await response.json());
        if (
          parsed === null || parsed.items.length !== checkoutItems.length ||
          parsed.items.some((line, index) =>
            line.variantId !== checkoutItems[index]?.variantId ||
            line.quantity !== checkoutItems[index]?.quantity)
        ) throw new Error("Authoritative cart preview is incoherent");
        return parsed;
      })
      .then((preview) => {
        if (!requestIsCurrent()) return;
        const priorById = new Map(retained?.items.map((line) => [line.variantId, line]));
        const currentIds = new Set(preview.items.map((line) => line.variantId));
        const changes = [
          ...(retained?.items.filter((line) => !currentIds.has(line.variantId))
            .map((line) => `Removed request: ${line.name ?? line.variantId}`) ?? []),
          ...preview.items.flatMap((line) => {
            const prior = priorById.get(line.variantId);
            const label = line.name ?? prior?.name ?? line.variantId;
            if (!line.available) return [`Unavailable request: ${label}`];
            if (prior && prior.quantity !== line.quantity) return [`Quantity adjusted in preview: ${label}`];
            if (prior && (prior.name !== line.name || prior.packageForm !== line.packageForm ||
              prior.unitAmountMinor !== line.unitAmountMinor || prior.currency !== line.currency)) {
              return [`Server facts changed: ${label}`];
            }
            return [];
          }),
        ];
        retainedPreviewRef.current = preview;
        savePreviewPresentation(window.sessionStorage, preview);
        setAcknowledgedPreviewToken((current) => current === preview.previewToken ? current : null);
        setPreviewState({ key: cartKey, preview, loading: false, error: false, changes, retained: retained !== null });
      })
      .catch((error: unknown) => {
        if (!requestIsCurrent() ||
          (error instanceof DOMException && error.name === "AbortError")) return;
        setPreviewState({ key: cartKey, preview: null, loading: false, error: true, changes: [], retained: retained !== null });
      });
    return () => controller.abort();
  }, [cartKey, checkoutItems, hydrated, items.length, previewReload]);

  const currentPreview = previewState.key === cartKey ? previewState.preview : null;
  const previewCanContinue = currentPreview !== null &&
    canContinueFromPreview(currentPreview, acknowledgedPreviewToken);

  useEffect(() => {
    if (Object.keys(errors).length > 0) summaryRef.current?.focus();
  }, [errors]);

  function updateField(field: keyof typeof destination, value: string) {
    setDestination((current) => ({ ...current, [field]: value }));
    setQuoteView(null);
    setFeedback(null);
    if (field !== "line2") {
      setErrors((current) => {
        const next = { ...current };
        delete next[field as DestinationField];
        return next;
      });
    }
  }

  function updateRewardRedemptionPoints(value: string) {
    setRewardRedemptionPoints(value);
    setQuoteView(null);
    setFeedback(null);
    setErrors((current) => {
      const next = { ...current };
      delete next.rewardRedemptionPoints;
      return next;
    });
  }

  function validate(): boolean {
    const next: Errors = {};
    if (items.length < 1) next.items = "Add at least one available catalog record";
    if (!normalizedRequest.destination.recipientName || normalizedRequest.destination.recipientName.length > 120) next.recipientName = "Enter a recipient name";
    if (!normalizedRequest.destination.line1 || normalizedRequest.destination.line1.length > 120) next.line1 = "Enter address line 1";
    if (!normalizedRequest.destination.city || normalizedRequest.destination.city.length > 100) next.city = "Enter a city";
    if (!stateCodes.includes(normalizedRequest.destination.stateCode)) next.stateCode = "Select a state or district";
    if (!/^\d{5}(?:-\d{4})?$/u.test(normalizedRequest.destination.postalCode)) next.postalCode = "Enter a valid U.S. postal code";
    if (rewardRedemptionPoints !== "" && !hasValidRequestedRewardPoints) {
      next.rewardRedemptionPoints = "Enter a positive whole number of points";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function requestKey(): string {
    if (keyRef.current?.fingerprint === fingerprint) return keyRef.current.key;
    const key = crypto.randomUUID().toLowerCase();
    keyRef.current = Object.freeze({ fingerprint, key });
    return key;
  }

  async function submitQuote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!previewCanContinue) {
      setFeedback({
        fingerprint,
        message: "Review and acknowledge the current server preview before requesting a checkout quote.",
        lastFailed: null,
      });
      return;
    }
    if (!validate()) return;
    const body = JSON.stringify(normalizedRequest);
    setBusy("quote");
    setFeedback({
      fingerprint,
      message: "Calculating current product, destination, promotion, shipping, and tax facts.",
      lastFailed: null,
    });
    try {
      const response = await fetch("/api/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey() },
        body,
      });
      const value: unknown = await response.json();
      if (exactRecord(value, ["status", "pricingRevision", "quote"]) &&
        safePricingRevision(value.pricingRevision) &&
        (value.status === "quoted" || value.status === "review_required")) {
        const quote = parseSafeQuote(value.quote);
        if (quote !== null) {
          setQuoteView({
            fingerprint,
            body,
            pricingRevision: value.pricingRevision,
            quote,
          });
          setFeedback({
            fingerprint,
            message: quote.status === "ready"
              ? "Authoritative total ready. Review it before continuing to hosted payment."
              : "Manual review is required before a hosted payment session can open.",
            lastFailed: null,
          });
          return;
        }
      }
      setQuoteView(null);
      setFeedback({
        fingerprint,
        message: responseMessage(
          typeof value === "object" && value !== null ? Reflect.get(value, "status") : null,
          typeof value === "object" && value !== null ? Reflect.get(value, "component") : null,
        ),
        lastFailed: "quote",
      });
    } catch {
      setQuoteView(null);
      setFeedback({ fingerprint, message: responseMessage("unavailable"), lastFailed: "quote" });
    } finally {
      setBusy(null);
    }
  }

  async function startSession() {
    if (quoteView === null || quoteView.fingerprint !== fingerprint || quoteView.quote.status !== "ready") return;
    setBusy("session");
    setFeedback({
      fingerprint,
      message: "Opening the server-authorized hosted payment page.",
      lastFailed: null,
    });
    try {
      const response = await fetch("/api/checkout/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey() },
        body: JSON.stringify({
          ...normalizedRequest,
          pricingRevision: quoteView.pricingRevision,
        }),
      });
      const value: unknown = await response.json();
      if (exactRecord(value, ["status", "orderId", "hostedUrl", "expiresAt"]) &&
        value.status === "open" && isCanonicalUuid(value.orderId) &&
        safeHostedUrl(value.hostedUrl) && safeIso(value.expiresAt)) {
        navigate(value.hostedUrl);
        return;
      }
      if (exactRecord(value, ["status", "pricingRevision", "cart"]) &&
        value.status === "PRICE_CHANGED" && safePricingRevision(value.pricingRevision) &&
        isSafePriceChangedCart(value.cart)) {
        if (keyRef.current?.fingerprint === fingerprint) keyRef.current = null;
        setQuoteView(null);
        setFeedback({
          fingerprint,
          message: responseMessage("PRICE_CHANGED"),
          lastFailed: "quote",
        });
        return;
      }
      setFeedback({
        fingerprint,
        message: responseMessage(
          typeof value === "object" && value !== null ? Reflect.get(value, "status") : null,
        ),
        lastFailed: "session",
      });
    } catch {
      setFeedback({ fingerprint, message: responseMessage("unavailable"), lastFailed: "session" });
    } finally {
      setBusy(null);
    }
  }

  if (!hydrated) return <div className="cart-loading" aria-label="Loading saved cart for checkout" />;

  const errorEntries = Object.entries(errors) as Array<[keyof Errors, string]>;
  const rewardsWarning = quoteView === null
    ? null
    : rewardsUnavailableCopy(quoteView.quote.rewardsUnavailableReason);
  return (
    <section className="record-card" aria-labelledby="checkout-form-heading">
      <p className="eyebrow">Authoritative checkout</p>
      <h2 id="checkout-form-heading" className="mt-3 font-heading text-3xl">Destination and totals</h2>
      <p className="mt-3 text-base leading-7 text-muted-ink">
        Your browser sends only canonical variant identifiers, quantities, destination, and optional reward points. Current prices and automatic promotions are resolved by the server.
      </p>
      {syntheticLocal ? (
        <p className="warning-record mt-5 font-semibold">Synthetic local test only</p>
      ) : null}

      {previewState.key === cartKey && previewState.loading ? (
        <div className="cart-loading mt-6" aria-label="Refreshing current server preview" />
      ) : null}
      {previewState.key === cartKey && previewState.error ? (
        <div className="error-record mt-6 text-base leading-7" role="alert">
          <p>The current server preview is unavailable. No quote can be requested.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setPreviewReload((current) => current + 1)}>Try server preview again</Button>
            <a href="/cart" className="record-link inline-flex min-h-11 items-center">Review the saved cart</a>
          </div>
        </div>
      ) : null}
      {currentPreview && !currentPreview.requiresAcknowledgement ? (
        <div className="info-record mt-6 text-base leading-7" role="status">
          {previewState.retained
            ? "The retained server preview still matches the current authoritative baseline."
            : "This is the current authoritative baseline; no earlier same-tab server preview was available."}
        </div>
      ) : null}
      {currentPreview?.requiresAcknowledgement ? (
        <section className="warning-record mt-6 text-base leading-7" aria-labelledby="preview-change-heading">
          <h3 id="preview-change-heading" className="font-semibold">Server preview changed or became unavailable.</h3>
          <p className="mt-2">Your requested variant identifiers and quantities were not replaced. Review the current server facts before checkout.</p>
          {previewState.changes.length ? (
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {previewState.changes.map((change) => <li key={change}>{change}</li>)}
            </ul>
          ) : null}
          {currentPreview.items.every((line) => line.available) && acknowledgedPreviewToken !== currentPreview.previewToken ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11"
              onClick={() => setAcknowledgedPreviewToken(currentPreview.previewToken)}
            >
              Acknowledge current server facts
            </Button>
          ) : currentPreview.items.some((line) => !line.available) ? (
            <a href="/cart" className="record-link mt-4 inline-flex min-h-11 items-center">Resolve unavailable cart lines</a>
          ) : (
            <p className="mt-4 font-semibold" role="status">Current server facts acknowledged.</p>
          )}
        </section>
      ) : null}

      {errorEntries.length > 0 ? (
        <div ref={summaryRef} className="error-record mt-6 text-base leading-7" role="alert" tabIndex={-1}>
          <h3 className="font-semibold">Review the highlighted fields</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            {errorEntries.map(([field, error]) => (
              <li key={field}><a className="record-link" href={`#${field}`}>{error}</a></li>
            ))}
          </ul>
        </div>
      ) : null}

      <form ref={formRef} className="mt-8 grid gap-6" onSubmit={submitQuote} noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="recipientName" label="Recipient name" error={errors.recipientName}>
            <input id="recipientName" name="recipientName" className="form-input" autoComplete="name" maxLength={120} required aria-required="true" value={destination.recipientName} aria-invalid={Boolean(errors.recipientName)} aria-describedby={errors.recipientName ? "recipientName-error" : undefined} onChange={(event) => updateField("recipientName", event.currentTarget.value)} />
          </Field>
          <Field id="countryCode" label="Country">
            <input id="countryCode" name="countryCode" className="form-input" value="United States (US)" readOnly />
          </Field>
        </div>
        <Field id="line1" label="Address line 1" error={errors.line1}>
          <input id="line1" name="line1" className="form-input" autoComplete="address-line1" maxLength={120} required aria-required="true" value={destination.line1} aria-invalid={Boolean(errors.line1)} aria-describedby={errors.line1 ? "line1-error" : undefined} onChange={(event) => updateField("line1", event.currentTarget.value)} />
        </Field>
        <Field id="line2" label="Address line 2 (optional)">
          <input id="line2" name="line2" className="form-input" autoComplete="address-line2" maxLength={120} value={destination.line2} onChange={(event) => updateField("line2", event.currentTarget.value)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="city" label="City" error={errors.city}>
            <input id="city" name="city" className="form-input" autoComplete="address-level2" maxLength={100} required aria-required="true" value={destination.city} aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? "city-error" : undefined} onChange={(event) => updateField("city", event.currentTarget.value)} />
          </Field>
          <Field id="stateCode" label="State or district" error={errors.stateCode}>
            <select id="stateCode" name="stateCode" className="form-input" autoComplete="address-level1" required aria-required="true" value={destination.stateCode} aria-invalid={Boolean(errors.stateCode)} aria-describedby={errors.stateCode ? "stateCode-error" : undefined} onChange={(event) => updateField("stateCode", event.currentTarget.value)}>
              <option value="">Select</option>
              {stateCodes.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </Field>
          <Field id="postalCode" label="Postal code" error={errors.postalCode}>
            <input id="postalCode" name="postalCode" className="form-input" autoComplete="postal-code" inputMode="numeric" maxLength={10} required aria-required="true" value={destination.postalCode} aria-invalid={Boolean(errors.postalCode)} aria-describedby={errors.postalCode ? "postalCode-error" : undefined} onChange={(event) => updateField("postalCode", event.currentTarget.value)} />
          </Field>
        </div>
        <p className="info-record text-base leading-7">
          Eligible automatic promotions are selected from current server facts; no promotion claim is sent by this form.
        </p>
        <Field
          id="rewardRedemptionPoints"
          label="Points to redeem (optional)"
          error={errors.rewardRedemptionPoints}
        >
          <input
            id="rewardRedemptionPoints"
            name="rewardRedemptionPoints"
            className="form-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={Number.MAX_SAFE_INTEGER}
            step={1}
            value={rewardRedemptionPoints}
            aria-invalid={Boolean(errors.rewardRedemptionPoints)}
            aria-describedby={errors.rewardRedemptionPoints ? "rewardRedemptionPoints-error" : undefined}
            onChange={(event) => updateRewardRedemptionPoints(event.currentTarget.value)}
          />
        </Field>
        {errors.items ? <p id="items-error" className="error-record text-base" role="alert">{errors.items}</p> : null}
        <Button
          type="submit"
          className="action-primary min-h-12 w-full sm:w-auto"
          disabled={busy !== null || !previewCanContinue}
        >
          {busy === "quote" ? "Getting authoritative quote…" : "Calculate authoritative total"}
        </Button>
      </form>

      <p className="mt-6 min-h-6 text-base leading-7 text-muted-ink" role="status" aria-live="polite">{message}</p>
      {lastFailed === "quote" ? (
        <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => formRef.current?.requestSubmit()}>
          Try authoritative quote again
        </Button>
      ) : null}
      {lastFailed === "session" && quoteView?.fingerprint === fingerprint && quoteView.quote.status === "ready" ? (
        <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={startSession}>
          Try hosted payment again
        </Button>
      ) : null}

      {quoteView?.fingerprint === fingerprint ? (
        <section className="mt-8 border-t border-border pt-8" aria-labelledby="authoritative-total-heading">
          <p className="eyebrow">Current server result</p>
          <h3 id="authoritative-total-heading" className="mt-3 font-heading text-3xl">Authoritative total</h3>
          <ul className="mt-5 grid gap-3 p-0">
            {quoteView.quote.lines.map((line) => (
              <li key={line.variantId} className="flex flex-wrap justify-between gap-3 border-b border-border pb-3">
                <span><strong>{line.productName}</strong><span className="block text-base text-muted-ink">{line.variantLabel} · {line.quantity} × {money(line.unitAmountMinor)}</span></span>
                <span className="tabular-nums">{money(line.totalMinor)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-6 grid gap-3 text-base">
            <MoneyRow label="Merchandise subtotal" amount={money(quoteView.quote.subtotalMinor)} />
            <MoneyRow
              label="Promotion discount"
              amount={`−${money(quoteView.quote.promotionDiscountMinor)}`}
            />
            <MoneyRow
              label="Referral benefit"
              amount={`−${money(quoteView.quote.referralDiscountMinor)}`}
            />
            <MoneyRow
              label={`Points redemption (${quoteView.quote.rewardRedemptionPoints} points)`}
              amount={`−${money(quoteView.quote.rewardRedemptionMinor)}`}
            />
            <MoneyRow label={syntheticLocal ? "Synthetic local test only shipping" : "Shipping"} amount={money(quoteView.quote.shippingMinor)} />
            <MoneyRow label={syntheticLocal ? "Synthetic local test only tax" : "Tax"} amount={money(quoteView.quote.taxMinor)} />
            <MoneyRow label="Total" amount={money(quoteView.quote.totalMinor)} strong />
          </dl>
          <p className="info-record mt-6 text-base tabular-nums">
            {quoteView.quote.pendingBaseEarnPoints} points pending after qualifying payment
          </p>
          {quoteView.quote.rewardsBenefitAvailable === false &&
          rewardsWarning !== null ? (
            <p className="warning-record mt-4 text-base">
              Rewards benefit unavailable: {rewardsWarning}
            </p>
          ) : null}
          {quoteView.quote.status === "review_required" ? (
            <div className="warning-record mt-6 text-base leading-7" role="status">
              <strong>Manual review is required</strong>
              <p className="mt-2">No hosted-payment action is available until the exact review facts are approved.</p>
            </div>
          ) : (
            <Button type="button" className="action-primary mt-7 min-h-12 w-full sm:w-auto" disabled={busy !== null} onClick={startSession}>
              {busy === "session" ? "Opening hosted payment…" : "Continue to hosted payment"}
            </Button>
          )}
        </section>
      ) : null}
    </section>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="form-label" htmlFor={id}>{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className="mt-2 text-base font-semibold text-danger">{error}</p> : null}
    </div>
  );
}

function MoneyRow({ label, amount, strong = false }: { label: string; amount: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-5 ${strong ? "border-t border-border pt-4 text-xl font-semibold" : ""}`}>
      <dt>{label}</dt><dd className="tabular-nums">{amount}</dd>
    </div>
  );
}
