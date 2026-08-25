import type { AccountRepository } from "@/account/account-service";
import type { AccountSummary, OrderDetail, OrderSummary } from "@/account/account-read";
import type { AdminRepository } from "@/admin/admin-service";
import type {
  AdminReadResource,
  AdminReadSnapshotFor,
} from "@/admin/admin-read";
import type { VerifiedIdentity } from "@/auth/identity";
import type { Principal } from "@/domain/authorization";
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
}>;
