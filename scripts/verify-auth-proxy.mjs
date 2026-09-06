import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Next 16 registers the Node.js proxy here, not in middleware-manifest.json.
// A misplaced proxy can compile successfully without registering any routes.
const root = process.argv[2] ?? ".next";
const manifest = JSON.parse(
  readFileSync(join(root, "server/functions-config-manifest.json"), "utf8"),
);
const proxy = manifest.functions?.["/_middleware"];
assert.equal(proxy?.runtime, "nodejs", "Authentication proxy is not registered");
assert.deepEqual(
  proxy.matchers.map(({ originalSource }) => originalSource).sort(),
  ["/account/:path*", "/admin/:path*", "/checkout/:path*", "/research-sets/:path*"].sort(),
  "Authentication proxy must cover exactly the protected route families",
);
console.log("PASS authentication proxy registration and protected route matchers");
