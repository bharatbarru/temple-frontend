export function TempleLoader({ label = 'Loading' }) {
  return (
    <span className="loader-text" role="status" aria-live="polite">
      {label}
      <span className="loader-dot" aria-hidden="true">.</span>
      <span className="loader-dot" aria-hidden="true">.</span>
      <span className="loader-dot" aria-hidden="true">.</span>
    </span>
  )
}
