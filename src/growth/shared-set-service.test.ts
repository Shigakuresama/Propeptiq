import { describe, expect, it, vi } from "vitest";

import {
  createPostgresSharedSetMutationPort,
  createPostgresSharedSetReadPort,
  createSharedSetService,
  deriveSharedSetCreateIdentity,
  SharedSetServiceError,
  type SharedSetMutationPort,
  type SharedSetReadPort,
} from "./shared-set-service";
import type {
  GrowthRepository,
  GrowthSqlClient,
} from "@/db/repositories/growth-repository";

const now = new Date("2026-08-28T20:00:00.000Z");
const ownerUserId = "5c000000-0000-4000-8000-000000000001";
const otherOwnerUserId = "5c000000-0000-4000-8000-000000000002";
const setId = "5c000000-0000-4000-8000-000000000003";
const productOne = "5c000000-0000-4000-8000-000000000011";
const productTwo = "5c000000-0000-4000-8000-000000000012";
const productThree = "5c000000-0000-4000-8000-000000000013";
const code = "set_Task5COpaqueCodeA";
const idempotencyKey = "task-5c-create-idempotency-0001";

function queryPort(
  query: (
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: readonly object[] }>>,
): GrowthSqlClient["query"] {
  return async <Row extends object>(sql: string, params?: readonly unknown[]) => {
    const result = await query(sql, params);
    return { rows: [...result.rows] as Row[] };
  };
}

const items = Object.freeze([
  Object.freeze({ productId: productOne, quantity: 1 }),
  Object.freeze({ productId: productTwo, quantity: 25 }),
]);

type StoredSet = Readonly<{
  id: string;
  ownerUserId: string;
  code: string;
  label: string;
  active: boolean;
  updatedAt: string;
  items: readonly Readonly<{ productId: string; quantity: number }>[];
}>;

function createHarness() {
  let stored: StoredSet | null = null;
  const receipts = new Map<string, string>();
  const activeProductIds = new Set([productOne, productTwo, productThree]);

  const mutate: SharedSetMutationPort = vi.fn(async (
    input: Parameters<SharedSetMutationPort>[0],
  ) => {
    const payload = JSON.stringify(input);
    const prior = receipts.get(input.idempotencyKey);
    if (prior !== undefined) {
      if (prior !== payload || stored === null) {
        throw new SharedSetServiceError("idempotency_conflict");
      }
      return Object.freeze({
        status: "idempotent" as const,
        set: Object.freeze({
          code: stored.code,
          label: stored.label,
          active: stored.active,
          itemCount: stored.items.length,
          updatedAt: stored.updatedAt,
        }),
      });
    }

    if (input.kind !== "deactivate") {
      if (input.items.some(({ productId }) => !activeProductIds.has(productId))) {
        throw new SharedSetServiceError("product_unavailable");
      }
    }

    if (input.kind === "create") {
      stored = Object.freeze({
        id: input.setId,
        ownerUserId: input.ownerUserId,
        code: input.publicCode,
        label: input.label,
        active: true,
        updatedAt: input.mutatedAt.toISOString(),
        items: input.items,
      });
    } else {
      if (
        stored === null ||
        stored.ownerUserId !== input.ownerUserId ||
        stored.code !== input.code
      ) {
        throw new SharedSetServiceError("owner_conflict");
      }
      if (!stored.active || stored.updatedAt !== input.expectedUpdatedAt) {
        throw new SharedSetServiceError("version_conflict");
      }
      stored = Object.freeze({
        ...stored,
        ...(input.kind === "update"
          ? { label: input.label, items: input.items }
          : { active: false }),
        updatedAt: input.mutatedAt.toISOString(),
      });
    }

    receipts.set(input.idempotencyKey, payload);
    return Object.freeze({
      status: "applied" as const,
      set: Object.freeze({
        code: stored.code,
        label: stored.label,
        active: stored.active,
        itemCount: stored.items.length,
        updatedAt: stored.updatedAt,
      }),
    });
  });

  const reads: SharedSetReadPort = Object.freeze({
    listOwnerSets: vi.fn(async ({ requestedOwnerUserId, limit, offset }: Parameters<SharedSetReadPort["listOwnerSets"]>[0]) => {
      const ownerItems: StoredSet[] = stored !== null && stored.ownerUserId === requestedOwnerUserId
        ? [stored]
        : [];
      return Object.freeze({
        items: Object.freeze(ownerItems.slice(offset, offset + limit)),
        totalCount: ownerItems.length,
        limit,
        offset,
        hasMore: ownerItems.length > offset + limit,
      });
    }),
    loadPublicSet: vi.fn(async (publicCode: string) => {
      if (stored?.active !== true || stored.code !== publicCode) return null;
      return stored;
    }),
    loadCurrentPublicProducts: vi.fn(async (productIds: readonly string[]) =>
      Object.freeze(
        productIds
          .filter((productId) => productId !== productTwo)
          .map((productId) =>
            Object.freeze({
              id: productId,
              slug: productId === productOne ? "reference-one" : "reference-three",
              name: productId === productOne ? "Reference One" : "Reference Three",
              packageForm: "sealed research unit",
              price: { amountMinor: 1 },
              availableQuantity: 999,
              supplierName: "must not escape",
            }),
          ),
      ),
    ),
  });

  const service = createSharedSetService({
    clock: () => new Date(now),
    deriveCreateIdentity: () => Object.freeze({ setId, publicCode: code }),
    mutate,
    reads,
  });

  return {
    service,
    mutate,
    reads,
    setActiveProduct(productId: string, active: boolean) {
      if (active) activeProductIds.add(productId);
      else activeProductIds.delete(productId);
    },
  };
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    ownerUserId,
    buyerStatus: "active",
    idempotencyKey,
    label: "Analytical reference set",
    items,
    ...overrides,
  };
}

