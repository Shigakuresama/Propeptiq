import type { LocalActorOption } from "@/auth/local-driver-types";
import { signInWithFixedActor } from "@/auth/actions";
import { RecordPanel } from "@/components/design-system/archive-primitives";
import { Button } from "@/components/ui/button";

export function LocalIdentityEntry({
  actors,
  kind,
}: {
  actors: readonly LocalActorOption[];
  kind: "sign-in" | "sign-up";
}) {
  return (
    <section aria-labelledby="fixed-identity-heading">
      <RecordPanel className="p-5 sm:p-7">
      <p className="demo-label">Local deterministic test driver</p>
      <h1 id="fixed-identity-heading" className="mt-5 font-heading text-page leading-[0.95]">
        Choose a fixed test identity
      </h1>
      <p className="mt-5 text-base leading-7 text-muted-ink">
        This local-only screen uses predefined records. It does not create or contact a real account,
        and it is excluded from production builds.
      </p>
      <form action={signInWithFixedActor} className="mt-8 grid gap-3">
        {actors.map((actor, index) => (
          <label
            key={actor.key}
            className="grid min-h-16 cursor-pointer grid-cols-[1.5rem_1fr] gap-3 rounded-xl border border-border bg-canvas p-4 transition-colors hover:border-moss focus-within:border-moss focus-within:ring-3 focus-within:ring-ring/50"
          >
            <input
              type="radio"
              name="actorKey"
              value={actor.key}
              defaultChecked={index === 0}
              className="mt-1 size-5 accent-moss"
            />
            <span>
              <span className="block font-semibold">{actor.label}</span>
              <span className="mt-1 block text-base leading-6 text-muted-ink">
                {actor.description}
              </span>
            </span>
          </label>
        ))}
        <Button className="action-primary mt-4 w-full" type="submit">
          Continue to checkout
        </Button>
      </form>
      <p className="mt-5 text-base leading-6 text-muted-ink">
        {kind === "sign-up"
          ? "Account creation and email delivery are intentionally not simulated."
          : "The return destination is fixed to /checkout and cannot be supplied by the browser."}
      </p>
      </RecordPanel>
    </section>
  );
}
