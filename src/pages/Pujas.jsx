import { useEffect, useMemo, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { formatAmount, getPujasUrl, hasAmount } from '../api'
import { useCart } from '../cart'
import { TempleLoader } from '../components/TempleLoader'
import '../App.css'
import './Pujas.css'

const LOGO = '/logo.png'
const TEMPLE_IMAGE = '/temple.jpg'

function PujaCard({ puja, index, onAdd }) {
  const homeOk = hasAmount(puja.home_amount)
  const templeOk = hasAmount(puja.temple_amount)

  // Keep temple booking selected internally.
  // The user does not need to see/select this option.
  const [location] = useState(
    templeOk ? 'temple' : homeOk ? 'home' : '',
  )

  const [justAdded, setJustAdded] = useState(false)

  const handleAdd = () => {
    if (!location) return

    const ok = onAdd(puja, location)

    if (!ok) return

    setJustAdded(true)

    window.setTimeout(() => {
      setJustAdded(false)
    }, 1400)
  }

  return (
    <article
      className="puja-card"
      data-reveal
      style={{
        transitionDelay: `${Math.min(index, 12) * 0.04}s`,
      }}
    >
      <div className="puja-card__accent" aria-hidden="true" />

      {/* Puja name on left and price on right */}
      <div className="puja-card__header">
        <h2 className="puja-card__name">
          {puja.name}
        </h2>

        <div
          className={`puja-card__price ${
            !templeOk ? 'is-disabled' : ''
          }`}
        >
          <span>Price: </span>
          <strong>
            {formatAmount(puja.temple_amount)}
          </strong>
        </div>
      </div>

      {/* 
        Booking location is hidden.
        Temple remains selected internally,
        so cart functionality is not affected.
      */}
      <input
        type="hidden"
        name={`loc-${puja.id}`}
        value={location}
      />

      {/* Add to cart button at bottom */}
      {location ? (
        <button
          type="button"
          className={`puja-card__add ${
            justAdded ? 'is-added' : ''
          }`}
          onClick={handleAdd}
        >
          {justAdded ? 'Added to cart' : 'Add to cart'}
        </button>
      ) : (
        <p className="puja-card__note">
          Contact temple for pricing
        </p>
      )}
    </article>
  )
}

export default function Pujas() {
  const { addItem, count } = useCart()

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMessage, setModalMessage] = useState('')
  const modalCloseRef = useRef(null)

  const [pujas, setPujas] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      setStatus('loading')
      setError('')

      try {
        const res = await fetch(getPujasUrl(), {
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(
            `Could not load pujas (${res.status})`,
          )
        }

        const json = await res.json()

        const rows = Array.isArray(json?.data)
          ? json.data
          : []

        const published = rows
          .filter((row) => row.publish !== false)
          .sort(
            (a, b) =>
              (a.sort ?? 0) - (b.sort ?? 0) ||
              a.name.localeCompare(b.name),
          )

        setPujas(published)
        setStatus('ready')
      } catch (err) {
        if (err.name === 'AbortError') return

        setError(
          err.message ||
            'Unable to reach the temple API.',
        )

        setStatus('error')
      }
    }

    load()

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const root = document.querySelector('.pujas-page')

    if (!root) return undefined

    const nodes = root.querySelectorAll(
      '[data-reveal]:not(.is-revealed)',
    )

    if (!nodes.length) return undefined

    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (reduceMotion) {
      nodes.forEach((node) =>
        node.classList.add('is-revealed'),
      )

      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed')

            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -6% 0px',
      },
    )

    nodes.forEach((node) =>
      observer.observe(node),
    )

    return () => observer.disconnect()
  }, [status, pujas, query])

  useEffect(() => {
    if (
      modalOpen &&
      modalCloseRef.current
    ) {
      modalCloseRef.current.focus()
    }
  }, [modalOpen])

  function showModal(msg) {
    setModalMessage(msg)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setModalMessage('')
  }

  function handleAddWrapper(puja, location) {
    const res = addItem(puja, location)

    if (res && res.ok === true) {
      return true
    }

    if (res?.reason === 'single') {
      showModal(
        'Currently you can book 1 puja for this session',
      )

      return false
    }

    if (res?.reason === 'no-amount') {
      showModal(
        'This puja does not have a valid amount.',
      )

      return false
    }

    return false
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) return pujas

    return pujas.filter((puja) =>
      puja.name.toLowerCase().includes(q),
    )
  }, [pujas, query])

  return (
    <div className="pujas-page">

      {/* Background */}
      <div
        className="pujas-page__bg"
        aria-hidden="true"
      >
        <img
          src={TEMPLE_IMAGE}
          alt=""
          className="pujas-page__image"
        />

        <div className="pujas-page__veil" />
      </div>

      {/* Header */}
      <header className="pujas-top">

        <img
          className="pujas-top__logo"
          src={LOGO}
          alt="Hindu Temple Omaha, NE"
          width={320}
          height={110}
        />

        <Link
          to="/checkout"
          className="pujas-top__cart"
          aria-label={`Open cart (${count})`}
        >
          <i
            className="fa-solid fa-cart-shopping"
            aria-hidden="true"
          />

          {count > 0 && (
            <span className="pujas-top__cart-badge">
              {count}
            </span>
          )}
        </Link>
      </header>

      {/* Main */}
      <main className="pujas-main pujas-main--wide">

        {/* Hero */}
        <header className="pujas-hero is-revealed">

          <h1 className="pujas-hero__title">
            Pujas
          </h1>

          <p className="pujas-hero__lede">
            Choose temple booking, then add pujas
            to your cart.
          </p>

        </header>

        {/* Loading */}
        {status === 'loading' && (
          <div className="pujas-loading">
            <TempleLoader />
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div
            className="pujas-message"
            role="alert"
          >
            <p>{error}</p>

            <p className="pujas-message__hint">
              Make sure the API is running at{' '}

              <code>
                {import.meta.env.VITE_API_BASE_URL ||
                  'http://127.0.0.1:8000'}
              </code>
            </p>
          </div>
        )}

        {/* Ready */}
        {status === 'ready' && (
          <>

            {/* Search */}
            <div
              className="pujas-toolbar"
              data-reveal
            >
              <label className="pujas-search">

                <span className="visually-hidden">
                  Search pujas
                </span>

                <input
                  type="search"
                  value={query}
                  onChange={(e) =>
                    setQuery(e.target.value)
                  }
                  placeholder="Search puja by name…"
                  autoComplete="off"
                />

              </label>

              <p className="pujas-count">
                {filtered.length} of {pujas.length}{' '}
                pujas
              </p>
            </div>

            {/* Puja cards */}
            <div className="puja-grid">

              {filtered.map((puja, index) => (
                <PujaCard
                  key={puja.id}
                  puja={puja}
                  index={index}
                  onAdd={handleAddWrapper}
                />
              ))}

            </div>

            {/* No search results */}
            {filtered.length === 0 && (
              <p className="pujas-message">
                No pujas match your search.
              </p>
            )}

            {/* Checkout bar removed — cart is accessible via floating cart icon */}

          </>
        )}

      </main>

      {/* Modal */}
      {modalOpen && (
        <div
          className="puja-modal__overlay"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >

          <div
            className="puja-modal"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            <p className="puja-modal__message">
              {modalMessage}
            </p>

            <div className="puja-modal__actions">

              <button
                ref={modalCloseRef}
                className="puja-modal__close"
                onClick={closeModal}
              >
                OK
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  )
}