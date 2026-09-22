/**
 * The Lumen Financials mark and wordmark.
 *
 * One component so the logo is identical on the sign-in screen, the onboarding
 * card and the sidebar — a brand that drifts between screens is the thing that
 * makes an app feel homemade.
 */
export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? 34 : 26;
  return (
    <span className={`brand-lockup ${size}`}>
      <svg
        className="brand-mark"
        width={box}
        height={box}
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="lumen-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F2CE7E" />
            <stop offset="100%" stopColor="#C89434" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#lumen-g)" />
        {/* A beam of light: the "lumen" the name is built on. */}
        <path
          d="M16 7.5 18.1 13.3 24 15.4l-5.9 2.1L16 23.3l-2.1-5.8L8 15.4l5.9-2.1L16 7.5Z"
          fill="#12151C"
        />
      </svg>
      <span className="brand-name">
        Lumen<span className="brand-accent"> Financials</span>
      </span>
    </span>
  );
}
