import { createHmac } from "node:crypto";

import { loadDatabaseCatalogRecords } from "@/catalog/database-catalog";
import { buildPublicCatalog } from "@/catalog/public-catalog";
import {
  createPostgresGrowthRepository,
  GrowthPersistenceConflict,
  type GrowthRepository,
  type GrowthSqlClient,
  type GrowthTransactionRunner,
} from "@/db/repositories/growth-repository";
import { runSerializableWithRetry } from "@/db/serializable-retry";
import { parseSharedResearchSet } from "@/domain/shared-research-sets";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PUBLIC_CODE_PATTERN = /^set_[A-Za-z0-9_-]{16,64}$/u;
const IDEMPOTENCY_KEY_PATTERN = /^[^\p{Cc}\p{Cf}]{16,200}$/u;
const MAXIMUM_OWNER_PAGE = 100;

type BuyerStatus = "active" | "review" | "blocked";
type SharedSetItem = Readonly<{ productId: string; quantity: number }>;

export type SharedSetServiceErrorCode =
  | "buyer_inactive"
  | "idempotency_conflict"
  | "invalid_code"
  | "invalid_input"
  | "invalid_items"
  | "invalid_label"
  | "invalid_page"
  | "owner_conflict"
  | "persistence_conflict"
  | "product_unavailable"
  | "unexpected_field"
  | "version_conflict";

export class SharedSetServiceError extends Error {
  readonly code: SharedSetServiceErrorCode;
  readonly field: string | null;

  constructor(code: SharedSetServiceErrorCode, field: string | null = null) {
    super(code);
    this.name = "SharedSetServiceError";
    this.code = code;
    this.field = field;
  }
}

export type SharedSetMutationResult = Readonly<{
  status: "applied" | "idempotent";
  set: Readonly<{
    code: string;
    label: string;
    active: boolean;
    itemCount: number;
    updatedAt: string;
  }>;
}>;

export type SharedSetMutationInput =
  | Readonly<{
      kind: "create";
      setId: string;
      ownerUserId: string;
      publicCode: string;
      idempotencyKey: string;
      label: string;
      items: readonly SharedSetItem[];
      mutatedAt: Date;
    }>
  | Readonly<{
      kind: "update";
      ownerUserId: string;
      code: string;
      expectedUpdatedAt: string;
      idempotencyKey: string;
      label: string;
      items: readonly SharedSetItem[];
      mutatedAt: Date;
    }>
  | Readonly<{
      kind: "deactivate";
      ownerUserId: string;
      code: string;
      expectedUpdatedAt: string;
      idempotencyKey: string;
      mutatedAt: Date;
    }>;

export type SharedSetMutationPort = (
  input: SharedSetMutationInput,
) => Promise<SharedSetMutationResult>;

type SharedSetGrowthRepository = Pick<
  GrowthRepository,
  | "createSharedResearchSet"
  | "replaceSharedResearchSet"
  | "deactivateSharedResearchSet"
>;

type StoredSharedSet = Readonly<{
  id: string;
  ownerUserId: string;
  code: string;
  label: string;
  active: boolean;
  updatedAt: string;
  items: readonly SharedSetItem[];
}>;

