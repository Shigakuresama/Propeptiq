import type {
  AccountRepository,
  AccountTransaction,
  AttestationVersionRecord,
  BuyerProfileRecord,
} from "@/account/account-service";
import type { VerifiedIdentity } from "@/auth/identity";
import type { BuyerStatus, ResearchPurpose } from "@/domain/eligibility";

export type AccountSqlClient = Readonly<{
  query: <T extends object>(
    sql: string,
    params?: unknown[],
  ) => Promise<Readonly<{ rows: T[] }>>;
}>;

export type AccountTransactionRunner = <T>(
  work: (client: AccountSqlClient) => Promise<T>,
  options: Readonly<{ isolationLevel: "serializable" }>,
) => Promise<T>;

type ProfileRow = {
  userId: string;
  status: BuyerStatus;
  ageConfirmedAt: Date | string | null;
  researchPurpose: ResearchPurpose | null;
  organizationName: string | null;
  updatedAt: Date | string;
};

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid database timestamp");
  return date.toISOString();
}

function mapProfile(row: ProfileRow): BuyerProfileRecord {
  return Object.freeze({
    ...row,
    ageConfirmedAt:
      row.ageConfirmedAt === null ? null : toIso(row.ageConfirmedAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function transactionFor(client: AccountSqlClient): AccountTransaction {
  return {
    async upsertIdentity(identity: VerifiedIdentity, now: Date) {
      const result = await client.query<{ userId: string }>(
        `
          INSERT INTO users (clerk_id, email_verified_at, updated_at)
          VALUES ($1, $2::timestamptz, $3::timestamptz)
          ON CONFLICT (clerk_id) DO UPDATE
          SET email_verified_at = COALESCE(users.email_verified_at, EXCLUDED.email_verified_at),
              updated_at = EXCLUDED.updated_at
          RETURNING id::text AS "userId"
        `,
        [identity.clerkUserId, identity.emailVerifiedAt, now.toISOString()],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Identity projection failed");
      return row;
    },

    async getBuyerProfile(userId: string) {
      const result = await client.query<ProfileRow>(
        `
          SELECT user_id::text AS "userId", status,
                 age_confirmed_at AS "ageConfirmedAt",
                 research_purpose AS "researchPurpose",
                 organization_name AS "organizationName",
                 updated_at AS "updatedAt"
          FROM buyer_profiles
          WHERE user_id = $1::uuid
        `,
        [userId],
      );
      return result.rows[0] ? mapProfile(result.rows[0]) : null;
    },

    async findCurrentAttestations(now: Date) {
      const result = await client.query<AttestationVersionRecord>(
        `
          SELECT id::text AS "id", version
          FROM attestation_versions
          WHERE effective_at <= $1::timestamptz
            AND (superseded_at IS NULL OR superseded_at > $1::timestamptz)
          ORDER BY version DESC
        `,
        [now.toISOString()],
      );
      return result.rows;
    },

    async hasAttestationAcceptance(userId: string, attestationId: string) {
      const result = await client.query<{ accepted: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM attestation_acceptances
            WHERE user_id = $1::uuid AND attestation_version_id = $2::uuid
          ) AS accepted
        `,
        [userId, attestationId],
      );
      return result.rows[0]?.accepted === true;
    },

    async acceptAttestation(userId: string, attestationId: string, now: Date) {
      await client.query(
        `
          INSERT INTO attestation_acceptances
            (user_id, attestation_version_id, accepted_at)
          VALUES ($1::uuid, $2::uuid, $3::timestamptz)
          ON CONFLICT (user_id, attestation_version_id) DO NOTHING
        `,
        [userId, attestationId, now.toISOString()],
      );
    },

    async saveBuyerProfile(profile, expectedUpdatedAt) {
      const values = [
        profile.userId,
        profile.status,
        profile.ageConfirmedAt,
        profile.researchPurpose,
        profile.organizationName,
        profile.updatedAt,
      ];
      const result =
        expectedUpdatedAt === null
          ? await client.query<ProfileRow>(
              `
                INSERT INTO buyer_profiles
                  (user_id, status, age_confirmed_at, research_purpose,
                   organization_name, updated_at)
                VALUES
                  ($1::uuid, $2::buyer_status, $3::timestamptz,
                   $4::research_purpose, $5, $6::timestamptz)
                ON CONFLICT (user_id) DO NOTHING
                RETURNING user_id::text AS "userId", status,
                          age_confirmed_at AS "ageConfirmedAt",
                          research_purpose AS "researchPurpose",
                          organization_name AS "organizationName",
                          updated_at AS "updatedAt"
              `,
              values,
            )
          : await client.query<ProfileRow>(
              `
                UPDATE buyer_profiles
                SET status = $2::buyer_status,
                    age_confirmed_at = $3::timestamptz,
                    research_purpose = $4::research_purpose,
                    organization_name = $5,
                    updated_at = $6::timestamptz
                WHERE user_id = $1::uuid AND updated_at = $7::timestamptz
                RETURNING user_id::text AS "userId", status,
                          age_confirmed_at AS "ageConfirmedAt",
                          research_purpose AS "researchPurpose",
                          organization_name AS "organizationName",
                          updated_at AS "updatedAt"
              `,
              [...values, expectedUpdatedAt],
            );
      const row = result.rows[0];
      if (!row) throw new Error("Stale buyer profile write rejected");
      return mapProfile(row);
    },

    async appendAudit(event) {
      await client.query(
        `
          INSERT INTO admin_audit
            (actor_user_id, action, resource_type, resource_id,
             correlation_id, metadata)
          VALUES ($1::uuid, $2, 'buyer_profile', $3, $4, $5::jsonb)
        `,
        [
          event.actorUserId,
          event.action,
          event.resourceId,
          event.correlationId,
          JSON.stringify(event.metadata),
        ],
      );
    },
  };
}

export function createPostgresAccountRepository(
  runTransaction: AccountTransactionRunner,
): AccountRepository {
  return {
    transaction(work) {
      return runTransaction((client) => work(transactionFor(client)), {
        isolationLevel: "serializable",
      });
    },
  };
}
