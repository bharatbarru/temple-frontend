export function TempleLoader() {
  return (
    <div className="loader" role="status" aria-live="polite" aria-label="Loading">
      <div className="loader__stage">
        <div className="loader__mandala" aria-hidden="true">
          <span className="loader__ring loader__ring--outer" />
          <span className="loader__ring loader__ring--mid" />
          <span className="loader__ring loader__ring--inner" />
          <span className="loader__petal loader__petal--1" />
          <span className="loader__petal loader__petal--2" />
          <span className="loader__petal loader__petal--3" />
          <span className="loader__petal loader__petal--4" />
        </div>
        <div className="loader__diya" aria-hidden="true">
          <span className="loader__flame" />
          <span className="loader__flame loader__flame--soft" />
          <span className="loader__bowl" />
        </div>
      </div>
    </div>
  )
}
