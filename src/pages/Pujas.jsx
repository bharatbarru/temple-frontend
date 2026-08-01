import { useEffect, useMemo, useState } from 'react'
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
  const [location, setLocation] = useState(
    templeOk ? 'temple' : homeOk ? 'home' : '',
  )
  const [justAdded, setJustAdded] = useState(false)

  useEffect(() => {
    setLocation(templeOk ? 'temple' : homeOk ? 'home' : '')
  }, [puja.id, homeOk, templeOk])

  const handleAdd = () => {
    if (!location) return
    const ok = onAdd(puja, location)
    if (!ok) return
    setJustAdded(true)
    window.setTimeout(() => setJustAdded(false), 1400)
  }

  return (
    <article
      className="puja-card"
      data-reveal
      style={{ transitionDelay: `${Math.min(index, 12) * 0.04}s` }}
    >
      <div className="puja-card__accent" aria-hidden="true" />
      <h2 className="puja-card__name">{puja.name}</h2>

      <div className="puja-card__prices">
        <div className={`puja-card__price ${!homeOk ? 'is-disabled' : ''}`}>
          <span>Home</span>
          <strong>{formatAmount(puja.home_amount)}</strong>
        </div>
        <div className={`puja-card__price ${!templeOk ? 'is-disabled' : ''}`}>
          <span>Temple</span>
          <strong>{formatAmount(puja.temple_amount)}</strong>
        </div>
      </div>

      {(homeOk || templeOk) && (
        <fieldset className="puja-card__location">
          <legend className="visually-hidden">Booking location</legend>
          {homeOk && (
            <label className={location === 'home' ? 'is-active' : ''}>
              <input
                type="radio"
                name={`loc-${puja.id}`}
                value="home"
                checked={location === 'home'}
                onChange={() => setLocation('home')}
              />
              Book at home
            </label>
          )}
          {templeOk && (
            <label className={location === 'temple' ? 'is-active' : ''}>
              <input
                type="radio"
                name={`loc-${puja.id}`}
                value="temple"
                checked={location === 'temple'}
                onChange={() => setLocation('temple')}
              />
              Book at temple
            </label>
          )}
        </fieldset>
      )}

      {homeOk || templeOk ? (
        <button
          type="button"
          className={`puja-card__add ${justAdded ? 'is-added' : ''}`}
          onClick={handleAdd}
        >
          {justAdded ? 'Added to cart' : 'Add to cart'}
        </button>
      ) : (
        <p className="puja-card__note">Contact temple for pricing</p>
      )}
    </article>
  )
}

export default function Pujas() {
  const { addItem, count } = useCart()
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
        const res = await fetch(getPujasUrl(), { signal: controller.signal })
        if (!res.ok) throw new Error(`Could not load pujas (${res.status})`)
        const json = await res.json()
        const rows = Array.isArray(json?.data) ? json.data : []
        const published = rows
          .filter((row) => row.publish !== false)
          .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name))
        setPujas(published)
        setStatus('ready')
      } catch (err) {
        if (err.name === 'AbortError') return
        setError(err.message || 'Unable to reach the temple API.')
        setStatus('error')
      }
    }

    load()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const root = document.querySelector('.pujas-page')
    if (!root) return undefined

    const nodes = root.querySelectorAll('[data-reveal]:not(.is-revealed)')
    if (!nodes.length) return undefined

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      nodes.forEach((node) => node.classList.add('is-revealed'))
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
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [status, pujas, query])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pujas
    return pujas.filter((puja) => puja.name.toLowerCase().includes(q))
  }, [pujas, query])

  return (
    <div className="pujas-page">
      <div className="pujas-page__bg" aria-hidden="true">
        <img src={TEMPLE_IMAGE} alt="" className="pujas-page__image" />
        <div className="pujas-page__veil" />
      </div>

      <header className="pujas-top">
        <Link to="/" className="pujas-top__back">
          ← Home
        </Link>
        <img
          className="pujas-top__logo"
          src={LOGO}
          alt="Hindu Temple Omaha, NE"
          width={320}
          height={110}
        />
        <Link to="/checkout" className="pujas-top__cart">
          Cart{count > 0 ? ` (${count})` : ''}
        </Link>
      </header>

      <main className="pujas-main pujas-main--wide">
        <header className="pujas-hero is-revealed">
          <p className="pujas-hero__eyebrow">Sacred offerings</p>
          <h1 className="pujas-hero__title">Explore Puja</h1>
          <p className="pujas-hero__lede">
            Choose home or temple booking, then add pujas to your cart.
          </p>
        </header>

        {status === 'loading' && (
          <div className="pujas-loading">
            <TempleLoader />
          </div>
        )}

        {status === 'error' && (
          <div className="pujas-message" role="alert">
            <p>{error}</p>
            <p className="pujas-message__hint">
              Make sure the API is running at{' '}
              <code>{import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'}</code>
            </p>
          </div>
        )}

        {status === 'ready' && (
          <>
            <div className="pujas-toolbar" data-reveal>
              <label className="pujas-search">
                <span className="visually-hidden">Search pujas</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search puja by name…"
                  autoComplete="off"
                />
              </label>
              <p className="pujas-count">
                {filtered.length} of {pujas.length} pujas
              </p>
            </div>

            <div className="puja-grid">
              {filtered.map((puja, index) => (
                <PujaCard key={puja.id} puja={puja} index={index} onAdd={addItem} />
              ))}
            </div>

            {filtered.length === 0 && (
              <p className="pujas-message">No pujas match your search.</p>
            )}

            {count > 0 && (
              <div className="pujas-checkout-bar">
                <Link to="/checkout" className="pujas-checkout-bar__btn">
                  Go to checkout ({count})
                </Link>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
