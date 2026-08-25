import { isCapability, type Principal } from "@/domain/authorization";
import type { VerifiedIdentity } from "@/auth/identity";
import { isVerifiedIdentityAt } from "@/auth/identity";
import type { BuyerStatus } from "@/domain/eligibility";

export type PrincipalQueryPort = Readonly<{
  query: <T extends object>(
    sql: string,
    params?: unknown[],
  ) => Promise<Readonly<{ rows: T[] }>>;
}>;

export async function loadPrincipalByClerkId(
  client: PrincipalQueryPort,
  clerkUserId: string,
  mfaSatisfied: boolean,
): Promise<Principal | null> {
  if (!clerkUserId.trim()) return null;
  const user = await client.query<{
    actorId: string;
    buyerStatus: BuyerStatus | null;
  }>(
    `
      SELECT u.id::text AS "actorId", bp.status AS "buyerStatus"
      FROM users u
      LEFT JOIN buyer_profiles bp ON bp.user_id = u.id
      WHERE u.clerk_id = $1
    `,
    [clerkUserId],
  );
  const row = user.rows[0];
  if (!row) return null;
  const roles = await client.query<{ capability: string }>(
    `
      SELECT capability FROM staff_roles
      WHERE user_id = $1::uuid AND revoked_at IS NULL
      ORDER BY capability
    `,
    [row.actorId],
  );
  if (!roles.rows.every((role) => isCapability(role.capability))) {
    throw new Error("Database contains an unknown active capability");
  }
  const capabilities = roles.rows.map((role) => {
    if (!isCapability(role.capability)) {
      throw new Error("Database contains an unknown active capability");
    }
    return role.capability;
  });
  return Object.freeze({
    actorId: row.actorId,
    clerkUserId,
    buyerStatus: row.buyerStatus,
    capabilities: Object.freeze(capabilities),
    mfaSatisfied,
  });
}

export async function projectPrincipalFromIdentity(
  client: PrincipalQueryPort,
  identity: VerifiedIdentity,
  now: Date,
): Promise<Principal | null> {
  if (!isVerifiedIdentityAt(identity, now)) return null;
  await client.query(
    `
      INSERT INTO users (clerk_id, email_verified_at)
      VALUES ($1, $2::timestamptz)
      ON CONFLICT (clerk_id) DO NOTHING
    `,
    [identity.clerkUserId, identity.emailVerifiedAt],
  );
  const principal = await loadPrincipalByClerkId(
    client,
    identity.clerkUserId,
    identity.mfaConfigured && identity.secondFactorCompleted,
  );
  if (!principal) throw new Error("Verified identity projection failed closed");
  return principal;
}
