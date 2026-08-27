"use server";

import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { readServerEnv } from "@/env";

import { SIGN_IN_ROUTE } from "./routes";
import { LOCAL_ACTOR_COOKIE } from "./server";

export async function signInWithFixedActor(formData: FormData): Promise<never> {
  await connection();
  const environment = readServerEnv();
  if (
    environment.LOCAL_TEST_DRIVER !== "enabled" ||
    environment.APP_ENV !== "local" ||
    !environment.LOCAL_TEST_SECRET
  ) {
    throw new Error("Fixed local sign-in is unavailable");
  }
  const actorKey = formData.get("actorKey");
  if (typeof actorKey !== "string") throw new Error("Fixed actor is required");
  const { getLocalTestDriver } = await import("local-auth-driver");
  const signed = getLocalTestDriver().signActor(
    actorKey,
    environment.LOCAL_TEST_SECRET,
  );
  if (!signed) throw new Error("Unknown fixed actor");
  (await cookies()).set(LOCAL_ACTOR_COOKIE, signed, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: 60 * 60,
  });
  redirect("/checkout");
}

export async function signOutLocalActor(): Promise<never> {
  const environment = readServerEnv();
  if (environment.LOCAL_TEST_DRIVER !== "enabled") {
    throw new Error("Fixed local sign-out is unavailable");
  }
  (await cookies()).delete(LOCAL_ACTOR_COOKIE);
  redirect(SIGN_IN_ROUTE);
}
