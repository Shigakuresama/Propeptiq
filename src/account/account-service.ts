import {
  isVerifiedIdentityAt,
  type VerifiedIdentity,
} from "@/auth/identity";
import {
  evaluateBuyerActivation,
  type BuyerStatus,
  type ResearchPurpose,
} from "@/domain/eligibility";

export type BuyerProfileRecord = Readonly<{
  userId: string;
  status: BuyerStatus;
  ageConfirmedAt: string | null;
  researchPurpose: ResearchPurpose | null;
  organizationName: string | null;
  updatedAt: string;
}>;

export type AttestationVersionRecord = Readonly<{
  id: string;
  version: number;
}>;

export type AccountAuditEvent = Readonly<{
  actorUserId: string;
  action: string;
  resourceId: string;
  correlationId: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type AccountTransaction = Readonly<{
  upsertIdentity: (
    identity: VerifiedIdentity,
    now: Date,
  ) => Promise<Readonly<{ userId: string }>>;
  getBuyerProfile: (userId: string) => Promise<BuyerProfileRecord | null>;
  findCurrentAttestations: (
    now: Date,
  ) => Promise<readonly AttestationVersionRecord[]>;
  hasAttestationAcceptance: (
    userId: string,
    attestationId: string,
  ) => Promise<boolean>;
  acceptAttestation: (
    userId: string,
    attestationId: string,
    now: Date,
  ) => Promise<void>;
  saveBuyerProfile: (
    profile: BuyerProfileRecord,
    expectedUpdatedAt: string | null,
  ) => Promise<BuyerProfileRecord>;
  appendAudit: (event: AccountAuditEvent) => Promise<void>;
}>;

export type AccountRepository = Readonly<{
  transaction: <T>(work: (tx: AccountTransaction) => Promise<T>) => Promise<T>;
}>;

export type CompleteBuyerAccountInput = Readonly<{
  ageConfirmed21Plus: boolean;
  researchPurpose: ResearchPurpose | null;
  organizationName?: string | null;
  acceptCurrentAttestation: boolean;
}>;

function normalizeOrganizationName(
  value: string | null | undefined,
  existing: string | null,
): string | null {
  if (value === undefined) return existing;
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 160) {
    throw new Error("Organization name is too long");
  }
  return normalized;
}

export async function completeBuyerAccount(
  repository: AccountRepository,
  request: Readonly<{
    identity: VerifiedIdentity;
    input: CompleteBuyerAccountInput;
    now: Date;
    correlationId: string;
  }>,
): Promise<BuyerProfileRecord> {
  if (
    !isVerifiedIdentityAt(request.identity, request.now) ||
    !Number.isFinite(request.now.getTime()) ||
    !request.correlationId.trim()
  ) {
    throw new Error("Required account facts are incomplete");
  }

  return repository.transaction(async (tx) => {
    const { userId } = await tx.upsertIdentity(request.identity, request.now);
    const [existing, currentAttestations] = await Promise.all([
      tx.getBuyerProfile(userId),
      tx.findCurrentAttestations(request.now),
    ]);
    if (existing?.status === "blocked") {
      throw new Error("Blocked accounts are read-only");
    }
    if (currentAttestations.length !== 1) {
      throw new Error("Exactly one current attestation is required");
    }
    const currentAttestation = currentAttestations[0]!;
    const alreadyAccepted = await tx.hasAttestationAcceptance(
      userId,
      currentAttestation.id,
    );
    if (request.input.acceptCurrentAttestation && !alreadyAccepted) {
      await tx.acceptAttestation(userId, currentAttestation.id, request.now);
    }

    const ageConfirmedAt = request.input.ageConfirmed21Plus
      ? request.now.toISOString()
      : (existing?.ageConfirmedAt ?? null);
    const researchPurpose =
      request.input.researchPurpose ?? existing?.researchPurpose ?? null;
    const acceptedCurrent =
      alreadyAccepted || request.input.acceptCurrentAttestation;
    if (!acceptedCurrent) {
      throw new Error("Current attestation acceptance is required");
    }
    const statusSignal = existing?.status === "review" ? existing.status : null;
    const decision = evaluateBuyerActivation({
      emailVerified: true,
      ageConfirmed21Plus: ageConfirmedAt !== null,
      researchPurpose,
      acceptedAttestationVersion: acceptedCurrent
        ? String(currentAttestation.version)
        : null,
      currentAttestationVersion: String(currentAttestation.version),
      statusSignal,
    });
    const status = existing?.status ?? decision.status;
    if (status === null) {
      throw new Error(
        `Required account facts are incomplete: ${decision.reasons.join(", ")}`,
      );
    }

    const profile = await tx.saveBuyerProfile(
      Object.freeze({
        userId,
        status,
        ageConfirmedAt,
        researchPurpose,
        organizationName: normalizeOrganizationName(
          request.input.organizationName,
          existing?.organizationName ?? null,
        ),
        updatedAt: request.now.toISOString(),
      }),
      existing?.updatedAt ?? null,
    );
    await tx.appendAudit({
      actorUserId: userId,
      action: existing
        ? "account.profile.updated"
        : "account.onboarding.completed",
      resourceId: userId,
      correlationId: request.correlationId,
      metadata: {
        attestationVersion: currentAttestation.version,
        status: profile.status,
      },
    });
    return profile;
  });
}
