export type Result<Value, ErrorValue> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: ErrorValue }>;

