/** Small brass rhombus. Used as a section mark and inside the ornament rule. */
export function Diamond({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.2 11.6 8 8 14.8 4.4 8 8 1.2Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M8 5.4 9.5 8 8 10.6 6.5 8 8 5.4Z" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

/** Hairline rule with a diamond at its centre. */
export function Ornament() {
  return (
    <div className="ornament" aria-hidden="true">
      <Diamond />
    </div>
  )
}

/**
 * The temple logo, clipped to its upper band.
 *
 * The source PNG is two stacked colour fields: the wordmark on #B40B0D down to
 * 70% height, then an "A non-profit organization" strip on #980506. Clipping at
 * 70% drops that strip, so the remaining flat red matches --maroon exactly and
 * the artwork reads as white type set directly on the bar, with no plaque edge.
 */
export function Logo({ className = '' }) {
  return (
    <span className={`logo ${className}`.trim()}>
      <img src="/logo.png" alt="Hindu Temple, Omaha, Nebraska" />
    </span>
  )
}
