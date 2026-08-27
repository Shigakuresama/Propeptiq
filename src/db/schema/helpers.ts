import { sql, type SQLWrapper } from "drizzle-orm";
import { bigint, timestamp } from "drizzle-orm/pg-core";

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
export const money = (name: string) =>
  bigint(name, { mode: "number" }).notNull();
export const nullableMoney = (name: string) =>
  bigint(name, { mode: "number" });

export const nonblank = (column: SQLWrapper) =>
  sql`length(btrim(${column})) > 0`;
export const sha256 = (column: SQLWrapper) =>
  sql`${column} ~ '^[0-9a-f]{64}$'`;
export const currency = (column: SQLWrapper) =>
  sql`${column} ~ '^[A-Z]{3}$'`;
export const safeNonnegativeMoney = (column: SQLWrapper) =>
  sql`${column} between 0 and 9007199254740991`;
export const safePositiveMoney = (column: SQLWrapper) =>
  sql`${column} between 1 and 9007199254740991`;
export const stateCode = (column: SQLWrapper) => sql`${column} in (
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
)`;
