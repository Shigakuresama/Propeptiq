import "server-only";

import { parseServerEnv } from "@/config/env-schema";

export function readServerEnv() {
  return parseServerEnv(process.env);
}
