import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { hasAmount } from './api'

const CartContext = createContext(null)
const STORAGE_KEY = 'htom-puja-cart'

function readStoredCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => readStoredCart())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const value = useMemo(() => {
    const addItem = (puja, location) => {
      const amount = location === 'home' ? puja.home_amount : puja.temple_amount
      if (!hasAmount(amount)) return { ok: false, reason: 'no-amount' }

      const allowMultiple = (import.meta.env.VITE_PUJA_MODE || '').toLowerCase() === 'multiple'

      // enforce single-puja cart if not allowed multiple different pujas
      const key = `${puja.id}-${location}`
      if (!allowMultiple) {
        if (items.length > 0) {
          // if adding same item, allow incrementing quantity
          const singleKey = items[0].key
          if (singleKey !== key) return { ok: false, reason: 'single' }
        }
      }

      setItems((prev) => {
        const existingLocal = prev.find((item) => item.key === key)
        if (existingLocal) {
          return prev.map((item) =>
            item.key === key ? { ...item, quantity: item.quantity + 1 } : item,
          )
        }
        return [
          ...prev,
          {
            key,
            id: puja.id,
            name: puja.name,
            location,
            amount,
            home_amount: puja.home_amount ?? 0,
            temple_amount: puja.temple_amount ?? 0,
            quantity: 1,
          },
        ]
      })
      return { ok: true }
    }

    const removeItem = (key) => {
      setItems((prev) => prev.filter((item) => item.key !== key))
    }

    const clearCart = () => setItems([])

    const count = items.reduce((sum, item) => sum + item.quantity, 0)
    const total = items.reduce((sum, item) => sum + item.amount * item.quantity, 0)

    const bookingLocation = (() => {
      if (!items.length) return null
      const locations = [...new Set(items.map((item) => item.location))]
      return locations.length === 1 ? locations[0] : 'mixed'
    })()

    return {
      items,
      count,
      total,
      bookingLocation,
      addItem,
      removeItem,
      clearCart,
    }
  }, [items])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
