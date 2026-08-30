import type { Route } from "next";
import Link from "next/link";

import type { PublicProofNode } from "@/catalog/types";
import { proofStages } from "@/lib/site-content";

const emptyProof: readonly PublicProofNode[] = proofStages.map((label) => ({
  label,
  state: "No approved public record",
}));

export function ProofRail({ nodes = emptyProof }: { nodes?: readonly PublicProofNode[] }) {
  return (
    <ol
      aria-label="Evidence relationship"
      className="proof-rail relative grid overflow-hidden rounded-[0.875rem] border border-border bg-surface-record shadow-[var(--shadow-soft)] before:absolute before:bottom-9 before:left-9 before:top-9 before:w-px before:bg-border lg:grid-cols-4 lg:before:bottom-auto lg:before:left-[12.5%] lg:before:right-[12.5%] lg:before:top-10 lg:before:h-px lg:before:w-auto"
    >
      {nodes.map((node, index) => (
        <li
          key={node.label}
          className="relative z-10 grid min-h-32 grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-b border-border p-4 last:border-b-0 lg:min-h-56 lg:grid-cols-1 lg:grid-rows-[2.5rem_1fr] lg:gap-8 lg:border-b-0 lg:border-r lg:p-6 lg:last:border-r-0"
        >
          <span
            aria-hidden="true"
            className="relative z-10 grid size-10 place-items-center rounded-full border border-moss/45 bg-canvas text-xs font-bold tabular-nums text-accent-readable lg:justify-self-center"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="self-center lg:self-end">
            <h3 className="font-heading text-2xl leading-tight text-ink">{node.label}</h3>
            {node.href ? (
              <Link
                className="record-link mt-3 inline-flex min-h-11 items-center text-base leading-6"
                href={node.href as Route}
              >
                {node.state}
              </Link>
            ) : (
              <p className="mt-3 text-base leading-7 text-unknown">{node.state}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
