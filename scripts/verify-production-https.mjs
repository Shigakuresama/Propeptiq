import { parsePositiveHstsMaxAge } from "./hsts-header.mjs";

// Release check for the exact production origin linked by the footer.
const origin = "https://propeptiq.com";

try {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("TLS certificate verification is disabled in this environment");
  }
  // The default Node TLS verifier checks the certificate chain and hostname.
  const response = await fetch(origin, {
    method: "HEAD",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const maxAge = parsePositiveHstsMaxAge(response.headers.get("strict-transport-security") ?? "");
  console.log(`PASS production HTTPS: ${origin}, HTTP ${response.status}, HSTS max-age=${maxAge}`);
} catch (error) {
  console.error(`FAIL production HTTPS: ${error instanceof Error ? error.message : "verification failed"}`);
  process.exitCode = 1;
}