type OwnerSetPage = Readonly<{
  items: readonly StoredSharedSet[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}>;

type CurrentPublicProduct = Readonly<{
  id: string;
  slug: string;
  name: string;
  packageForm: string;
}>;

export type SharedSetReadPort = Readonly<{
  listOwnerSets: (input: Readonly<{
    requestedOwnerUserId: string;
    limit: number;
    offset: number;
  }>) => Promise<OwnerSetPage>;
  loadPublicSet: (code: string) => Promise<StoredSharedSet | null>;
  loadCurrentPublicProducts: (
    productIds: readonly string[],
  ) => Promise<readonly CurrentPublicProduct[]>;
}>;

export type SharedSetReadTransactionRunner = <Value>(
  work: (client: GrowthSqlClient) => Promise<Value>,
  options: Readonly<{ isolationLevel: "serializable"; readOnly: true }>,
) => Promise<Value>;

type MutationProjection = Readonly<{
  status: "created" | "updated" | "deactivated" | "idempotent";
  set: SharedSetMutationResult["set"];
}>;

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpectedField(
  value: Record<string, unknown>,
  allowed: readonly string[],
): string | null {
  const allowedFields = new Set(allowed);
  let current: object | null = value;
  while (current !== null && current !== Object.prototype) {
    for (const key of Reflect.ownKeys(current)) {
      if (typeof key !== "string" || !allowedFields.has(key)) {
        return typeof key === "string" ? key : "";
      }
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return null;
}

function requireExactInput(
  input: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (!isRecord(input) || !fields.every((field) => Object.hasOwn(input, field))) {
    throw new SharedSetServiceError("invalid_input");
  }
  const extra = unexpectedField(input, fields);
  if (extra !== null) throw new SharedSetServiceError("unexpected_field", extra);
  return input;
}

function requireActiveOwner(input: Record<string, unknown>): string {
  if (!UUID_PATTERN.test(String(input.ownerUserId ?? ""))) {
    throw new SharedSetServiceError("invalid_input", "ownerUserId");
  }
  if (input.buyerStatus !== "active") {
    throw new SharedSetServiceError("buyer_inactive", "buyerStatus");
  }
  return input.ownerUserId as string;
}

function requireIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !IDEMPOTENCY_KEY_PATTERN.test(value)
  ) {
    throw new SharedSetServiceError("invalid_input", "idempotencyKey");
  }
  return value;
}

function requireCanonicalTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new SharedSetServiceError("invalid_input", field);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new SharedSetServiceError("invalid_input", field);
  }
  return value;
}

function requireCode(value: unknown): string {
  if (typeof value !== "string" || !PUBLIC_CODE_PATTERN.test(value)) {
    throw new SharedSetServiceError("invalid_code", "code");
  }
  return value;
}

function requireItems(value: unknown): readonly SharedSetItem[] {
  if (!Array.isArray(value)) {
    throw new SharedSetServiceError("invalid_items", "items");
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) {
      throw new SharedSetServiceError("invalid_items", "items");
    }
    const item = value[index];
    if (!isRecord(item) || !Object.hasOwn(item, "productId") || !Object.hasOwn(item, "quantity")) {
      throw new SharedSetServiceError("invalid_items", `items[${index}]`);
    }
    const extra = unexpectedField(item, ["productId", "quantity"]);
    if (extra !== null) {
      throw new SharedSetServiceError("unexpected_field", `items[${index}].${extra}`);
    }
  }
  return value as readonly SharedSetItem[];
}

function parseSetPayload(
  code: string,
  label: unknown,
  itemsInput: unknown,
): Readonly<{ label: string; items: readonly SharedSetItem[] }> {
  const items = requireItems(itemsInput);
  const parsed = parseSharedResearchSet({ code, label, items });
  if (!parsed.ok) {
    const serviceCode = parsed.error.code === "invalid_label"
      ? "invalid_label"
      : parsed.error.code === "unexpected_field"
        ? "unexpected_field"
        : "invalid_items";
    throw new SharedSetServiceError(serviceCode, parsed.error.field);
  }
  if (!parsed.value.items.every(({ productId }) => UUID_PATTERN.test(productId))) {
    throw new SharedSetServiceError("invalid_items", "items");
  }
  return deepFreeze({ label: parsed.value.label, items: parsed.value.items });
}

function mutationTime(clock: () => Date, expectedUpdatedAt?: string): Date {
  const current = clock();
  if (!(current instanceof Date) || !Number.isFinite(current.getTime())) {
    throw new SharedSetServiceError("persistence_conflict");
  }
  if (expectedUpdatedAt === undefined) return new Date(current);
  const minimum = new Date(expectedUpdatedAt).getTime() + 1;
  return new Date(Math.max(current.getTime(), minimum));
}

function projectMutation(
  result: SharedSetMutationResult,
  appliedStatus: Exclude<MutationProjection["status"], "idempotent">,
): MutationProjection {
  return deepFreeze({
    status: result.status === "idempotent" ? "idempotent" : appliedStatus,
    set: {
      code: result.set.code,
      label: result.set.label,
      active: result.set.active,
      itemCount: result.set.itemCount,
      updatedAt: result.set.updatedAt,
    },
  });
}

function publicUnavailable() {
  return Object.freeze({ status: "unavailable" as const });
}

