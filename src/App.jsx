import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CartProvider } from './cart'
import Checkout from './pages/Checkout'
import Pujas from './pages/Pujas'

export default function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/pujas" replace />} />
          <Route path="/pujas" element={<Pujas />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="*" element={<Navigate to="/pujas" replace />} />
        </Routes>
      </BrowserRouter>
    </CartProvider>
  )
}
