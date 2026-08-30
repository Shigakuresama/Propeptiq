import { cn } from "@/lib/utils";

type ScienceFieldProps = {
  className?: string;
  tone?: "canvas" | "inverse";
  variant?: "lattice" | "trace";
};

export function ScienceField({
  className,
  tone = "canvas",
  variant = "trace",
}: ScienceFieldProps) {
  const isLattice = variant === "lattice";

  return (
    <div
      aria-hidden="true"
      className={cn("science-field", className)}
      data-science-field={variant}
      data-tone={tone}
    >
      <svg
        className="science-field__svg"
        focusable="false"
        preserveAspectRatio={isLattice ? "xMidYMid slice" : "xMidYMid meet"}
        viewBox="0 0 640 360"
      >
        <g className="science-field__grid">
          <path d="M40 60H600M40 132H600M40 204H600M40 276H600" />
          <path d="M96 28V332M208 28V332M320 28V332M432 28V332M544 28V332" />
        </g>

        {isLattice ? (
          <g className="science-field__lattice">
            <circle cx="176" cy="132" r="84" />
            <circle cx="176" cy="132" r="52" />
            <circle cx="462" cy="190" r="62" />
            <circle cx="462" cy="190" r="28" className="science-field__wash" />
            <circle cx="326" cy="278" r="48" />
            <path d="M176 132 462 190 326 278 176 132" />
            <circle className="science-field__node" cx="176" cy="132" r="6" />
            <circle className="science-field__node" cx="462" cy="190" r="5" />
            <circle className="science-field__node" cx="326" cy="278" r="5" />
          </g>
        ) : (
          <g className="science-field__trace">
            <path
              className="science-field__orbit"
              d="M118 180c0-78 90-124 202-124s202 46 202 124-90 124-202 124-202-46-202-124Z"
            />
            <path
              className="science-field__signal"
              pathLength="1"
              d="M54 240h82l36-52 42 88 48-142 46 91 39-31h54l34-72 42 109 31-43h78"
            />
            <circle className="science-field__node" cx="172" cy="188" r="6" />
            <circle className="science-field__node" cx="435" cy="122" r="5" />
            <circle className="science-field__core" cx="320" cy="180" r="20" />
            <circle className="science-field__core-dot" cx="320" cy="180" r="5" />
          </g>
        )}
      </svg>
    </div>
  );
}