export function deriveSharedSetCreateIdentity(input: Readonly<{
  ownerUserId: string;
  idempotencyKey: string;
  secret: string;
}>): Readonly<{ setId: string; publicCode: string }> {
  if (
    !UUID_PATTERN.test(input.ownerUserId) ||
    !IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey) ||
    input.idempotencyKey.trim() !== input.idempotencyKey ||
    input.secret.length < 32
  ) {
    throw new SharedSetServiceError("invalid_input");
  }
  const seed = `${input.ownerUserId}\u0000${input.idempotencyKey}`;
  const uuidBytes = Buffer.from(
    createHmac("sha256", input.secret)
      .update("propeptiq.shared-set.id.v1\u0000")
      .update(seed)
      .digest()
      .subarray(0, 16),
  );
  uuidBytes[6] = (uuidBytes[6]! & 0x0f) | 0x40;
  uuidBytes[8] = (uuidBytes[8]! & 0x3f) | 0x80;
  const hex = uuidBytes.toString("hex");
  const setId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const publicCode = `set_${createHmac("sha256", input.secret)
    .update("propeptiq.shared-set.public-code.v1\u0000")
    .update(seed)
    .digest("base64url")
    .slice(0, 32)}`;
  return Object.freeze({ setId, publicCode });
}

function repositoryForClient(client: GrowthSqlClient): SharedSetGrowthRepository {
  return createPostgresGrowthRepository({
    runSerializableTransaction: async <Value>(
      work: (transactionClient: GrowthSqlClient) => Promise<Value>,
    ) => work(client),
  });
}

async function defaultCurrentPublicProductIds(
  client: GrowthSqlClient,
  now: Date,
): Promise<readonly string[]> {
  const records = await loadDatabaseCatalogRecords(client);
  if (records.source !== "production") {
    throw new SharedSetServiceError("product_unavailable");
  }
  return Object.freeze(
    buildPublicCatalog(records, { now }).products.map(({ id }) => id),
  );
}

function mapPersistenceConflict(error: unknown): never {
  if (error instanceof SharedSetServiceError) throw error;
  if (error instanceof GrowthPersistenceConflict) {
    if (/stale/iu.test(error.message)) {
      throw new SharedSetServiceError("version_conflict");
    }
    if (/owner conflict/iu.test(error.message)) {
      throw new SharedSetServiceError("owner_conflict");
    }
    if (/receipt conflict|payload conflict/iu.test(error.message)) {
      throw new SharedSetServiceError("idempotency_conflict");
    }
    throw new SharedSetServiceError("persistence_conflict");
  }
  throw error;
}

