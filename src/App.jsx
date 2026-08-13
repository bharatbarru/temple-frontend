import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CartProvider } from './cart'
import Checkout from './pages/Checkout'
import Home from './pages/Home'
import Pujas from './pages/Pujas'

export default function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Pujas />} />
          <Route path="/pujas" element={<Pujas />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="*" element={<Navigate to="/pujas" replace />} />
        </Routes>
      </BrowserRouter>
    </CartProvider>
  )
}
