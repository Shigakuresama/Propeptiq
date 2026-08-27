import Link from "next/link";

import { adminGate, adminResources } from "@/admin/access";
import { getRequestIdentity } from "@/auth/server";

export default async function AdminPage() {
  const request = await getRequestIdentity();
  const gate = adminGate(request);
  if (!gate.allowed) return null;
  const capabilities = new Set(request.principal!.capabilities);
  const resources = adminResources.filter((resource) => capabilities.has(resource.capability));
  return (
    <section>
      <p className="eyebrow">One-administrator operations</p>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">Administration</h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted-ink">
        This current MFA session may act only within active database-backed capabilities. Every sensitive command is rate limited, version checked, and audited in its mutation transaction.
      </p>
      <ul className="mt-9 grid gap-4 p-0 sm:grid-cols-2">
        {resources.map((resource) => (
          <li key={resource.slug} className="record-card">
            <h2 className="font-heading text-2xl">{resource.label}</h2>
            <p className="mt-3 text-base leading-6 text-muted-ink">{resource.description}</p>
            <Link href={`/admin/${resource.slug}`} className="record-link mt-5 inline-flex min-h-11 items-center">Open resource</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
