type RewardsScienceSceneProps = {
  loyaltyAvailable: boolean;
  referralAvailable: boolean;
  status: "active" | "inactive" | "read_error";
};

const STATUS_COPY = {
  active: "Active policy signal",
  inactive: "No active public record",
  read_error: "Public record unavailable",
} as const;

export function RewardsScienceScene({
  loyaltyAvailable,
  referralAvailable,
  status,
}: RewardsScienceSceneProps) {
  return (
    <aside
      aria-label="Rewards policy status"
      className="rewards-science-scene"
      data-status={status}
    >
      <div className="rewards-science-scene__header">
        <span aria-hidden="true" className="rewards-signal-dot" />
        <p>{STATUS_COPY[status]}</p>
        <span aria-hidden="true" className="rewards-scene-index">
          PROPEPTIQ / POLICY
        </span>
      </div>

      <div className="rewards-science-visual">
        <svg
          aria-hidden="true"
          className="rewards-science-visual__svg"
          focusable="false"
          viewBox="0 0 620 500"
        >
          <defs>
            <linearGradient id="rewards-signal-line" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.12" />
              <stop offset="0.48" stopColor="currentColor" stopOpacity="0.9" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0.18" />
            </linearGradient>
            <radialGradient id="rewards-signal-core">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.58" />
              <stop offset="0.54" stopColor="currentColor" stopOpacity="0.12" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g className="rewards-science-visual__grid" opacity="0.18">
            <path d="M40 90H580M40 170H580M40 250H580M40 330H580M40 410H580" />
            <path d="M100 50V450M205 50V450M310 50V450M415 50V450M520 50V450" />
          </g>

          <circle
            className="rewards-science-visual__halo"
            cx="310"
            cy="250"
            fill="url(#rewards-signal-core)"
            r="188"
          />

          <g className="rewards-science-visual__orbit rewards-science-visual__orbit--outer">
            <ellipse cx="310" cy="250" rx="226" ry="126" />
            <circle className="rewards-science-visual__node" cx="97" cy="291" r="7" />
            <circle className="rewards-science-visual__node" cx="505" cy="185" r="4" />
          </g>

          <g className="rewards-science-visual__orbit rewards-science-visual__orbit--inner">
            <ellipse cx="310" cy="250" rx="156" ry="90" />
            <circle className="rewards-science-visual__node" cx="396" cy="325" r="6" />
          </g>

          <g className="rewards-science-visual__assay">
            <path d="M250 169 370 169 430 250 370 331 250 331 190 250Z" />
            <path d="m266 201 88 0 44 49-44 49-88 0-44-49Z" />
            <path d="M310 201V299M222 250H398" opacity="0.4" />
            <circle cx="310" cy="250" r="30" />
            <circle className="rewards-science-visual__core" cx="310" cy="250" r="9" />
          </g>

          <path
            className="rewards-science-visual__trace"
            d="M54 367h82l28-36 35 64 39-94 39 66 32-23 41 0 24-46 35 69 29-34h128"
            stroke="url(#rewards-signal-line)"
          />
        </svg>
      </div>

      {status === "active" ? (
        <ul className="rewards-science-scene__records" aria-label="Active reward records">
          {loyaltyAvailable ? <li>Loyalty record active</li> : null}
          {referralAvailable ? <li>Referral record active</li> : null}
        </ul>
      ) : (
        <p className="rewards-science-scene__note">
          {status === "read_error"
            ? "The policy record could not be read safely."
            : "Program values remain hidden until a current record is active."}
        </p>
      )}
    </aside>
  );
}
