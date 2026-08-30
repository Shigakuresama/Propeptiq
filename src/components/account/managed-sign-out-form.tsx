"use client";

import { useActionState } from "react";

import {
  signOutManagedIdentity,
  type ManagedAuthActionState,
} from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: ManagedAuthActionState = Object.freeze({
  status: "idle",
  message: "",
});

export function ManagedSignOutForm({
  className,
  label = "Sign out",
  returnTo,
  variant = "outline",
}: {
  className?: string;
  label?: string;
  returnTo?: string;
  variant?: "link" | "outline";
}) {
  const [state, action, pending] = useActionState(
    signOutManagedIdentity,
    initialState,
  );

  return (
    <form action={action} className={className}>
      {returnTo ? (
        <input name="returnTo" type="hidden" value={returnTo} />
      ) : null}
      <Button
        className={cn("min-h-11", variant === "link" && "record-link px-0")}
        disabled={pending}
        type="submit"
        variant={variant}
      >
        {pending ? "Signing out…" : label}
      </Button>
      {state.status === "error" ? (
        <p className="mt-3 text-sm leading-6 text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
