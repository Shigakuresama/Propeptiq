export type SerializableRetryOptions = Readonly<{
  maximumAttempts?: 3;
  sleep?: (retryNumber: 1 | 2, sqlState: "40001" | "40P01") => Promise<void>;
}>;

function retryableSqlState(error: unknown): "40001" | "40P01" | null {
  if (typeof error !== "object" || error === null) return null;
  const code = Reflect.get(error, "code");
  return code === "40001" || code === "40P01" ? code : null;
}

export async function runSerializableWithRetry<Value>(
  callback: () => Promise<Value>,
  options: SerializableRetryOptions = {},
): Promise<Value> {
  const maximumAttempts = options.maximumAttempts ?? 3;
  if (maximumAttempts !== 3) {
    throw new Error("Serializable retry policy is fixed at three total attempts");
  }
  const sleep = options.sleep ?? (async () => undefined);
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await callback();
    } catch (error) {
      const sqlState = retryableSqlState(error);
      if (sqlState === null || attempt === maximumAttempts) throw error;
      await sleep(attempt as 1 | 2, sqlState);
    }
  }
  throw new Error("Unreachable serializable retry state");
}
