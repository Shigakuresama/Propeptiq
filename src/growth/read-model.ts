import { createHash } from "node:crypto";

import type { RewardLedgerKind } from "@/db/repositories/growth-repository";

export type RewardLedgerReadItem = Readonly<{
  occurredAt: string;
  kind: RewardLedgerKind;
  reference: string;
  pendingPointsDelta: number;
  availablePointsDelta: number;
  pendingPointsBalanceAfter: number;
  availablePointsBalanceAfter: number;
}>;

export type GrowthReadPage = Readonly<{
  limit: number;
  offset: number;
  hasMore: boolean;
}>;

export type PagedGrowthReadItems<Item> = Readonly<{
  items: readonly Item[];
  totalCount: number;
  page: GrowthReadPage;
}>;

export type OwnerGrowthSnapshot = Readonly<{
  rewards: Readonly<{
    pendingPoints: number;
    availablePoints: number;
    usdEquivalentMinor: number | null;
    minimumRedemptionProgress: Readonly<{
      currentPoints: number;
      requiredPoints: number;
    }> | null;
    ledger: PagedGrowthReadItems<RewardLedgerReadItem>;
  }> | null;
  referrals: Readonly<{
    code: string | null;
    status: "active" | "revoked" | null;
    counts: Readonly<{
      attributed: number;
      pending: number;
      qualified: number;
      reversed: number;
    }>;
    rewardPointsTotal: number;
    conversions: PagedGrowthReadItems<Readonly<{
      reference: string;
      status: "pending" | "qualified" | "reversed";
      rewardPoints: number;
      occurredAt: string;
    }>>;
  }>;
  sharedSets: PagedGrowthReadItems<Readonly<{
    code: string;
    label: string;
    active: boolean;
    itemCount: number;
    updatedAt: string;
  }>>;
  affiliate: Readonly<{
    publicCode: string;
    status: "pending" | "active" | "rejected" | "suspended";
    publicChannel: string;
    promotionMethod: "website" | "social" | "email" | "other";
    attributedCount: number;
    commissionTotalsMinor: Readonly<{
      pending: number;
      approved: number;
      paid: number;
      reversed: number;
    }>;
    payoutTotalsMinor: Readonly<{ pending: number; paid: number }>;
  }> | null;
}>;

export function deepFreezeGrowthReadModel<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreezeGrowthReadModel(nested);
    }
  }
  return value;
}

export function redactGrowthReference(reference: string): string {
  return `ref:${createHash("sha256").update(reference, "utf8").digest("hex").slice(0, 10)}`;
}
