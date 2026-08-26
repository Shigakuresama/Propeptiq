import type { PaymentProvider } from "@/commerce/payment-provider";

export function createSyntheticLocalPaymentProvider(): never {
  throw new Error("The synthetic local payment provider is unavailable in this build");
}

export const LOCAL_PAYMENT_PROVIDER_SENTINEL: never = undefined as never;

export type SyntheticCheckoutOutcome = never;
export type SyntheticRefundOutcome = never;
export type LocalPaymentProvider = PaymentProvider;
