import { researchRestrictions } from "@/lib/site-content";

export function ResearchRestrictionBar() {
  return (
    <aside
      aria-label="Research-use restriction"
      className="restriction-bar border-b border-border bg-ink px-4 py-2 text-center text-canvas sm:px-6"
    >
      <span>{researchRestrictions[0]}</span>{" "}
      <span className="text-canvas/70">{researchRestrictions[1]}</span>
    </aside>
  );
}