export function createPostgresSharedSetMutationPort(dependencies: Readonly<{
  runSerializableTransaction: GrowthTransactionRunner;
  retrySleep?: (
    retryNumber: 1 | 2,
    sqlState: "40001" | "40P01",
  ) => Promise<void>;
  loadCurrentPublicProductIds?: (
    client: GrowthSqlClient,
    now: Date,
  ) => Promise<readonly string[]>;
  createRepository?: (client: GrowthSqlClient) => SharedSetGrowthRepository;
}>): SharedSetMutationPort {
  const loadCurrentPublicProductIds =
    dependencies.loadCurrentPublicProductIds ?? defaultCurrentPublicProductIds;
  const createRepository = dependencies.createRepository ?? repositoryForClient;

  return async (input) => {
    try {
      return await runSerializableWithRetry(
        () => dependencies.runSerializableTransaction(
          async (client) => {
            const repository = createRepository(client);
            const validateNewItems = async (
              items: readonly SharedSetItem[],
            ) => {
              const publicProductIds = await loadCurrentPublicProductIds(
                client,
                input.mutatedAt,
              );
              const current = new Set(publicProductIds);
              if (
                current.size !== publicProductIds.length ||
                items.some(({ productId }) => !current.has(productId))
              ) {
                throw new SharedSetServiceError("product_unavailable");
              }
            };

            if (input.kind === "create") {
              const existing = await client.query<StoredSharedSetRow>(
                `SELECT id::text AS id, owner_user_id::text AS "ownerUserId",
                        public_code AS code, label, active,
                        updated_at AS "updatedAt"
                 FROM shared_research_sets
                 WHERE id = $1::uuid OR public_code = $2
                 ORDER BY id LIMIT 2 FOR UPDATE`,
                [input.setId, input.publicCode],
              );
              if (existing.rows.length > 0) {
                const row = existing.rows[0];
                if (existing.rows.length !== 1 || row === undefined) {
                  throw new SharedSetServiceError("idempotency_conflict");
                }
                const storedItems = await loadStoredItems(client, [row.id]);
                const stored = projectStoredSet(
                  row,
                  storedItems.get(row.id) ?? [],
                );
                const desired = [...input.items].sort((left, right) =>
                  left.productId.localeCompare(right.productId),
                );
                const sameItems =
                  stored.items.length === desired.length &&
                  stored.items.every((item, index) =>
                    item.productId === desired[index]!.productId &&
                    item.quantity === desired[index]!.quantity,
                  );
                if (
                  stored.id !== input.setId ||
                  stored.ownerUserId !== input.ownerUserId ||
                  stored.code !== input.publicCode ||
                  stored.label !== input.label ||
                  !stored.active ||
                  !sameItems
                ) {
                  throw new SharedSetServiceError("idempotency_conflict");
                }
                return deepFreeze({
                  status: "idempotent" as const,
                  set: {
                    code: stored.code,
                    label: stored.label,
                    active: stored.active,
                    itemCount: stored.items.length,
                    updatedAt: stored.updatedAt,
                  },
                });
              }
              await validateNewItems(input.items);
              return repository.createSharedResearchSet({
                id: input.setId,
                ownerUserId: input.ownerUserId,
                publicCode: input.publicCode,
                label: input.label,
                items: input.items,
                createdAt: input.mutatedAt,
              });
            }

            const receipts = input.kind === "update"
              ? await client.query<{ idempotencyKey: string }>(
                  `SELECT idempotency_key AS "idempotencyKey"
                   FROM shared_research_set_mutations
                   WHERE idempotency_key = $1
                   ORDER BY idempotency_key LIMIT 2 FOR UPDATE`,
                  [input.idempotencyKey],
                )
              : { rows: [] };
            if (receipts.rows.length > 1) {
              throw new SharedSetServiceError("idempotency_conflict");
            }

            const owned = await client.query<{ id: string }>(
              `SELECT id::text AS id FROM shared_research_sets
               WHERE owner_user_id = $1::uuid AND public_code = $2
               ORDER BY id LIMIT 2 FOR UPDATE`,
              [input.ownerUserId, input.code],
            );
            if (owned.rows.length !== 1 || !UUID_PATTERN.test(owned.rows[0]!.id)) {
              throw new SharedSetServiceError("owner_conflict");
            }
            const setId = owned.rows[0]!.id;
            if (input.kind === "update") {
              if (receipts.rows.length === 0) {
                await validateNewItems(input.items);
              }
              return repository.replaceSharedResearchSet({
                setId,
                ownerUserId: input.ownerUserId,
                idempotencyKey: input.idempotencyKey,
                expectedUpdatedAt: new Date(input.expectedUpdatedAt),
                updatedAt: input.mutatedAt,
                label: input.label,
                items: input.items,
              });
            }
            return repository.deactivateSharedResearchSet({
              setId,
              ownerUserId: input.ownerUserId,
              idempotencyKey: input.idempotencyKey,
              expectedUpdatedAt: new Date(input.expectedUpdatedAt),
              deactivatedAt: input.mutatedAt,
            });
          },
          { isolationLevel: "serializable" },
        ),
        dependencies.retrySleep === undefined
          ? {}
          : { sleep: dependencies.retrySleep },
      );
    } catch (error) {
      return mapPersistenceConflict(error);
    }
  };
}

type StoredSharedSetRow = Readonly<{
  id: string;
  ownerUserId: string;
  code: string;
  label: string;
  active: boolean;
  updatedAt: Date | string;
}>;

function safeReadInteger(value: number | string): number {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new SharedSetServiceError("persistence_conflict");
  }
  return numeric;
}

function readTimestamp(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new SharedSetServiceError("persistence_conflict");
  }
  return parsed.toISOString();
}

