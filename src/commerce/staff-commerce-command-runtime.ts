import "server-only";

import {
  authorizeStaffCommerceCommandV1,
  type AdminRepository,
  type StaffCommerceAuthorizationOperationV1,
} from "@/admin/admin-service";
import type { VerifiedIdentity } from "@/auth/identity";
import {
  createFulfillmentExecutionContextV1,
} from "@/commerce/fulfillment-context";
import {
  clearFulfillmentHold,
  handoffFulfillment,
  markShipmentDelivered,
  recordShipmentException,
  type FulfillmentCommandRepository,
  type FulfillmentCommandResultV1,
  type FulfillmentRewardsLifecycleV1,
} from "@/commerce/fulfillment-service";
import type { PaymentProvider } from "@/commerce/payment-provider";
import { createProviderExecutionContextV1 } from "@/commerce/provider-context";
import {
  submitOrRecoverRefund,
  type RefundCommandRepository,
  type RefundCommandResultV1,
} from "@/commerce/refund-service";
import type { ServerEnv } from "@/config/env-schema";
import type { Principal } from "@/domain/authorization";

export type StaffCommerceCommandRuntimeV1 = Readonly<{
  submitOrRecoverRefund: (refundId: string) => Promise<RefundCommandResultV1>;
  clearFulfillmentHold: (orderId: string) => Promise<FulfillmentCommandResultV1>;
  handoffFulfillment: (orderId: string) => Promise<FulfillmentCommandResultV1>;
  markShipmentDelivered: (orderId: string) => Promise<FulfillmentCommandResultV1>;
  recordShipmentException: (orderId: string) => Promise<FulfillmentCommandResultV1>;
}>;

export async function createStaffCommerceCommandRuntimeV1(input: Readonly<{
  environment: ServerEnv;
  identity: VerifiedIdentity | null;
  principal: Principal | null;
  now: Date;
  correlationId: string;
  adminRepository: AdminRepository;
  refundRepository: RefundCommandRepository;
  fulfillmentRepository: FulfillmentCommandRepository;
  rewardsLifecycle: FulfillmentRewardsLifecycleV1;
  resolveDatabaseUsersByClerkId: (
    clerkUserId: string,
  ) => Promise<readonly string[]>;
  adapters: Readonly<{
    stripe: PaymentProvider | null;
    localTest: PaymentProvider | null;
  }>;
}>): Promise<StaffCommerceCommandRuntimeV1> {
  let providerContextPromise: ReturnType<
    typeof createProviderExecutionContextV1
  > | null = null;
  const providerContext = async () => {
    providerContextPromise ??= createProviderExecutionContextV1({
      environment: input.environment,
      identity: input.identity,
      now: input.now,
      resolveDatabaseUsersByClerkId: input.resolveDatabaseUsersByClerkId,
      adapters: input.adapters,
    });
    const provider = await providerContextPromise;
    return provider.ok ? provider.context : null;
  };
  const fulfillmentContext = createFulfillmentExecutionContextV1(
    input.environment,
  );
  const actorUserId = input.principal?.actorId ?? null;
  const adminContext = Object.freeze({
    principal: input.principal,
    identity: input.identity,
    now: input.now,
    correlationId: input.correlationId,
    rateLimitSecret: input.environment.RATE_LIMIT_SECRET ?? "",
  });
  const authorize = (operation: StaffCommerceAuthorizationOperationV1) =>
    authorizeStaffCommerceCommandV1(
      input.adminRepository,
      adminContext,
      operation,
    );
  const fulfillmentInput = (orderId: string) => Object.freeze({
    executionContext: fulfillmentContext,
    repository: input.fulfillmentRepository,
    actorUserId,
    orderId,
    now: input.now,
    correlationId: input.correlationId,
    authorize: () => authorize("fulfillment.release.consume"),
    rewardsLifecycle: input.rewardsLifecycle,
  });

  return Object.freeze({
    submitOrRecoverRefund: async (refundId) =>
      submitOrRecoverRefund({
        repository: input.refundRepository,
        providerContext: await providerContext(),
        actorUserId,
        refundId,
        now: input.now,
        authorize: () => authorize("refund.request"),
      }),
    clearFulfillmentHold: (orderId) =>
      clearFulfillmentHold(fulfillmentInput(orderId)),
    handoffFulfillment: (orderId) =>
      handoffFulfillment(fulfillmentInput(orderId)),
    markShipmentDelivered: (orderId) =>
      markShipmentDelivered(fulfillmentInput(orderId)),
    recordShipmentException: (orderId) =>
      recordShipmentException(fulfillmentInput(orderId)),
  });
}
