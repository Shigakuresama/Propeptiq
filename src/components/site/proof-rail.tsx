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
      className="proof-rail relative grid gap-4 xl:grid-cols-4 xl:gap-0"
    >
      {nodes.map((node, index) => (
        <li
          key={node.label}
          className="relative grid min-h-44 grid-cols-[2.5rem_1fr] gap-4 rounded-[0.875rem] border border-border bg-surface p-5 xl:min-h-52 xl:grid-cols-1 xl:content-between xl:rounded-none xl:border-y xl:border-l xl:last:border-r"
        >
          <span
            aria-hidden="true"
            className="relative z-10 grid size-10 place-items-center rounded-full border border-moss/35 bg-canvas text-xs font-semibold tabular-nums text-moss"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="self-center xl:self-end">
            <h3 className="text-lg font-semibold text-ink">{node.label}</h3>
            {node.href ? (
              <Link className="record-link mt-2 inline-block text-sm leading-6" href={node.href as Route}>
                {node.state}
              </Link>
            ) : (
              <p className="mt-2 text-sm leading-6 text-unknown">{node.state}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