async function loadStoredItems(
  client: GrowthSqlClient,
  setIds: readonly string[],
): Promise<Map<string, readonly SharedSetItem[]>> {
  if (setIds.length === 0) return new Map();
  const result = await client.query<{
    sharedSetId?: string;
    productId: string;
    quantity: number | string;
  }>(
    `SELECT shared_set_id::text AS "sharedSetId",
            product_id::text AS "productId", quantity
     FROM shared_research_set_items
     WHERE shared_set_id = ANY($1::uuid[])
     ORDER BY shared_set_id, product_id`,
    [setIds],
  );
  const mutableItems = new Map<string, SharedSetItem[]>();
  for (const setId of setIds) mutableItems.set(setId, []);
  for (const row of result.rows) {
    const sharedSetId = row.sharedSetId ?? (setIds.length === 1 ? setIds[0] : undefined);
    const target = sharedSetId === undefined ? undefined : mutableItems.get(sharedSetId);
    const quantity = safeReadInteger(row.quantity);
    if (
      target === undefined ||
      !UUID_PATTERN.test(row.productId) ||
      quantity < 1 ||
      quantity > 25 ||
      target.some(({ productId }) => productId === row.productId)
    ) {
      throw new SharedSetServiceError("persistence_conflict");
    }
    target.push(Object.freeze({ productId: row.productId, quantity }));
  }
  const items = new Map<string, readonly SharedSetItem[]>();
  for (const [sharedSetId, value] of mutableItems) {
    if (value.length < 2 || value.length > 8) {
      throw new SharedSetServiceError("persistence_conflict");
    }
    items.set(sharedSetId, Object.freeze(value));
  }
  return items;
}

function projectStoredSet(
  row: StoredSharedSetRow,
  items: readonly SharedSetItem[],
): StoredSharedSet {
  if (
    !UUID_PATTERN.test(row.id) ||
    !UUID_PATTERN.test(row.ownerUserId) ||
    !PUBLIC_CODE_PATTERN.test(row.code) ||
    typeof row.label !== "string" ||
    typeof row.active !== "boolean"
  ) {
    throw new SharedSetServiceError("persistence_conflict");
  }
  const parsed = parseSharedResearchSet({ code: row.code, label: row.label, items });
  if (!parsed.ok) throw new SharedSetServiceError("persistence_conflict");
  return deepFreeze({
    id: row.id,
    ownerUserId: row.ownerUserId,
    code: parsed.value.code,
    label: parsed.value.label,
    active: row.active,
    updatedAt: readTimestamp(row.updatedAt),
    items: parsed.value.items,
  });
}

export function createPostgresSharedSetReadPort(dependencies: Readonly<{
  runReadTransaction: SharedSetReadTransactionRunner;
  loadCurrentPublicProducts: (
    productIds: readonly string[],
  ) => Promise<readonly CurrentPublicProduct[]>;
}>): SharedSetReadPort {
  return Object.freeze({
    async listOwnerSets(input) {
      return dependencies.runReadTransaction(
        async (client) => {
          await client.query("SET TRANSACTION READ ONLY");
          const total = await client.query<{ totalCount: number | string }>(
            `SELECT count(*)::int AS "totalCount"
             FROM shared_research_sets WHERE owner_user_id = $1::uuid`,
            [input.requestedOwnerUserId],
          );
          const sets = await client.query<StoredSharedSetRow>(
            `SELECT id::text AS id, owner_user_id::text AS "ownerUserId",
                    public_code AS code, label, active,
                    updated_at AS "updatedAt"
             FROM shared_research_sets
             WHERE owner_user_id = $1::uuid
             ORDER BY updated_at DESC, id DESC
             LIMIT $2 OFFSET $3`,
            [input.requestedOwnerUserId, input.limit, input.offset],
          );
          if (sets.rows.some(({ ownerUserId }) => ownerUserId !== input.requestedOwnerUserId)) {
            throw new SharedSetServiceError("owner_conflict");
          }
          const storedItems = await loadStoredItems(
            client,
            sets.rows.map(({ id }) => id),
          );
          const totalCount = safeReadInteger(total.rows[0]?.totalCount ?? -1);
          return deepFreeze({
            items: sets.rows.map((row) =>
              projectStoredSet(row, storedItems.get(row.id) ?? []),
            ),
            totalCount,
            limit: input.limit,
            offset: input.offset,
            hasMore:
              totalCount > input.offset &&
              totalCount - input.offset > sets.rows.length,
          });
        },
        { isolationLevel: "serializable", readOnly: true },
      );
    },

    async loadPublicSet(code) {
      return dependencies.runReadTransaction(
        async (client) => {
          await client.query("SET TRANSACTION READ ONLY");
          const sets = await client.query<StoredSharedSetRow>(
            `SELECT id::text AS id, owner_user_id::text AS "ownerUserId",
                    public_code AS code, label, active,
                    updated_at AS "updatedAt"
             FROM shared_research_sets
             WHERE public_code = $1 AND active = true
             ORDER BY id LIMIT 2`,
            [code],
          );
          const row = sets.rows[0];
          if (
            sets.rows.length !== 1 ||
            row === undefined ||
            row.active !== true ||
            row.code !== code
          ) {
            return null;
          }
          const storedItems = await loadStoredItems(client, [row.id]);
          return projectStoredSet(row, storedItems.get(row.id) ?? []);
        },
        { isolationLevel: "serializable", readOnly: true },
      );
    },

    loadCurrentPublicProducts(productIds) {
      return dependencies.loadCurrentPublicProducts(productIds);
    },
  });
}

