import {
  brand,
  documentationChecklist,
  jurisdictionMatrix,
  launchGates,
  navigation,
  operatingRules,
  platformModules,
  stateMachines,
  stackSelection,
} from "@/lib/platform";

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent-strong)]">
        {eyebrow}
      </p>
      <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
        {title}
      </h2>
      <p className="text-base leading-7 text-[var(--muted)] sm:text-lg">{description}</p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(circle_at_top,_rgba(202,138,4,0.16),_transparent_32%),radial-gradient(circle_at_20%_20%,_rgba(106,131,96,0.14),_transparent_24%),radial-gradient(circle_at_80%_0%,_rgba(30,58,138,0.08),_transparent_20%)]" />

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 pb-16 pt-4 sm:px-8 lg:px-10">
        <header className="sticky top-4 z-20 mb-8 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <a href="#top" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--foreground)] text-sm font-semibold text-white">
                PL
              </span>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.34em] text-[var(--accent-strong)]">
                  {brand.name}
                </p>
                <p className="text-sm text-[var(--muted)]">{brand.tagline}</p>
              </div>
            </a>

            <nav aria-label="Primary" className="flex flex-wrap items-center gap-2 text-sm">
              {navigation.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="rounded-full px-3 py-2 text-[var(--muted)] transition-colors duration-200 hover:bg-slate-950/5 hover:text-slate-950"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <section
          id="top"
          className="grid items-center gap-10 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:py-16"
        >
          <div className="max-w-3xl space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-strong)] shadow-sm">
              Research-use commerce
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              Launch-gated by design
            </div>

            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-6xl lg:text-7xl">
                Compliance is the product boundary.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
                PROPEPTIQ LABS is being shaped as a production-capable ordering platform
                for verified researchers and organizations. The catalog, jurisdiction
                matrix, warehouse mapping, and payment activation remain configurable
                until each decision is explicitly approved.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#gates"
                className="inline-flex items-center justify-center rounded-full bg-[var(--foreground)] px-6 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Request verification
              </a>
              <a
                href="#docs"
                className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition-colors duration-200 hover:bg-slate-950/5"
              >
                Review operating rules
              </a>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
              {operatingRules.slice(0, 3).map((rule) => (
                <span
                  key={rule}
                  className="rounded-full border border-[var(--border)] bg-white/70 px-4 py-2 shadow-sm"
                >
                  {rule}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-elevated)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-strong)]">
                    Current status
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                    Scaffolded, not speculative.
                  </h2>
                </div>
                <span className="rounded-full bg-[rgba(202,138,4,0.14)] px-3 py-1 text-xs font-semibold text-[var(--accent-gold)]">
                  Launch-gated
                </span>
              </div>

              <div className="mt-6 space-y-3">
                {[
                  "No guest checkout",
                  "Unknown jurisdictions default to hold",
                  "Payment success pages never prove payment",
                  "Lot-level COA links are required before release",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-white/80 px-4 py-3 text-sm text-slate-700"
                  >
                    <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {stackSelection.slice(0, 2).map((item) => (
                <div
                  key={item.name}
                  className="rounded-[1.75rem] border border-[var(--border)] bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-strong)]">
                    {item.status}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-slate-950">
                    {item.name}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="platform" className="space-y-8 py-12">
          <SectionHeading
            eyebrow="Platform modules"
            title="The system is being shaped around verified access, lot-level records, and a controlled checkout boundary."
            description="These modules are the first production-facing slice of the platform. They are intentionally generic at the catalog layer until the final SKU list, entity, warehouse, and shipping matrix are approved."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {platformModules.map((module) => (
              <article
                key={module.title}
                className="group rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">
                    {module.title}
                  </h3>
                  <span className="rounded-full border border-[rgba(106,131,96,0.24)] bg-[rgba(106,131,96,0.08)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                    {module.status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{module.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="states" className="space-y-8 py-12">
          <SectionHeading
            eyebrow="State machines"
            title="Approval, ordering, payment, and fulfillment each need their own explicit transitions."
            description="A customer can only move forward when all required gates agree. A single green checkbox is never enough on its own."
          />

          <div className="grid gap-4 xl:grid-cols-2">
            {stateMachines.map((machine) => (
              <article
                key={machine.name}
                className="rounded-[1.75rem] border border-[var(--border)] bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-strong)]">
                      {machine.name}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{machine.detail}</p>
                  </div>
                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                    Guarded
                  </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {machine.states.map((state, index) => (
                    <span
                      key={state}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    >
                      {state}
                      {index < machine.states.length - 1 ? (
                        <span className="text-[var(--accent)]">→</span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="jurisdictions" className="grid gap-8 py-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-8">
            <SectionHeading
              eyebrow="Jurisdiction matrix"
              title="Unknown must never silently become allowed."
              description="Product legality, buyer verification, tax registration, and shipping eligibility are separate gates. Each one needs its own state."
            />

            <div className="space-y-4 rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
              {jurisdictionMatrix.map((item) => (
                <div
                  key={item.state}
                  className="flex items-start justify-between gap-4 border-b border-[var(--border)] py-4 last:border-b-0 last:pb-0 first:pt-0"
                >
                  <div>
                    <h3 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">
                      {item.state}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{item.meaning}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-strong)]">
                    {item.outcome}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <section
            id="gates"
            className="space-y-4 rounded-[2rem] border border-[var(--border)] bg-slate-950 p-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[rgba(255,255,255,0.66)]">
              Launch gates
            </p>
            <h3 className="text-3xl font-semibold tracking-[-0.05em]">
              The business cannot go live until these are true.
            </h3>

            <div className="mt-6 space-y-4">
              {launchGates.map((gate, index) => (
                <div
                  key={gate.title}
                  className="flex gap-4 rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-950">
                    {index + 1}
                  </div>
                  <div>
                    <h4 className="text-base font-semibold tracking-[-0.02em] text-white">
                      {gate.title}
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-white/72">{gate.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>

        <section id="docs" className="space-y-8 py-12">
          <SectionHeading
            eyebrow="Documentation"
            title="The repo now has a durable place to record stack decisions, compliance policy, and operational runbooks."
            description="This is the first pass at the written operating model. It keeps confirmed facts, provisional choices, and open decisions separate so the implementation can stay honest as the project grows."
          />

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[1.75rem] border border-[var(--border)] bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
              <h3 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">
                Documentation checklist
              </h3>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
                {documentationChecklist.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[1.75rem] border border-[var(--border)] bg-white/90 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
              <h3 className="text-xl font-semibold tracking-[-0.04em] text-slate-950">
                Operating rules
              </h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {operatingRules.map((rule) => (
                  <div
                    key={rule}
                    className="rounded-2xl border border-[var(--border)] bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700"
                  >
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-8 border-t border-[var(--border)] py-8 text-sm text-[var(--muted)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-semibold text-slate-950">{brand.name}</p>
            <p>Research-use only. No human-use, treatment, or dosage claims.</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
