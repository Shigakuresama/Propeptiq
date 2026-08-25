import { proofStages } from "@/lib/site-content";

export function ProofRail() {
  return (
    <ol
      aria-label="Evidence relationship"
      className="proof-rail relative grid gap-4 lg:grid-cols-4 lg:gap-0"
    >
      {proofStages.map((stage, index) => (
        <li
          key={stage}
          className="relative grid min-h-44 grid-cols-[2.5rem_1fr] gap-4 rounded-[0.875rem] border border-border bg-surface p-5 lg:min-h-52 lg:grid-cols-1 lg:content-between lg:rounded-none lg:border-y lg:border-l lg:last:border-r"
        >
          <span
            aria-hidden="true"
            className="relative z-10 grid size-10 place-items-center rounded-full border border-moss/35 bg-canvas text-xs font-semibold tabular-nums text-moss"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="self-center lg:self-end">
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">{stage}</h3>
            <p className="mt-2 text-sm leading-6 text-unknown">
              No approved public record
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
