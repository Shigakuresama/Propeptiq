import type { Route } from "next";

export const SIGN_IN_ROUTE = "/sign-in/";
export const SIGN_UP_ROUTE = "/sign-up/";
export const FORGOT_PASSWORD_ROUTE = "/forgot-password/";
export const RESET_PASSWORD_ROUTE = "/reset-password/";
export const DEFAULT_AUTH_DESTINATION = "/checkout";

const privateDestinationRoots = [
  "/account",
  "/admin",
  "/checkout",
  "/research-sets",
] as const;

export function resolveAuthDestination(value: unknown): Route {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/u.test(value)
  ) {
    return DEFAULT_AUTH_DESTINATION;
  }

  let url: URL;
  try {
    url = new URL(value, "https://auth-return.invalid");
  } catch {
    return DEFAULT_AUTH_DESTINATION;
  }

  const permitted = privateDestinationRoots.some(
    (root) => url.pathname === root || url.pathname.startsWith(`${root}/`),
  );
  if (!permitted || url.origin !== "https://auth-return.invalid") {
    return DEFAULT_AUTH_DESTINATION;
  }
  return `${url.pathname}${url.search}` as Route;
}

export function authRouteWithDestination(
  route:
    | typeof SIGN_IN_ROUTE
    | typeof SIGN_UP_ROUTE
    | typeof FORGOT_PASSWORD_ROUTE,
  destination: string,
): Route {
  return `${route}?returnTo=${encodeURIComponent(resolveAuthDestination(destination))}` as Route;
}

export function resolvePasswordResetToken(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    value.length > 512 ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    return null;
  }
  return value;
}