describe("shared research set service", () => {
  it("creates a frozen set from exactly 2–8 unique active production product IDs with integer quantities 1–25", async () => {
    const { service, mutate } = createHarness();

    const result = await service.createSet(createInput());

    expect(result).toEqual({
      status: "created",
      set: {
        code,
        label: "Analytical reference set",
        active: true,
        itemCount: 2,
        updatedAt: now.toISOString(),
      },
    });
    expect(mutate).toHaveBeenCalledWith({
      kind: "create",
      setId,
      ownerUserId,
      publicCode: code,
      idempotencyKey,
      label: "Analytical reference set",
      items,
      mutatedAt: now,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.set)).toBe(true);
  });

  it.each([
    ["one item", [items[0]], "invalid_items"],
    [
      "nine items",
      Array.from({ length: 9 }, (_, index) => ({
        productId: `5c000000-0000-4000-8000-0000000001${index + 1}`,
        quantity: 1,
      })),
      "invalid_items",
    ],
    ["duplicate product", [items[0], { ...items[1], productId: productOne }], "invalid_items"],
    ["zero quantity", [{ ...items[0], quantity: 0 }, items[1]], "invalid_items"],
    ["quantity 26", [{ ...items[0], quantity: 26 }, items[1]], "invalid_items"],
    ["fractional quantity", [{ ...items[0], quantity: 1.5 }, items[1]], "invalid_items"],
  ] as const)("rejects %s before persistence", async (_label, candidate, errorCode) => {
    const { service, mutate } = createHarness();

    await expect(service.createSet(createInput({ items: candidate }))).rejects.toMatchObject({
      code: errorCode,
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("rejects sparse item arrays before persistence", async () => {
    const sparse = [items[0]];
    sparse.length = 2;
    const { service, mutate } = createHarness();

    await expect(service.createSet(createInput({ items: sparse }))).rejects.toMatchObject({
      code: "invalid_items",
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each([
    "price",
    "description",
    "claims",
    "discountRate",
    "inventory",
    "destination",
    "lot",
    "coa",
    "supplier",
    "protocol",
    "dose",
    "use",
    "ownerIdentity",
    "email",
  ])("rejects forbidden top-level key %s", async (key) => {
    const { service, mutate } = createHarness();

    await expect(service.createSet(createInput({ [key]: "browser authority" }))).rejects.toMatchObject({
      code: "unexpected_field",
      field: key,
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each([
    "price",
    "description",
    "claim",
    "discount",
    "inventory",
    "destination",
    "lot",
    "coa",
    "supplier",
    "protocol",
    "dose",
    "use",
  ])("rejects forbidden item key %s", async (key) => {
    const { service, mutate } = createHarness();
    const hostileItems = [{ ...items[0], [key]: "browser authority" }, items[1]];

    await expect(service.createSet(createInput({ items: hostileItems }))).rejects.toMatchObject({
      code: "unexpected_field",
      field: `items[0].${key}`,
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each([
    ["blank", "   "],
    ["over 120 characters", "a".repeat(121)],
    ["prohibited treatment language", "Treatment protocol set"],
    ["unsupported purity claim", "Guaranteed 99.9% pure set"],
    ["human-use language", "Human use research set"],
  ])("rejects a %s label through the existing content policy", async (_label, label) => {
    const { service, mutate } = createHarness();

    await expect(service.createSet(createInput({ label }))).rejects.toMatchObject({
      code: "invalid_label",
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each(["review", "blocked"] as const)(
    "rejects a %s buyer before persistence",
    async (buyerStatus) => {
      const { service, mutate } = createHarness();

      await expect(service.createSet(createInput({ buyerStatus }))).rejects.toMatchObject({
        code: "buyer_inactive",
      });
      expect(mutate).not.toHaveBeenCalled();
    },
  );

  it("fails closed when any requested production product is not active", async () => {
    const { service, setActiveProduct } = createHarness();
    setActiveProduct(productTwo, false);

    await expect(service.createSet(createInput())).rejects.toMatchObject({
      code: "product_unavailable",
    });
  });

  it("enforces owner scope and expected-version CAS for update and deactivate", async () => {
    const { service } = createHarness();
    const created = await service.createSet(createInput());

    await expect(service.updateSet({
      ownerUserId: otherOwnerUserId,
      buyerStatus: "active",
      code,
      expectedUpdatedAt: created.set.updatedAt,
      idempotencyKey: "task-5c-update-owner-conflict",
      label: "Updated neutral set",
      items,
    })).rejects.toMatchObject({ code: "owner_conflict" });

    await expect(service.updateSet({
      ownerUserId,
      buyerStatus: "active",
      code,
      expectedUpdatedAt: "2026-08-28T19:59:59.000Z",
      idempotencyKey: "task-5c-update-stale-version",
      label: "Updated neutral set",
      items,
    })).rejects.toMatchObject({ code: "version_conflict" });

    const updated = await service.updateSet({
      ownerUserId,
      buyerStatus: "active",
      code,
      expectedUpdatedAt: created.set.updatedAt,
      idempotencyKey: "task-5c-update-idempotency-0001",
      label: "Updated neutral set",
      items,
    });
    expect(updated.status).toBe("updated");

    const deactivated = await service.deactivateSet({
      ownerUserId,
      buyerStatus: "active",
      code,
      expectedUpdatedAt: updated.set.updatedAt,
      idempotencyKey: "task-5c-deactivate-idempotency-0001",
    });
    expect(deactivated).toMatchObject({ status: "deactivated", set: { active: false } });
  });

  it("returns deterministic replay and idempotency conflicts", async () => {
    const { service } = createHarness();

    const first = await service.createSet(createInput());
    const replay = await service.createSet(createInput());
    expect(replay).toEqual({ ...first, status: "idempotent" });

    await expect(service.createSet(createInput({ label: "Changed payload" }))).rejects.toMatchObject({
      code: "idempotency_conflict",
    });
  });

  it("keeps owner reads private and bounded", async () => {
    const { service, reads } = createHarness();
    await service.createSet(createInput());

    await expect(service.listOwnerSets({
      authenticatedOwnerUserId: ownerUserId,
      requestedOwnerUserId: otherOwnerUserId,
      buyerStatus: "active",
      limit: 10,
      offset: 0,
    })).rejects.toMatchObject({ code: "owner_conflict" });
    expect(reads.listOwnerSets).not.toHaveBeenCalled();

    await expect(service.listOwnerSets({
      authenticatedOwnerUserId: ownerUserId,
      requestedOwnerUserId: ownerUserId,
      buyerStatus: "active",
      limit: 101,
      offset: 0,
    })).rejects.toMatchObject({ code: "invalid_page" });
    expect(reads.listOwnerSets).not.toHaveBeenCalled();

    const result = await service.listOwnerSets({
      authenticatedOwnerUserId: ownerUserId,
      requestedOwnerUserId: ownerUserId,
      buyerStatus: "active",
      limit: 10,
      offset: 0,
    });
    expect(result.items).toHaveLength(1);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
  });

  it("projects a public set without owner or untrusted commerce facts and truthfully omits unavailable products", async () => {
    const { service } = createHarness();
    await service.createSet(createInput());

    const result = await service.resolvePublicSet(code);

    expect(result).toEqual({
      status: "available",
      set: {
        code,
        label: "Analytical reference set",
        items: [
          {
            productId: productOne,
            quantity: 1,
            slug: "reference-one",
            name: "Reference One",
            packageForm: "sealed research unit",
          },
        ],
        omittedItemCount: 1,
        omissionNotice:
          "One saved product is no longer available in the current public catalog and was omitted.",
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(ownerUserId);
    expect(serialized).not.toMatch(/price|discount|inventory|availableQuantity|supplier|lot|coa|claim/iu);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(Object.isFrozen(result.set)).toBe(true);
    expect(Object.isFrozen(result.set.items)).toBe(true);
  });

  it("returns the same non-enumerating unavailable result for malformed, missing, and deactivated codes", async () => {
    const { service } = createHarness();
    const unavailable = Object.freeze({ status: "unavailable" as const });

    await expect(service.resolvePublicSet("descriptive-set-name")).resolves.toEqual(unavailable);
    await expect(service.resolvePublicSet("set_UnknownOpaqueCode1")).resolves.toEqual(unavailable);

    const created = await service.createSet(createInput());
    await service.deactivateSet({
      ownerUserId,
      buyerStatus: "active",
      code,
      expectedUpdatedAt: created.set.updatedAt,
      idempotencyKey: "task-5c-deactivate-public-0001",
    });
    await expect(service.resolvePublicSet(code)).resolves.toEqual(unavailable);
  });
});

describe("shared research set production mutation adapter", () => {
  it("derives stable opaque create identity from owner and idempotency without exposing either", () => {
    const secret = "task-5c-deterministic-set-identity-secret-0001";
    const first = deriveSharedSetCreateIdentity({
      ownerUserId,
      idempotencyKey,
      secret,
    });
    const replay = deriveSharedSetCreateIdentity({
      ownerUserId,
      idempotencyKey,
      secret,
    });
    const changed = deriveSharedSetCreateIdentity({
      ownerUserId,
      idempotencyKey: "task-5c-create-idempotency-0002",
      secret,
    });

    expect(first).toEqual(replay);
    expect(first).not.toEqual(changed);
    expect(first.setId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(first.publicCode).toMatch(/^set_[A-Za-z0-9_-]{32}$/u);
    expect(JSON.stringify(first)).not.toContain(ownerUserId);
    expect(JSON.stringify(first)).not.toContain(idempotencyKey);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("checks all requested IDs against current public production products inside the serializable mutation", async () => {
    let durableWrite = false;
    const createSharedResearchSet = vi.fn<GrowthRepository["createSharedResearchSet"]>(async () => {
      durableWrite = true;
      return Object.freeze({
        status: "applied" as const,
        set: Object.freeze({
          code,
          label: "Analytical reference set",
          active: true,
          itemCount: 2,
          updatedAt: now.toISOString(),
        }),
      });
    });
    const replaceSharedResearchSet = vi.fn<GrowthRepository["replaceSharedResearchSet"]>();
    const deactivateSharedResearchSet = vi.fn<GrowthRepository["deactivateSharedResearchSet"]>();
    const transaction = vi.fn(async (work) => {
      try {
        return await work({ query: vi.fn(async () => ({ rows: [] })) });
      } catch (error) {
        durableWrite = false;
        throw error;
      }
    });
    const mutation = createPostgresSharedSetMutationPort({
      runSerializableTransaction: transaction,
      loadCurrentPublicProductIds: async () => Object.freeze([productOne]),
      createRepository: () => ({
        createSharedResearchSet,
        replaceSharedResearchSet,
        deactivateSharedResearchSet,
      }),
    });

    await expect(mutation({
      kind: "create",
      setId,
      ownerUserId,
      publicCode: code,
      idempotencyKey,
      label: "Analytical reference set",
      items,
      mutatedAt: now,
    })).rejects.toMatchObject({ code: "product_unavailable" });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "serializable",
    });
    expect(createSharedResearchSet).not.toHaveBeenCalled();
    expect(durableWrite).toBe(false);
    expect(replaceSharedResearchSet).not.toHaveBeenCalled();
    expect(deactivateSharedResearchSet).not.toHaveBeenCalled();
  });

  it("replays an exact durable create at a later clock and conflicts changed payload reuse", async () => {
    const createSharedResearchSet = vi.fn<GrowthRepository["createSharedResearchSet"]>();
    const query = vi.fn(async (sql: string) => {
      if (/FROM shared_research_sets/is.test(sql)) {
        return { rows: [{
          id: setId,
          ownerUserId,
          code,
          label: "Analytical reference set",
          active: true,
          updatedAt: now,
        }] };
      }
      return { rows: items.map((item) => ({ sharedSetId: setId, ...item })) };
    });
    const loadCurrentPublicProductIds = vi.fn(async () => Object.freeze([] as string[]));
    const mutation = createPostgresSharedSetMutationPort({
      runSerializableTransaction: async (work) => work({ query: queryPort(query) }),
      loadCurrentPublicProductIds,
      createRepository: () => ({
        createSharedResearchSet,
        replaceSharedResearchSet: vi.fn(),
        deactivateSharedResearchSet: vi.fn(),
      }),
    });
    const replayAt = new Date("2026-08-28T20:05:00.000Z");

    await expect(mutation({
      kind: "create",
      setId,
      ownerUserId,
      publicCode: code,
      idempotencyKey,
      label: "Analytical reference set",
      items,
      mutatedAt: replayAt,
    })).resolves.toEqual({
      status: "idempotent",
      set: {
        code,
        label: "Analytical reference set",
        active: true,
        itemCount: 2,
        updatedAt: now.toISOString(),
      },
    });
    expect(createSharedResearchSet).not.toHaveBeenCalled();
    expect(loadCurrentPublicProductIds).not.toHaveBeenCalled();

    await expect(mutation({
      kind: "create",
      setId,
      ownerUserId,
      publicCode: code,
      idempotencyKey,
      label: "Changed payload",
      items,
      mutatedAt: replayAt,
    })).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("returns a durable update receipt without rechecking later product availability", async () => {
    const updateReceipt = Object.freeze({
      status: "idempotent" as const,
      set: Object.freeze({
        code,
        label: "Updated neutral set",
        active: true,
        itemCount: 2,
        updatedAt: "2026-08-28T20:00:00.001Z",
      }),
    });
    const loadCurrentPublicProductIds = vi.fn(async () => Object.freeze([] as string[]));
    const replaceSharedResearchSet = vi.fn(async () => updateReceipt);
    const query = vi.fn(async () => ({ rows: [{ id: setId }] }));
    const mutation = createPostgresSharedSetMutationPort({
      runSerializableTransaction: async (work) => work({ query: queryPort(query) }),
      loadCurrentPublicProductIds,
      createRepository: () => ({
        createSharedResearchSet: vi.fn(),
        replaceSharedResearchSet,
        deactivateSharedResearchSet: vi.fn(),
      }),
    });

    await expect(mutation({
      kind: "update",
      ownerUserId,
      code,
      expectedUpdatedAt: now.toISOString(),
      idempotencyKey: "task-5c-update-replay-0001",
      label: "Updated neutral set",
      items,
      mutatedAt: new Date("2026-08-28T20:05:00.000Z"),
    })).resolves.toEqual(updateReceipt);
    expect(loadCurrentPublicProductIds).not.toHaveBeenCalled();
  });

  it("resolves the owned set privately and forwards exact CAS and receipt inputs", async () => {
    const replacement = Object.freeze({
      status: "applied" as const,
      set: Object.freeze({
        code,
        label: "Updated neutral set",
        active: true,
        itemCount: 2,
        updatedAt: now.toISOString(),
      }),
    });
    const replaceSharedResearchSet = vi.fn(async () => replacement);
    const query = vi.fn(async () => ({ rows: [{ id: setId }] }));
    const mutation = createPostgresSharedSetMutationPort({
      runSerializableTransaction: async (work) => work({ query: queryPort(query) }),
      loadCurrentPublicProductIds: async () => Object.freeze([productOne, productTwo]),
      createRepository: () => ({
        createSharedResearchSet: vi.fn(),
        replaceSharedResearchSet,
        deactivateSharedResearchSet: vi.fn(),
      }),
    });
    const mutatedAt = new Date("2026-08-28T20:00:00.001Z");

    await expect(mutation({
      kind: "update",
      ownerUserId,
      code,
      expectedUpdatedAt: now.toISOString(),
      idempotencyKey: "task-5c-update-adapter-0001",
      label: "Updated neutral set",
      items,
      mutatedAt,
    })).resolves.toEqual(replacement);
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/owner_user_id.*public_code/is), [
      ownerUserId,
      code,
    ]);
    expect(replaceSharedResearchSet).toHaveBeenCalledWith({
      setId,
      ownerUserId,
      idempotencyKey: "task-5c-update-adapter-0001",
      expectedUpdatedAt: now,
      updatedAt: mutatedAt,
      label: "Updated neutral set",
      items,
    });
  });
});

describe("shared research set private/public read adapter", () => {
  it("loads only the requested owner's bounded set page and owned item IDs", async () => {
    const query = vi.fn(async (sql: string) => {
      if (/SET TRANSACTION READ ONLY/i.test(sql)) return { rows: [] };
      if (/count\(\*\).*shared_research_sets/is.test(sql)) {
        return { rows: [{ totalCount: 1 }] };
      }
      if (/FROM shared_research_sets.*LIMIT/is.test(sql)) {
        return {
          rows: [{
            id: setId,
            ownerUserId,
            code,
            label: "Analytical reference set",
            active: true,
            updatedAt: now,
          }],
        };
      }
      return { rows: items };
    });
    const reads = createPostgresSharedSetReadPort({
      runReadTransaction: async (work) => work({ query: queryPort(query) }),
      loadCurrentPublicProducts: async () => [],
    });

    await expect(reads.listOwnerSets({
      requestedOwnerUserId: ownerUserId,
      limit: 10,
      offset: 0,
    })).resolves.toEqual({
      items: [{
        id: setId,
        ownerUserId,
        code,
        label: "Analytical reference set",
        active: true,
        updatedAt: now.toISOString(),
        items,
      }],
      totalCount: 1,
      limit: 10,
      offset: 0,
      hasMore: false,
    });
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/owner_user_id = \$1::uuid/is), [
      ownerUserId,
      10,
      0,
    ]);
  });

  it("makes missing, inactive, and malformed public rows indistinguishable", async () => {
    for (const rows of [
      [],
      [{ id: setId, ownerUserId, code, label: "Analytical reference set", active: false, updatedAt: now }],
      [
        { id: setId, ownerUserId, code, label: "Analytical reference set", active: true, updatedAt: now },
        { id: "5c000000-0000-4000-8000-000000000099", ownerUserId, code, label: "Duplicate", active: true, updatedAt: now },
      ],
    ]) {
      const query = vi.fn(async (sql: string) =>
        /SET TRANSACTION READ ONLY/i.test(sql) ? { rows: [] } : { rows },
      );
      const reads = createPostgresSharedSetReadPort({
        runReadTransaction: async (work) => work({ query: queryPort(query) }),
        loadCurrentPublicProducts: async () => [],
      });

      await expect(reads.loadPublicSet(code)).resolves.toBeNull();
    }
  });
});
