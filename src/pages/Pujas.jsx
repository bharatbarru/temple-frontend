import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatAmount, getPujasUrl, hasAmount } from '../api'
import { useCart } from '../cart'
import { Diamond, Logo, Ornament } from '../components/Brand'
import '../App.css'
import './Pujas.css'

function PageLoader() {
  return (
    <div className="page-loader" aria-hidden="true">
      <div className="page-loader__stage">
        <Logo />
        <span className="page-loader__rule" />
        <span className="page-loader__word">Puja &amp; Prayers</span>
        <span className="page-loader__track" />
      </div>
    </div>
  )
}

/**
 * Reveal-on-scroll as React state.
 *
 * This deliberately does not add the class imperatively. Any element whose
 * className React also controls would lose an imperatively-added class on the
 * next render, and the observer has already unobserved it by then.
 */
function useReveal() {
  // A callback ref, not useRef: elements that mount later (the toolbar only
  // renders once the fetch resolves) must be able to re-run the effect, and a
  // ref object mutating does not do that.
  const [node, setNode] = useState(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (!node || revealed) return undefined

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      setRevealed(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setRevealed(true)
      },
      { threshold: 0.1, rootMargin: '0px 0px -4% 0px' },
    )
    observer.observe(node)

    // Safety net. The reveal is decoration, but the cards it hides are the
    // whole page, so it must never be able to strand them at opacity 0.
    // Backgrounded tabs and zero-height viewports both starve the observer.
    const fallback = window.setTimeout(() => setRevealed(true), 1200)

    return () => {
      observer.disconnect()
      window.clearTimeout(fallback)
    }
  }, [node, revealed])

  return [setNode, revealed]
}

