declare module "local-payment-provider" {
  export {
    createSyntheticLocalPaymentProvider,
    LOCAL_PAYMENT_PROVIDER_SENTINEL,
    type SyntheticCheckoutOutcome,
    type SyntheticRefundOutcome,
  } from "./local-payment-provider";
}
