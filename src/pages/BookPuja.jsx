import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { getPujasUrl, hasAmount } from '../api'
import { useCart } from '../cart'
import { Logo } from '../components/Brand'
import { TempleLoader } from '../components/TempleLoader'
import '../App.css'
import './Pujas.css'

export default function BookPuja() {
  const { pujaId } = useParams()
  const { replaceWithItem } = useCart()
  const [state, setState] = useState('loading')

  useEffect(() => {
    if (!pujaId) {
      setState('not-found')
      return
    }

    const controller = new AbortController()

    async function load() {
      try {
        const res = await fetch(getPujasUrl(), { signal: controller.signal })
        if (!res.ok) throw new Error('fetch failed')

        const json = await res.json()
        const rows = Array.isArray(json?.data) ? json.data : []
        const puja = rows.find((r) => String(r.id) === String(pujaId))

        if (!puja) {
          setState('not-found')
          return
        }

        const location = hasAmount(puja.temple_amount)
          ? 'temple'
          : hasAmount(puja.home_amount)
            ? 'home'
            : ''

        if (!location) {
          setState('not-found')
          return
        }

        const result = replaceWithItem(puja, location)
        if (!result?.ok) { setState('not-found'); return }
        setState('ready')
      } catch (err) {
        if (err.name === 'AbortError') return
        setState('error')
      }
    }

    load()
    return () => controller.abort()
  }, [pujaId])

  if (state === 'ready') return <Navigate to="/checkout" replace />
  if (state === 'not-found') return <Navigate to="/pujas" replace />

  return (
    <div className="pujas-page">
      <header className="app-bar">
        <div className="app-bar__inner">
          <Logo />
        </div>
      </header>
      <main className="pujas-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        {state === 'error' ? (
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.95rem' }}>
            Could not load puja details. Please try again.
          </p>
        ) : (
          <TempleLoader label="Loading puja" />
        )}
      </main>
    </div>
  )
}