function PujaCard({ puja, index, inCart, onAdd, onRemove }) {
  const [revealRef, revealed] = useReveal()

  const templeOk = hasAmount(puja.temple_amount)
  const homeOk = hasAmount(puja.home_amount)
  const location = templeOk ? 'temple' : homeOk ? 'home' : ''

  const handleClick = () => {
    if (!location) return

    if (inCart) {
      onRemove(`${puja.id}-${location}`)
      if (navigator.vibrate) navigator.vibrate(8)
      return
    }

    if (onAdd(puja, location) && navigator.vibrate) navigator.vibrate(8)
  }

  return (
    <article
      ref={revealRef}
      className={`puja-card${revealed ? ' is-revealed' : ''}${inCart ? ' is-in-cart' : ''}`}
      data-reveal
      style={{ transitionDelay: `${Math.min(index, 10) * 0.045}s` }}
    >
      <h2 className="puja-card__name">{puja.name}</h2>

      <div className="puja-card__foot">
        <p className="puja-card__price">{formatAmount(puja.temple_amount)}</p>

        {location ? (
          <button
            type="button"
            className={`puja-card__add${inCart ? ' is-in-cart' : ''}`}
            onClick={handleClick}
            aria-label={
              inCart
                ? `Remove ${puja.name} from cart`
                : `Add ${puja.name} to cart`
            }
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              {inCart ? (
                <path
                  d="m4.5 4.5 7 7m0-7-7 7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M8 3.2v9.6M3.2 8h9.6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
            <span>{inCart ? 'Remove' : 'Add'}</span>
          </button>
        ) : (
          <p className="puja-card__note">Contact temple</p>
        )}
      </div>
    </article>
  )
}

function CardSkeleton() {
  return (
    <div className="puja-card puja-card--skeleton" aria-hidden="true">
      <span className="skeleton skeleton--title" />
      <div className="puja-card__foot">
        <span className="skeleton skeleton--price" />
        <span className="skeleton skeleton--button" />
      </div>
    </div>
  )
}

export default function Pujas() {
  const navigate = useNavigate()
  const { addItem, removeItem, items, count } = useCart()
  const [toolbarRef, toolbarShown] = useReveal()

  const [modalMessage, setModalMessage] = useState('')
  const modalCloseRef = useRef(null)

  // The donation amount is collected here rather than on /donate so the
  // offering figure is settled before the form page is ever reached.
  const [donateOpen, setDonateOpen] = useState(false)
  const [donateAmount, setDonateAmount] = useState('')
  const [donateError, setDonateError] = useState('')
  const donateInputRef = useRef(null)

  const [pujas, setPujas] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  // The loader plays a 1.5s intro then fades. Hold it for that long even when
  // the API answers sooner, otherwise it flashes on and off.
  const [introDone, setIntroDone] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setIntroDone(true), 2200)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setStatus('loading')
      setError('')

      try {
        const res = await fetch(getPujasUrl(), { signal: controller.signal })
        if (!res.ok) throw new Error(`Could not load pujas (${res.status})`)

        const json = await res.json()
        const rows = Array.isArray(json?.data) ? json.data : []

        const published = rows.sort(
          (a, b) =>
            (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name),
        )

        setPujas(published)
        setStatus('ready')
      } catch (err) {
        if (err.name === 'AbortError') return
        setError(err.message || 'Unable to reach the temple.')
        setStatus('error')
      }
    }

    load()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (modalMessage && modalCloseRef.current) modalCloseRef.current.focus()
  }, [modalMessage])

  useEffect(() => {
    if (!modalMessage) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setModalMessage('')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalMessage])

  useEffect(() => {
    if (!donateOpen) return undefined
    donateInputRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') closeDonate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [donateOpen])

  function openDonate() {
    setDonateAmount('')
    setDonateError('')
    setDonateOpen(true)
  }

  function closeDonate() {
    setDonateOpen(false)
    setDonateError('')
  }

  // Only a positive figure opens the checkout page; /donate reads it from
  // router state and starts with the form already unlocked.
  function submitDonate(event) {
    event.preventDefault()
    const value = Number(donateAmount)
    if (!donateAmount.trim() || !Number.isFinite(value) || value <= 0) {
      setDonateError('Enter a donation amount to continue')
      donateInputRef.current?.focus()
      return
    }
    setDonateOpen(false)
    navigate('/donate', { state: { amount: donateAmount.trim() } })
  }

  function handleAdd(puja, location) {
    const res = addItem(puja, location)
    if (res?.ok) return true

    if (res?.reason === 'single') {
      setModalMessage('One puja can be booked per request. Please complete this request before adding another.')
    } else if (res?.reason === 'no-amount') {
      setModalMessage('This puja does not have an offering amount set. Please contact the temple office.')
    }
    return false
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pujas
    return pujas.filter((puja) => puja.name.toLowerCase().includes(q))
  }, [pujas, query])

  // Cart keys are `${id}-${location}`; a card matches when its own key is held.
  const cartKeys = useMemo(() => new Set(items.map((item) => item.key)), [items])

  return (
    <div className="pujas-page">
      {!introDone && <PageLoader />}

      <header className="app-bar">
        <div className="app-bar__inner">
          <Logo />
        </div>
      </header>

      <main className="pujas-main">
        <section className="pujas-hero">
          <h1 className="pujas-hero__title">Sankalpa &amp; Temple Pooja Payments Online</h1>
          <Ornament />
          <p className="pujas-hero__lede">
            Choose the puja you wish to offer, and
            complete the request in a few steps.
          </p>
        </section>

        {status === 'loading' && (
          <div className="puja-grid" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="notice notice--error" role="alert">
            <p className="notice__title">{error}</p>
            <p className="notice__body">
              Please try again in a moment, or call the temple at{' '}
              <a href="tel:+14026978546">(402) 697-8546</a>.
            </p>
          </div>
        )}

        {status === 'ready' && (
          <>
            <div
              ref={toolbarRef}
              className={`pujas-toolbar${toolbarShown ? ' is-revealed' : ''}`}
              data-reveal
            >
              <label className="search">
                <span className="visually-hidden">Search pujas</span>
                <svg className="search__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
                  <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name"
                  autoComplete="off"
                />
              </label>
              <p className="pujas-count">
                {filtered.length} {filtered.length === 1 ? 'puja' : 'pujas'}
              </p>
            </div>

            <article className="donation-card" onClick={openDonate} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDonate() } }}>
              <div className="donation-card__body">
                <h2 className="donation-card__title">General Donation</h2>
                <p className="donation-card__desc">
                  Support the temple with a contribution of any amount
                </p>
              </div>
              <button
                type="button"
                className="donation-card__btn"
                onClick={(e) => { e.stopPropagation(); openDonate() }}
                aria-label="Make a general donation"
              >
                Donate
              </button>
            </article>

            {filtered.length > 0 ? (
              <div className="puja-grid">
                {filtered.map((puja, index) => (
                  <PujaCard
                    key={puja.id}
                    puja={puja}
                    index={index}
                    inCart={
                      cartKeys.has(`${puja.id}-temple`) ||
                      cartKeys.has(`${puja.id}-home`)
                    }
                    onAdd={handleAdd}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            ) : (
              <div className="notice">
                <p className="notice__title">No pujas match that name</p>
                <p className="notice__body">Try a shorter search term.</p>
              </div>
            )}
          </>
        )}
      </main>

      <Link
        to="/checkout"
        className={`cart-fab${count > 0 ? ' is-filled' : ''}`}
        aria-label={count > 0 ? `Review cart, ${count} item` : 'Review cart, empty'}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 5h2l1.6 9.2a1.5 1.5 0 0 0 1.5 1.3h7.4a1.5 1.5 0 0 0 1.5-1.2L19.5 8H7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="19" r="1.4" fill="currentColor" />
          <circle cx="17" cy="19" r="1.4" fill="currentColor" />
        </svg>
        {count > 0 && <span className="cart-fab__badge">{count}</span>}
      </Link>

      {modalMessage && (
        <div
          className="modal__scrim"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalMessage('')}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <Diamond className="modal__mark" />
            <p className="modal__message">{modalMessage}</p>
            <button
              ref={modalCloseRef}
              className="btn btn--primary"
              onClick={() => setModalMessage('')}
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {donateOpen && (
        <div
          className="modal__scrim"
          role="dialog"
          aria-modal="true"
          aria-labelledby="donate-modal-title"
          onClick={closeDonate}
        >
          <form
            className="modal modal--donate"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitDonate}
            noValidate
          >
            <Diamond className="modal__mark" />
            <h2 id="donate-modal-title" className="modal__message">
              How much would you like to offer?
            </h2>

            <label className={`donate-entry ${donateError ? 'has-error' : ''}`}>
              <span className="visually-hidden">Donation amount in dollars</span>
              <span className="donate-entry__currency" aria-hidden="true">$</span>
              <input
                ref={donateInputRef}
                value={donateAmount}
                onChange={(e) => {
                  setDonateAmount(
                    e.target.value.replace(/[^\d.]/g, '').replace(/(\..*?)\..*/g, '$1'),
                  )
                  setDonateError('')
                }}
                placeholder="0"
                inputMode="decimal"
                autoComplete="off"
                maxLength={9}
                size={Math.max(1, donateAmount.length)}
                aria-invalid={donateError ? 'true' : undefined}
              />
            </label>
            {donateError && <p className="field-error" role="alert">{donateError}</p>}

            <p className="donate-entry__note">
              You will confirm your details and pay on the next step.
            </p>

            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={closeDonate}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary">
                Continue
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
