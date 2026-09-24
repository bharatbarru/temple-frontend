import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  buildPaypalPaymentPayload,
  buildPujaOrderPayload,
  confirmPaypalSuccess,
  formatMoney,
  getPaypalClientId,
  getPaypalCurrency,
  isDirectOrderSubmit,
  submitPujaOrder,
} from '../api'
import { useCart } from '../cart'
import { TempleLoader } from '../components/TempleLoader'
import { Diamond, Logo, Ornament } from '../components/Brand'
import '../App.css'
import './Pujas.css'
import './Checkout.css'

const DIRECT_SUBMIT = isDirectOrderSubmit()

// The temple keeps US Central time. Devotees book from every timezone, so the
// clock shown here is the temple's, never the visitor's. Intl handles the
// CST/CDT switch on its own.
const TEMPLE_TZ = 'America/Chicago'

function todayISO() {
  // en-CA renders as YYYY-MM-DD, which is the shape the backend stores.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TEMPLE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function currentTimeLabel() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEMPLE_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).formatToParts(new Date())
  const get = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase()} ${get('timeZoneName')}`
}

// The stored date stays ISO for the backend; this is the human-facing echo.
// Parsed and formatted in UTC so the calendar day can never shift by one.
function formatDateLabel(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const SLOKAS = [
  {
    sanskrit: 'ॐ सर्वे भवन्तु सुखिनः',
    meaning: 'May all beings be happy.',
  },
  {
    sanskrit: 'ॐ असतो मा सद्गमय',
    meaning: 'Lead us from the unreal to the real.',
  },
  {
    sanskrit: 'ॐ शान्तिः शान्तिः शान्तिः',
    meaning: 'Peace, peace, peace.',
  },
  {
    sanskrit: 'ॐ तमसो मा ज्योतिर्गमय',
    meaning: 'Lead us from darkness to light.',
  },
  {
    sanskrit: 'ॐ पूर्णमदः पूर्णमिदं',
    meaning: 'That is whole; this is whole.',
  },
]

/* ── Field formatters ──────────────────────────────────────────────
   Each returns the value as it should appear in the input. Digits are
   stripped back out before the payload is built, so the wire format is
   unchanged by the masks. */

const digitsOf = (value) => value.replace(/\D/g, '')

/** Letters, spaces, apostrophes, hyphens and periods. Unicode-aware, so
 *  accented and non-Latin names are not mangled. */
const nameLike = (value) =>
  value.replace(/[^\p{L}\p{M}\s'.-]/gu, '').replace(/\s{2,}/g, ' ')

const PHONE_10 = /^\d{10}$/

/** (402) 697-8546 */
function formatPhone(value) {
  let raw = digitsOf(value)

  // Drop a leading US country code. Autofill and pasted numbers often arrive
  // as +1XXXXXXXXXX, and no US area code starts with 1, so 11 digits opening
  // with a 1 is unambiguous.
  if (raw.length === 11 && raw.startsWith('1')) raw = raw.slice(1)

  const d = raw.slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

/** 68144, or 68144-1234 once past five digits */
function formatZip(value) {
  const d = digitsOf(value).slice(0, 9)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  mobile: '',
  email: '',
  address: '',
  country: '',
  state: '',
  city: '',
  pincode: '',
  dateOfPuja: '',
  timeOfPuja: '',
  agree: false,
}

function SlokaOverlay({ hint }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % SLOKAS.length)
    }, 4200)
    return () => window.clearInterval(id)
  }, [])

  const sloka = SLOKAS[index]

  return (
    <div className="sloka-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="sloka-overlay__panel">
        <Ornament />
        <p className="sloka-overlay__sanskrit" key={`s-${index}`}>
          {sloka.sanskrit}
        </p>
        <p className="sloka-overlay__meaning" key={`m-${index}`}>
          {sloka.meaning}
        </p>
        <Ornament />
        <p className="sloka-overlay__hint">
          {hint || 'Please wait while your puja request is submitted.'}
        </p>
        <TempleLoader label="Submitting" />
      </div>
    </div>
  )
}

function PaypalCheckout({
  amount,
  currency,
  email,
  orderPayload,
  onPaid,
  onError,
}) {
  const [paying, setPaying] = useState(false)

  return (
    <div className="paypal-box">
      <p className="paypal-box__eyebrow">Complete payment</p>
      <h3 className="paypal-box__title">Pay with PayPal</h3>
      <p className="paypal-box__meta">
        Amount due <strong>{formatMoney(amount)}</strong>
      </p>
      <p className="paypal-box__note">
        Your order is sent to the temple only after PayPal payment succeeds.
      </p>

      {paying && <SlokaOverlay hint="Payment received — saving your puja order…" />}

      <PayPalButtons
        style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' }}
        disabled={paying}
        createOrder={(_data, actions) =>
          actions.order.create({
            purchase_units: [
              {
                description: 'Hindu Temple Omaha puja booking',
                amount: {
                  currency_code: currency,
                  value: Number(amount).toFixed(2),
                },
              },
            ],
            application_context: {
              shipping_preference: 'NO_SHIPPING',
              user_action: 'PAY_NOW',
            },
          })
        }
        onApprove={async (data, actions) => {
          setPaying(true)
          try {
            // Capture money first — do not call our backend before this succeeds
            const details = await actions.order.capture()
            const paypalOrderId = data.orderID || details?.id
            const paypal = buildPaypalPaymentPayload(details, paypalOrderId, amount)

            // Create the puja order first, then explicitly call the backend
            // paypal-success endpoint with the PayPal fields so the payment is
            // recorded and confirmation mails are sent.
            const created = await submitPujaOrder(orderPayload)
            const pujaRequestId = created?.data?.puja_request_id

            if (!pujaRequestId) {
              throw new Error('Failed to create puja request before confirming PayPal payment.')
            }

            const confirmed = await confirmPaypalSuccess({
              pujaRequestId,
              email,
              paypal,
            })

            onPaid(confirmed, pujaRequestId)
          } catch (err) {
            onError(err.message || 'PayPal payment confirmation failed.')
          } finally {
            setPaying(false)
          }
        }}
        onError={() => {
          onError('PayPal could not complete the payment. Please try again.')
        }}
        onCancel={() => {
          onError('PayPal payment was cancelled. No order was sent to the temple.')
        }}
      />
    </div>
  )
}

export default function Checkout() {
  const { items, total, count, bookingLocation, removeItem, clearCart } = useCart()
  const navigate = useNavigate()
  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    dateOfPuja: todayISO(),
    timeOfPuja: currentTimeLabel(),
  }))
  const [requestId, setRequestId] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [awaitingPayment, setAwaitingPayment] = useState(false)
  const [pendingAmount, setPendingAmount] = useState(0)
  const [pendingPayload, setPendingPayload] = useState(null)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showTerms, setShowTerms] = useState(false)

  const empty = count === 0
  const locationMixed = bookingLocation === 'mixed'
  // Address details are only collected once the order passes $100, the same
  // threshold the general donation page uses.
  const addressRequired = total > 100
  const paypalClientId = getPaypalClientId()
  const paypalCurrency = getPaypalCurrency()

  // Nothing typed into the address block should survive it being hidden, or
  // the request would carry values the devotee can no longer see or edit.
  useEffect(() => {
    if (addressRequired) return
    setForm((previous) =>
      previous.address || previous.country || previous.state || previous.city || previous.pincode
        ? { ...previous, address: '', country: '', state: '', city: '', pincode: '' }
        : previous,
    )
  }, [addressRequired])

  // Both fields are read-only mirrors of the clock, so keep them ticking
  // rather than freezing whatever the moment of mount happened to be.
  useEffect(() => {
    const id = window.setInterval(() => {
      setForm((prev) => {
        const dateOfPuja = todayISO()
        const timeOfPuja = currentTimeLabel()
        if (prev.dateOfPuja === dateOfPuja && prev.timeOfPuja === timeOfPuja) {
          return prev
        }
        return { ...prev, dateOfPuja, timeOfPuja }
      })
    }, 30000)
    return () => window.clearInterval(id)
  }, [])

  const summaryLines = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        lineTotal: item.amount * item.quantity,
      })),
    [items],
  )

  // With a single line the total already states the figure, so repeating it
  // per line is noise. Show line prices only once they can differ.
  const showLinePrices = summaryLines.length > 1

  const onChange = (e) => {
    const { name, value, type, checked } = e.target
    let nextValue = type === 'checkbox' ? checked : value

    switch (name) {
      case 'firstName':
      case 'lastName':
      case 'city':
      case 'state':
      case 'country':
        nextValue = nameLike(value)
        break
      case 'mobile':
        nextValue = formatPhone(value)
        break
      case 'pincode':
        nextValue = formatZip(value)
        break
      case 'email':
        // Spaces are never valid here and are easy to pick up from autofill
        nextValue = value.replace(/\s/g, '')
        break
      default:
        break
    }

    setForm((prev) => ({ ...prev, [name]: nextValue }))

    // Clear a field's error as soon as the person starts correcting it
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev))
  }

  const validate = () => {
    const next = {}
    if (!form.firstName.trim()) next.firstName = 'Required'
    else if (form.firstName.trim().length < 2) next.firstName = 'Enter your full first name'

    if (!form.lastName.trim()) next.lastName = 'Required'
    else if (form.lastName.trim().length < 2) next.lastName = 'Enter your full last name'

    const phone = digitsOf(form.mobile)
    if (!phone) next.mobile = 'Required'
    else if (!PHONE_10.test(phone)) next.mobile = 'Enter a 10 digit phone number'

    if (!form.email.trim()) next.email = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) next.email = 'Enter a valid email address'
    if (addressRequired) {
      if (!form.address.trim()) next.address = 'Required'
      if (!form.country.trim()) next.country = 'Required'
      if (!form.state.trim()) next.state = 'Required'
      if (!form.city.trim()) next.city = 'Required'
      if (!form.pincode.trim()) next.pincode = 'Required'
      else if (![5, 9].includes(digitsOf(form.pincode).length)) {
        next.pincode = 'Enter a 5 digit ZIP code'
      }
    }
    if (!form.dateOfPuja) next.dateOfPuja = 'Required'
    if (!form.timeOfPuja) next.timeOfPuja = 'Required'
    if (!form.agree) next.agree = 'Please agree to the terms and conditions'
    if (empty) next.cart = 'Add at least one puja'
    if (locationMixed) {
      next.cart =
        'Cart has both home and temple bookings. Please keep one location per order.'
    }
    if (!bookingLocation || bookingLocation === 'mixed') {
      next.location = 'Location must be home or temple'
    }
    if (!DIRECT_SUBMIT && !paypalClientId) {
      next.paypal = 'PayPal client ID is missing in env (VITE_PAYPAL_CLIENT_ID).'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const finishSuccess = (id) => {
    setRequestId(id || '')
    setSubmitted(true)
    setAwaitingPayment(false)
    clearCart()
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    if (!validate()) return

    const location = bookingLocation
    if (location !== 'home' && location !== 'temple') {
      setSubmitError('Location must be either temple or home.')
      return
    }

    const payload = buildPujaOrderPayload(form, items, location)

    // Direct mode: send to backend immediately
    if (DIRECT_SUBMIT) {
      setSubmitting(true)
      try {
        const json = await submitPujaOrder(payload)
        finishSuccess(json?.data?.puja_request_id || '')
      } catch (err) {
        setSubmitError(err.message || 'Could not submit puja request.')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // PayPal mode: do NOT call backend yet — wait until payment succeeds
    setPendingPayload(payload)
    setPendingAmount(total)
    setAwaitingPayment(true)
  }

  if (submitted) {
    return (
      <div className="checkout-page">
        <header className="app-bar">
          <div className="app-bar__inner">
            <Logo />
          </div>
        </header>

        <div className="checkout-success">
          <Diamond className="checkout-success__mark" />
          <p className="eyebrow">Request received</p>
          <h1 className="checkout-success__title">Thank you</h1>
          <Ornament />
          <p className="checkout-success__body">
            {DIRECT_SUBMIT
              ? 'Your puja request has been sent to the temple. A priest will confirm your date and time shortly.'
              : 'Your payment was received and your puja is confirmed. A priest will be in touch to confirm the details.'}
          </p>
          {requestId && (
            <p className="checkout-success__id">
              <span>Request ID</span>
              <strong>{requestId}</strong>
            </p>
          )}
          <Link to="/pujas" className="btn btn--primary">
            Book another puja
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="checkout-page">
      {submitting && <SlokaOverlay />}

      <header className="app-bar">
        <div className="app-bar__inner">
          <button
            type="button"
            className="app-bar__back"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M12 4 6 10l6 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <Logo />
        </div>
      </header>

      <main className="checkout-main">
        <header className="checkout-hero">
          <p className="eyebrow">Complete your request</p>
          <h1 className="checkout-hero__title">Checkout</h1>
          <Ornament />
        </header>

        <div className="checkout-layout">
          <section className="checkout-summary" aria-labelledby="summary-heading">
            <h2 id="summary-heading">Order summary</h2>

            {awaitingPayment ? (
              <div className="checkout-empty">
                <p>Complete PayPal payment to send your order to the temple.</p>
                <p className="summary-location">
                  Amount due: <strong>{formatMoney(pendingAmount)}</strong>
                </p>
                <button
                  type="button"
                  className="checkout-link"
                  onClick={() => {
                    setAwaitingPayment(false)
                    setPendingPayload(null)
                    setSubmitError('')
                  }}
                >
                  ← Back to form
                </button>
              </div>
            ) : empty ? (
              <div className="checkout-empty">
                <p>Your cart is empty.</p>
                <Link to="/pujas" className="checkout-link">
                  Browse pujas
                </Link>
              </div>
            ) : (
              <ul className="summary-list">
                {summaryLines.map((item) => (
                  <li key={item.key} className="summary-item">
                    <div className="summary-item__head">
                      <h3>{item.name}</h3>
                      {/* The line price only earns its place when it differs
                          from the total below it. */}
                      {showLinePrices && (
                        <p className="summary-item__line">
                          {formatMoney(item.lineTotal)}
                        </p>
                      )}
                    </div>

                    <div className="summary-item__meta">
                      {item.quantity > 1 && (
                        <span className="summary-item__qty">
                          {item.quantity} &times; {formatMoney(item.amount)}
                        </span>
                      )}
                      {item.location === 'home' && (
                        <span className="summary-item__tag">At your home</span>
                      )}
                      <button
                        type="button"
                        className="summary-item__remove"
                        onClick={() => removeItem(item.key)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {!awaitingPayment && !empty && (
              <div className="summary-total">
                <span>Total</span>
                <strong>{formatMoney(total)}</strong>
              </div>
            )}
            {errors.cart && <p className="field-error">{errors.cart}</p>}
            {errors.location && <p className="field-error">{errors.location}</p>}
            {errors.paypal && <p className="field-error">{errors.paypal}</p>}
          </section>

          <section className="checkout-form-wrap" aria-labelledby="form-heading">
            {awaitingPayment ? (
              <>
                <h2 id="form-heading">PayPal checkout</h2>
                {submitError && (
                  <p className="field-error" role="alert">
                    {submitError}
                  </p>
                )}
                {paypalClientId && pendingPayload ? (
                  <PayPalScriptProvider
                    options={{
                      clientId: paypalClientId,
                      currency: paypalCurrency,
                      intent: 'capture',
                    }}
                  >
                    <PaypalCheckout
                      amount={pendingAmount}
                      currency={paypalCurrency}
                      email={form.email.trim()}
                      orderPayload={pendingPayload}
                      onPaid={(_json, pujaRequestId) => {
                        finishSuccess(pujaRequestId)
                      }}
                      onError={(message) => setSubmitError(message)}
                    />
                  </PayPalScriptProvider>
                ) : (
                  <p className="field-error">
                    Add <code>VITE_PAYPAL_CLIENT_ID</code> to your env to enable PayPal.
                  </p>
                )}
              </>
            ) : (
              <>
                <h2 id="form-heading">Puja Request Form</h2>

                <form className="puja-form" onSubmit={onSubmit} noValidate>
                  <div className="puja-form__grid">
                    <label className={errors.firstName ? 'has-error' : ''}>
                      <span className="visually-hidden">First Name</span>
                      <input
                        name="firstName"
                        value={form.firstName}
                        onChange={onChange}
                        placeholder="First Name *"
                        autoComplete="given-name"
                        autoCapitalize="words"
                        enterKeyHint="next"
                        maxLength={40}
                      />
                      {errors.firstName && <p className="field-error">{errors.firstName}</p>}
                    </label>
                    <label className={errors.lastName ? 'has-error' : ''}>
                      <span className="visually-hidden">Last Name</span>
                      <input
                        name="lastName"
                        value={form.lastName}
                        onChange={onChange}
                        placeholder="Last Name *"
                        autoComplete="family-name"
                        autoCapitalize="words"
                        enterKeyHint="next"
                        maxLength={40}
                      />
                      {errors.lastName && <p className="field-error">{errors.lastName}</p>}
                    </label>
                    <label className={errors.mobile ? 'has-error' : ''}>
                      <span className="visually-hidden">Contact No</span>
                      <span className="field-phone">
                        <span className="field-phone__code" aria-hidden="true">+1</span>
                        <input
                          type="tel"
                          name="mobile"
                          value={form.mobile}
                          onChange={onChange}
                          placeholder="(555) 123-4567 *"
                          autoComplete="tel-national"
                          inputMode="tel"
                          enterKeyHint="next"
                          maxLength={14}
                        />
                      </span>
                      {errors.mobile && <p className="field-error">{errors.mobile}</p>}
                    </label>
                    <label className={errors.email ? 'has-error' : ''}>
                      <span className="visually-hidden">Email</span>
                      <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={onChange}
                        placeholder="Email *"
                        autoComplete="email"
                        inputMode="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="next"
                        maxLength={100}
                      />
                      {errors.email && <p className="field-error">{errors.email}</p>}
                    </label>
                    {addressRequired && (
                      <>
                        <p className="field-hint puja-form__full">
                          Requests over $100 need your address, country, state, city, and ZIP code.
                        </p>
                        <label className={`puja-form__full${errors.address ? ' has-error' : ''}`}>
                          <span className="visually-hidden">Address</span>
                          {/* Deliberately unfiltered: street addresses need digits */}
                          <input
                            name="address"
                            value={form.address}
                            onChange={onChange}
                            placeholder="Address *"
                            required
                            autoComplete="street-address"
                            autoCapitalize="words"
                            enterKeyHint="next"
                            maxLength={120}
                          />
                          {errors.address && <p className="field-error">{errors.address}</p>}
                        </label>
                        <label className={errors.country ? 'has-error' : ''}>
                          <span className="visually-hidden">Country</span>
                          <input
                            name="country"
                            value={form.country}
                            onChange={onChange}
                            placeholder="Country *"
                            required
                            autoComplete="country-name"
                            autoCapitalize="words"
                            enterKeyHint="next"
                            maxLength={56}
                          />
                          {errors.country && <p className="field-error">{errors.country}</p>}
                        </label>
                        <label className={errors.state ? 'has-error' : ''}>
                          <span className="visually-hidden">State</span>
                          <input
                            name="state"
                            value={form.state}
                            onChange={onChange}
                            placeholder="State *"
                            required
                            autoComplete="address-level1"
                            autoCapitalize="words"
                            enterKeyHint="next"
                            maxLength={40}
                          />
                          {errors.state && <p className="field-error">{errors.state}</p>}
                        </label>
                        <label className={errors.city ? 'has-error' : ''}>
                          <span className="visually-hidden">City</span>
                          <input
                            name="city"
                            value={form.city}
                            onChange={onChange}
                            placeholder="City *"
                            required
                            autoComplete="address-level2"
                            autoCapitalize="words"
                            enterKeyHint="next"
                            maxLength={58}
                          />
                          {errors.city && <p className="field-error">{errors.city}</p>}
                        </label>
                        <label className={errors.pincode ? 'has-error' : ''}>
                          <span className="visually-hidden">ZIP Code</span>
                          <input
                            name="pincode"
                            value={form.pincode}
                            onChange={onChange}
                            placeholder="ZIP Code *"
                            required
                            autoComplete="postal-code"
                            inputMode="numeric"
                            enterKeyHint="next"
                            maxLength={10}
                          />
                          {errors.pincode && <p className="field-error">{errors.pincode}</p>}
                        </label>
                      </>
                    )}
                  </div>

                  <p className="puja-form__note">
                    Confirm with priest before placing the request
                  </p>

                  <div className="puja-form__availability">
                    
                    <div className="puja-form__grid">
                      <label>
                        <span className="field-label">Date of Puja</span>
                        <input
                          type="text"
                          value={formatDateLabel(form.dateOfPuja)}
                          readOnly
                          tabIndex={-1}
                        />
                      </label>
                      <label>
                        <span className="field-label">Time of Puja</span>
                        <input
                          type="text"
                          value={form.timeOfPuja}
                          readOnly
                          tabIndex={-1}
                        />
                      </label>
                    </div>
                  </div>

                  <label
                    className={`puja-form__agree${errors.agree ? ' has-error' : ''}`}
                    onClick={(e) => {
                      if (form.agree) return
                      e.preventDefault()
                      setShowTerms(true)
                    }}
                  >
                    <input
                      type="checkbox"
                      name="agree"
                      checked={form.agree}
                      onChange={onChange}
                      readOnly={!form.agree}
                    />
                    <span>I agree to terms and conditions and confirm that the payment is directly made to Hindu Temple Omaha.</span>
                  </label>
                  {errors.agree && <p className="field-error">{errors.agree}</p>}

                  {showTerms && (
                    <div
                      className="terms-overlay"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="terms-title"
                      onClick={() => setShowTerms(false)}
                    >
                      <div className="terms-panel" onClick={(e) => e.stopPropagation()}>
                        <h3 id="terms-title" className="terms-panel__title">Terms and Conditions</h3>
                        <Ornament />
                        <div className="terms-panel__body">
                          <p>I agree to terms and conditions and confirm that the payment is directly made to Hindu Temple Omaha.</p>
                        </div>
                        <div className="terms-panel__actions">
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => setShowTerms(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn--primary"
                            onClick={() => {
                              setForm((prev) => ({ ...prev, agree: true }))
                              setErrors((prev) => prev.agree ? { ...prev, agree: undefined } : prev)
                              setShowTerms(false)
                            }}
                          >
                            I Agree
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {submitError && (
                    <p className="field-error" role="alert">
                      {submitError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="btn btn--primary puja-form__submit"
                    disabled={empty || submitting}
                  >
                    {submitting
                      ? 'Submitting…'
                      : DIRECT_SUBMIT
                        ? 'Submit Request'
                        : 'Continue to PayPal'}
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
