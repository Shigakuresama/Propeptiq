import type { LocalActorOption } from "@/auth/local-driver-types";
import { signInWithFixedActor } from "@/auth/actions";
import { Button } from "@/components/ui/button";

export function LocalIdentityEntry({
  actors,
  kind,
}: {
  actors: readonly LocalActorOption[];
  kind: "sign-in" | "sign-up";
}) {
  return (
    <section className="record-card mx-auto max-w-2xl" aria-labelledby="fixed-identity-heading">
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
            className="grid min-h-16 cursor-pointer grid-cols-[1.5rem_1fr] gap-3 rounded-xl border border-border p-4 focus-within:ring-3 focus-within:ring-ring/50"
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
    </section>
  );
}
