import type { AccountRepository } from "@/account/account-service";
import type { AccountSummary, OrderDetail, OrderSummary } from "@/account/account-read";
import type { AdminRepository } from "@/admin/admin-service";
import type {
  AdminReadResource,
  AdminReadSnapshotFor,
} from "@/admin/admin-read";
import type { VerifiedIdentity } from "@/auth/identity";
import type { CheckoutRepository } from "@/commerce/checkout-service";
import type { ShippingQuotePort, TaxQuotePort } from "@/commerce/checkout-ports";
import type { CheckoutSuccessReadModel } from "@/commerce/checkout-success-read";
import type { FulfillmentCommandRepository } from "@/commerce/fulfillment-service";
import type { PaymentProvider } from "@/commerce/payment-provider";
import type { RefundCommandRepository } from "@/commerce/refund-service";
import type { ProviderSessionRepository } from "@/db/repositories/provider-session-repository";
import type { Principal } from "@/domain/authorization";
import type { AffiliateCheckoutQuote } from "@/growth/affiliate-service";
import type { RateLimitStore } from "@/security/rate-limit";
import type { StorageVerifier } from "@/security/storage";

export type LocalActorOption = Readonly<{
  key: string;
  label: string;
  description: string;
}>;

export type LocalAdminSnapshot = Readonly<{
  buyers: readonly Readonly<{
    userId: string;
    label: string;
    status: string | null;
  }>[];
  audits: readonly Readonly<{
    action: string;
    resourceType: string;
    resourceId: string;
    correlationId: string;
  }>[];
  orders?: readonly Readonly<{
    id: string;
    state: string;
    currency: string;
    totalMinor: number;
  }>[];
  commandDefaults?: Readonly<Record<string, string>>;
}>;

export type LocalCommerceInspectionV1 = Readonly<{
  schemaVersion: 1;
  revision: number;
  orderCount: number;
  attemptCount: number;
  providerSessionCount: number;
  reviewRequestCount: number;
  reservationCount: number;
  paymentTransitionCount: number;
  refundCount: number;
  releaseCount: number;
  shipmentHandoffCount: number;
  deliveryCount: number;
  exceptionCount: number;
  effectCount: number;
  lastOrderUpdatedAt: string | null;
}>;

export type LocalCommerceDriverV1 = Readonly<{
  checkoutRepository: CheckoutRepository;
  providerSessionRepository: ProviderSessionRepository;
  paymentProvider: PaymentProvider;
  shippingQuotePort: ShippingQuotePort;
  taxQuotePort: TaxQuotePort;
  affiliateCandidateLookup: (input: Readonly<{
      buyerUserId: string;
      code: string;
      clickedAt: string;
      expiresAt: string;
      now: Date;
    }>) => Promise<AffiliateCheckoutQuote>;
  rateLimitStore: RateLimitStore;
  refundRepository: RefundCommandRepository;
  fulfillmentRepository: FulfillmentCommandRepository;
  reset: () => LocalCommerceInspectionV1;
  inspect: () => LocalCommerceInspectionV1;
  loadSyntheticHostedSession: (input: Readonly<{
    ownerUserId: string;
    sessionId: string;
  }>) => Readonly<{ orderId: string; sessionId: string; totalMinor: number; currency: "USD" }> | null;
  returnWithoutEvent: (input: Readonly<{
    ownerUserId: string;
    sessionId: string;
  }>) => Readonly<{ status: "pending"; orderId: string }> | null;
  completeWithInternallySignedEvent: (input: Readonly<{
    ownerUserId: string;
    sessionId: string;
    secret: string;
  }>) => Readonly<{ status: "paid"; orderId: string }> | null;
  loadSuccess: (ownerUserId: string, orderId: string) => CheckoutSuccessReadModel | null;
  listOrders: (ownerUserId: string) => readonly OrderSummary[];
  loadOrder: (ownerUserId: string, orderId: string) => OrderDetail | null;
  commandTargets: () => Readonly<{ refundId: string; fulfillmentOrderId: string }>;
  adminSnapshotItems: (
    resource: "orders" | "refunds" | "shipments",
  ) => readonly Readonly<Record<string, unknown>>[];
}>;

export type LocalTestDriver = Readonly<{
  actorOptions: readonly LocalActorOption[];
  signActor: (actorKey: string, secret: string) => string | null;
  resolveIdentity: (signedActor: string | undefined, secret: string) => VerifiedIdentity | null;
  loadIdentityByClerkId: (clerkUserId: string) => VerifiedIdentity | null;
  loadPrincipal: (clerkUserId: string) => Principal | null;
  accountRepository: AccountRepository;
  adminRepository: AdminRepository;
  storageVerifier: StorageVerifier;
  loadAccount: (userId: string) => AccountSummary | null;
  loadCurrentAttestation: () => Readonly<{ version: number; policyText: string }> | null;
  listOrders: (userId: string) => readonly OrderSummary[];
  loadOrder: (userId: string, orderId: string) => OrderDetail | null;
  loadAdminSnapshot: () => LocalAdminSnapshot;
  readAdminSnapshot: <Resource extends AdminReadResource>(
    resource: Resource,
  ) => AdminReadSnapshotFor<Resource>;
  commerce: LocalCommerceDriverV1;
}>;
