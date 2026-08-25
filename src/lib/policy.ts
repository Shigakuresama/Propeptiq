export type ApprovalState =
  | "Submitted"
  | "Pending review"
  | "Approved"
  | "Suspended / rejected";

export type OrderState =
  | "Draft"
  | "Compliance hold"
  | "Payment pending"
  | "Released"
  | "Closed / cancelled";

export type PaymentState =
  | "Initiated"
  | "Webhook verified"
  | "Journaled"
  | "Reconciled"
  | "Refunded / disputed";

export type FulfillmentState = "Queued" | "Packed" | "Shipped" | "Delivered" | "Exception";

export type JurisdictionState = "Allowed" | "Manual Review" | "Blocked" | "Unknown";

export type CheckoutGateInput = {
  accountApproval: ApprovalState;
  jurisdictionState: JurisdictionState;
  complianceHold: boolean;
  paymentState: PaymentState;
};

export type CheckoutGateResult = {
  allowed: boolean;
  reasons: string[];
};

export function evaluateCheckoutGate(input: CheckoutGateInput): CheckoutGateResult {
  const reasons: string[] = [];

  if (input.accountApproval !== "Approved") {
    reasons.push("account_not_approved");
  }

  if (input.jurisdictionState !== "Allowed") {
    reasons.push(`jurisdiction_${input.jurisdictionState.toLowerCase().replace(/\s+/g, "_")}`);
  }

  if (input.complianceHold) {
    reasons.push("compliance_hold_active");
  }

  if (input.paymentState !== "Reconciled") {
    reasons.push("payment_not_reconciled");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

export function requiresManualReview(jurisdictionState: JurisdictionState) {
  return jurisdictionState === "Manual Review" || jurisdictionState === "Unknown";
}
