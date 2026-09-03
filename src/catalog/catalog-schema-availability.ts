/** PostgreSQL's undefined-table state, restricted to the optional catalog schema. */
export const MISSING_CATALOG_SCHEMA_SQLSTATE = "42P01" as const;

/** Safe diagnostic emitted when the optional catalog schema is unavailable. */
export const CATALOG_SCHEMA_UNAVAILABLE_DIAGNOSTIC =
  "STOREFRONT_CATALOG_DATABASE_UNAVAILABLE" as const;

/**
 * Reads only an own data property so inherited values, accessors, and hostile
 * proxy traps cannot turn an unrelated database error into a fallback.
 */
export function hasOwnStringSqlState(
  error: unknown,
  sqlState: string,
): boolean {
  if (typeof error !== "object" || error === null) return false;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor !== undefined && "value" in descriptor &&
      typeof descriptor.value === "string" && descriptor.value === sqlState;
  } catch {
    return false;
  }
}

export function isMissingCatalogSchemaError(error: unknown): boolean {
  return hasOwnStringSqlState(error, MISSING_CATALOG_SCHEMA_SQLSTATE);
}