export function createSharedSetService(dependencies: Readonly<{
  clock: () => Date;
  deriveCreateIdentity?: (input: Readonly<{
    ownerUserId: string;
    idempotencyKey: string;
  }>) => Readonly<{ setId: string; publicCode: string }>;
  mutate?: SharedSetMutationPort;
  reads?: SharedSetReadPort;
}>) {
  return Object.freeze({
    async createSet(input: unknown): Promise<MutationProjection> {
      if (
        dependencies.deriveCreateIdentity === undefined ||
        dependencies.mutate === undefined
      ) {
        throw new SharedSetServiceError("persistence_conflict");
      }
      const exact = requireExactInput(input, [
        "ownerUserId",
        "buyerStatus",
        "idempotencyKey",
        "label",
        "items",
      ]);
      const ownerUserId = requireActiveOwner(exact);
      const idempotencyKey = requireIdempotencyKey(exact.idempotencyKey);
      const identity = dependencies.deriveCreateIdentity({ ownerUserId, idempotencyKey });
      if (!UUID_PATTERN.test(identity.setId) || !PUBLIC_CODE_PATTERN.test(identity.publicCode)) {
        throw new SharedSetServiceError("persistence_conflict");
      }
      const payload = parseSetPayload(identity.publicCode, exact.label, exact.items);
      const result = await dependencies.mutate({
        kind: "create",
        setId: identity.setId,
        ownerUserId,
        publicCode: identity.publicCode,
        idempotencyKey,
        label: payload.label,
        items: payload.items,
        mutatedAt: mutationTime(dependencies.clock),
      });
      return projectMutation(result, "created");
    },

    async updateSet(input: unknown): Promise<MutationProjection> {
      if (dependencies.mutate === undefined) {
        throw new SharedSetServiceError("persistence_conflict");
      }
      const exact = requireExactInput(input, [
        "ownerUserId",
        "buyerStatus",
        "code",
        "expectedUpdatedAt",
        "idempotencyKey",
        "label",
        "items",
      ]);
      const ownerUserId = requireActiveOwner(exact);
      const code = requireCode(exact.code);
      const expectedUpdatedAt = requireCanonicalTimestamp(
        exact.expectedUpdatedAt,
        "expectedUpdatedAt",
      );
      const idempotencyKey = requireIdempotencyKey(exact.idempotencyKey);
      const payload = parseSetPayload(code, exact.label, exact.items);
      const result = await dependencies.mutate({
        kind: "update",
        ownerUserId,
        code,
        expectedUpdatedAt,
        idempotencyKey,
        label: payload.label,
        items: payload.items,
        mutatedAt: mutationTime(dependencies.clock, expectedUpdatedAt),
      });
      return projectMutation(result, "updated");
    },

    async deactivateSet(input: unknown): Promise<MutationProjection> {
      if (dependencies.mutate === undefined) {
        throw new SharedSetServiceError("persistence_conflict");
      }
      const exact = requireExactInput(input, [
        "ownerUserId",
        "buyerStatus",
        "code",
        "expectedUpdatedAt",
        "idempotencyKey",
      ]);
      const ownerUserId = requireActiveOwner(exact);
      const code = requireCode(exact.code);
      const expectedUpdatedAt = requireCanonicalTimestamp(
        exact.expectedUpdatedAt,
        "expectedUpdatedAt",
      );
      const idempotencyKey = requireIdempotencyKey(exact.idempotencyKey);
      const result = await dependencies.mutate({
        kind: "deactivate",
        ownerUserId,
        code,
        expectedUpdatedAt,
        idempotencyKey,
        mutatedAt: mutationTime(dependencies.clock, expectedUpdatedAt),
      });
      return projectMutation(result, "deactivated");
    },

    async listOwnerSets(input: unknown) {
      if (dependencies.reads === undefined) {
        throw new SharedSetServiceError("persistence_conflict");
      }
      const exact = requireExactInput(input, [
        "authenticatedOwnerUserId",
        "requestedOwnerUserId",
        "buyerStatus",
        "limit",
        "offset",
      ]);
      if (
        !UUID_PATTERN.test(String(exact.authenticatedOwnerUserId ?? "")) ||
        !UUID_PATTERN.test(String(exact.requestedOwnerUserId ?? ""))
      ) {
        throw new SharedSetServiceError("invalid_input");
      }
      if (exact.authenticatedOwnerUserId !== exact.requestedOwnerUserId) {
        throw new SharedSetServiceError("owner_conflict");
      }
      if (!(["active", "review", "blocked"] as BuyerStatus[]).includes(exact.buyerStatus as BuyerStatus)) {
        throw new SharedSetServiceError("invalid_input", "buyerStatus");
      }
      if (
        !Number.isSafeInteger(exact.limit) ||
        (exact.limit as number) < 1 ||
        (exact.limit as number) > MAXIMUM_OWNER_PAGE ||
        !Number.isSafeInteger(exact.offset) ||
        (exact.offset as number) < 0
      ) {
        throw new SharedSetServiceError("invalid_page");
      }
      const page = await dependencies.reads.listOwnerSets({
        requestedOwnerUserId: exact.requestedOwnerUserId as string,
        limit: exact.limit as number,
        offset: exact.offset as number,
      });
      return deepFreeze({
        items: page.items.map((set) => ({
          code: set.code,
          label: set.label,
          active: set.active,
          itemCount: set.items.length,
          updatedAt: set.updatedAt,
          items: set.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        })),
        totalCount: page.totalCount,
        limit: page.limit,
        offset: page.offset,
        hasMore: page.hasMore,
      });
    },

    async resolvePublicSet(publicCode: unknown) {
      if (typeof publicCode !== "string" || !PUBLIC_CODE_PATTERN.test(publicCode)) {
        return publicUnavailable();
      }
      try {
        if (dependencies.reads === undefined) return publicUnavailable();
        const stored = await dependencies.reads.loadPublicSet(publicCode);
        if (stored === null || stored.active !== true || stored.code !== publicCode) {
          return publicUnavailable();
        }
        const parsed = parseSharedResearchSet({
          code: stored.code,
          label: stored.label,
          items: stored.items,
        });
        if (!parsed.ok) return publicUnavailable();
        const currentProducts = await dependencies.reads.loadCurrentPublicProducts(
          parsed.value.items.map(({ productId }) => productId),
        );
        const products = new Map<string, CurrentPublicProduct>();
        for (const product of currentProducts) {
          if (
            !isRecord(product) ||
            typeof product.id !== "string" ||
            typeof product.slug !== "string" ||
            typeof product.name !== "string" ||
            typeof product.packageForm !== "string" ||
            !parsed.value.items.some(({ productId }) => productId === product.id) ||
            products.has(product.id)
          ) {
            return publicUnavailable();
          }
          products.set(product.id, product);
        }
        const projectedItems = parsed.value.items.flatMap((item) => {
          const product = products.get(item.productId);
          return product
            ? [{
                productId: item.productId,
                quantity: item.quantity,
                slug: product.slug,
                name: product.name,
                packageForm: product.packageForm,
              }]
            : [];
        });
        const omittedItemCount = parsed.value.items.length - projectedItems.length;
        const omissionNotice = omittedItemCount === 0
          ? null
          : omittedItemCount === 1
            ? "One saved product is no longer available in the current public catalog and was omitted."
            : `${omittedItemCount} saved products are no longer available in the current public catalog and were omitted.`;
        return deepFreeze({
          status: "available" as const,
          set: {
            code: parsed.value.code,
            label: parsed.value.label,
            items: projectedItems,
            omittedItemCount,
            omissionNotice,
          },
        });
      } catch {
        return publicUnavailable();
      }
    },
  });
}
