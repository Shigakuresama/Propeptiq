import "server-only";

import { parseServerEnv } from "@/config/env-schema";

export const serverEnv = parseServerEnv(process.env);
