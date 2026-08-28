import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";

import {
  DeactivateSharedSetForm,
  SharedSetBuilder,
} from "@/components/growth/shared-set-builder";
import {
  createSharedResearchSetAction,
  deactivateSharedResearchSetAction,
  updateSharedResearchSetAction,
} from "@/growth/actions";
import { loadOwnerSharedSetWorkspace } from "@/growth/shared-set-server";

export const metadata: Metadata = { title: "Research sets" };

export default async function ResearchSetsPage() {
  const workspace = await loadOwnerSharedSetWorkspace();
  if (workspace.status !== "available") {
    return (
      <section className="site-container py-16">
        <h1 className="font-heading text-page">Research sets unavailable</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-ink">
          A verified active buyer account and configured production catalog are required.
        </p>
      </section>
    );
  }

  return (
    <main className="site-container py-16">
      <p className="eyebrow">Private set workspace</p>
      <h1 className="mt-4 font-heading text-page">Neutral research sets</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted-ink">
        Save 2 to 8 current products with quantities only. Public links never disclose account identity.
      </p>

      <section className="record-card mt-8" aria-labelledby="create-set-heading">
        <h2 id="create-set-heading" className="font-heading text-3xl">Create research set</h2>
        <div className="mt-6">
          <SharedSetBuilder
            mode="create"
            products={workspace.products}
            idempotencyKey={`create:${randomUUID()}`}
            action={createSharedResearchSetAction}
          />
        </div>
      </section>

      <section className="mt-12" aria-labelledby="saved-sets-heading">
        <h2 id="saved-sets-heading" className="font-heading text-3xl">Saved sets</h2>
        {workspace.sets.length === 0 ? (
          <p className="empty-record mt-6">No research sets have been saved.</p>
        ) : (
          <ul className="mt-6 grid gap-6 p-0">
            {workspace.sets.map((set) => (
              <li className="record-card" key={set.code}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-2xl">{set.label}</h3>
                    <p className="mt-2 text-sm text-muted-ink">
                      {set.itemCount} saved products · {set.active ? "Active" : "Inactive"}
                    </p>
                  </div>
                  {set.active ? (
                    <Link className="record-link" href={{ pathname: `/sets/${set.code}` }}>Open public link</Link>
                  ) : null}
                </div>
                {set.active ? (
                  <div className="mt-7 grid gap-6 lg:grid-cols-2">
                    <SharedSetBuilder
                      mode="update"
                      products={workspace.products}
                      idempotencyKey={`update:${randomUUID()}`}
                      action={updateSharedResearchSetAction}
                      initialSet={set}
                    />
                    <DeactivateSharedSetForm
                      code={set.code}
                      label={set.label}
                      expectedUpdatedAt={set.updatedAt}
                      idempotencyKey={`deactivate:${randomUUID()}`}
                      action={deactivateSharedResearchSetAction}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
