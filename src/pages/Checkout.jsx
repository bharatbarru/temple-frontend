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

function formatHour(hour24) {
  const suffix = hour24 >= 12 ? 'pm' : 'am'
  const h = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${h}${suffix}`
}

const TIME_SLOTS = Array.from({ length: 14 }, (_, i) => {
  const start = 6 + i
  const end = start + 1
  return { startHour: start, label: `${formatHour(start)} to ${formatHour(end)}` }
})

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getNextDayISO(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getAvailableSlots(dateStr) {
  if (!dateStr) return TIME_SLOTS

  const today = todayISO()
  if (dateStr > today) return TIME_SLOTS
  if (dateStr < today) return []

  const currentHour = new Date().getHours()
  return TIME_SLOTS.filter((slot) => slot.startHour > currentHour)
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

/**
 * North American Numbering Plan. The area code and the exchange both have to
 * start 2-9, and N11 area codes (911, 411, 211 ...) are reserved for services
 * and never assigned. Catches made-up numbers like (123) 456-7890 that a plain
 * ten-digit length check would wave through.
 */
const NANP = /^(?!\d11)[2-9]\d{2}[2-9]\d{6}$/

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
  alternateDate: '',
  alternateTime: '',
  comments: '',
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

            // Submit the order as soon as PayPal capture succeeds.
            // The order payload now carries the PayPal fields too, which lets the
            // backend receive everything in one round-trip where possible.
            const created = await submitPujaOrder({
              ...orderPayload,
              paypal,
            })
            const pujaRequestId = created?.data?.puja_request_id || ''

            if (!pujaRequestId) {
              const confirmed = await confirmPaypalSuccess({
                pujaRequestId,
                email,
                paypal,
              })
              onPaid(confirmed, pujaRequestId)
              return
            }

            onPaid(created, pujaRequestId)
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
  const [form, setForm] = useState(INITIAL_FORM)
  const [requestId, setRequestId] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [awaitingPayment, setAwaitingPayment] = useState(false)
  const [pendingAmount, setPendingAmount] = useState(0)
  const [pendingPayload, setPendingPayload] = useState(null)
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const empty = count === 0
  const locationMixed = bookingLocation === 'mixed'
  const minDate = todayISO()
  const minAlternateDate = form.dateOfPuja ? getNextDayISO(form.dateOfPuja) : minDate
  const paypalClientId = getPaypalClientId()
  const paypalCurrency = getPaypalCurrency()

  const primarySlots = useMemo(
    () => getAvailableSlots(form.dateOfPuja),
    [form.dateOfPuja],
  )
  const alternateSlots = useMemo(
    () => getAvailableSlots(form.alternateDate),
    [form.alternateDate],
  )

  useEffect(() => {
    if (form.timeOfPuja && !primarySlots.some((s) => s.label === form.timeOfPuja)) {
      setForm((prev) => ({ ...prev, timeOfPuja: '' }))
    }
  }, [form.dateOfPuja, form.timeOfPuja, primarySlots])

  useEffect(() => {
    if (
      form.alternateTime &&
      !alternateSlots.some((s) => s.label === form.alternateTime)
    ) {
      setForm((prev) => ({ ...prev, alternateTime: '' }))
    }
  }, [form.alternateDate, form.alternateTime, alternateSlots])

  useEffect(() => {
    if (!form.dateOfPuja || !form.alternateDate) return
    if (form.alternateDate <= form.dateOfPuja) {
      setForm((prev) => ({ ...prev, alternateDate: '', alternateTime: '' }))
    }
  }, [form.dateOfPuja, form.alternateDate])

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
    else if (phone.length !== 10) next.mobile = 'Enter a 10 digit US phone number'
    else if (!NANP.test(phone)) next.mobile = 'Check the number, that is not a valid US number'

    if (!form.email.trim()) next.email = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) next.email = 'Enter a valid email address'
    if (!form.dateOfPuja) next.dateOfPuja = 'Required'
    if (!form.timeOfPuja) next.timeOfPuja = 'Required'
    if (form.pincode && ![5, 9].includes(digitsOf(form.pincode).length)) {
      next.pincode = 'Enter a 5 digit ZIP code'
    }
    if (form.alternateDate && !form.dateOfPuja) {
      next.alternateDate = 'Choose the preferred date first'
    } else if (form.alternateDate && form.alternateDate <= form.dateOfPuja) {
      next.alternateDate = 'Alternate date must be after the preferred date'
    } else if (form.alternateDate && !form.alternateTime) {
      next.alternateTime = 'Choose a time for the alternate date'
    }
    if (form.alternateTime && !form.alternateDate) {
      next.alternateDate = 'Select an alternate date first'
    }
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
                    <label className="puja-form__full">
                      <span className="visually-hidden">Address</span>
                      {/* Deliberately unfiltered: street addresses need digits */}
                      <input
                        name="address"
                        value={form.address}
                        onChange={onChange}
                        placeholder="Address"
                        autoComplete="street-address"
                        autoCapitalize="words"
                        enterKeyHint="next"
                        maxLength={120}
                      />
                    </label>
                    <label>
                      <span className="visually-hidden">Country</span>
                      <input
                        name="country"
                        value={form.country}
                        onChange={onChange}
                        placeholder="Country"
                        autoComplete="country-name"
                        autoCapitalize="words"
                        enterKeyHint="next"
                        maxLength={56}
                      />
                    </label>
                    <label>
                      <span className="visually-hidden">State</span>
                      <input
                        name="state"
                        value={form.state}
                        onChange={onChange}
                        placeholder="State"
                        autoComplete="address-level1"
                        autoCapitalize="words"
                        enterKeyHint="next"
                        maxLength={40}
                      />
                    </label>
                    <label>
                      <span className="visually-hidden">City</span>
                      <input
                        name="city"
                        value={form.city}
                        onChange={onChange}
                        placeholder="City"
                        autoComplete="address-level2"
                        autoCapitalize="words"
                        enterKeyHint="next"
                        maxLength={58}
                      />
                    </label>
                    <label className={errors.pincode ? 'has-error' : ''}>
                      <span className="visually-hidden">ZIP Code</span>
                      <input
                        name="pincode"
                        value={form.pincode}
                        onChange={onChange}
                        placeholder="ZIP Code"
                        autoComplete="postal-code"
                        inputMode="numeric"
                        enterKeyHint="next"
                        maxLength={10}
                      />
                      {errors.pincode && <p className="field-error">{errors.pincode}</p>}
                    </label>
                  </div>

                  <div className="puja-form__availability">
                    <a href="https://www.trumba.com/calendars/private-pujas?type=Puja" target='_blank'>
                    <h3>Check Puja Availability</h3></a>
                    <div className="puja-form__grid">
                      <label className={errors.dateOfPuja ? 'has-error' : ''}>
                        <span className="field-label">Date of Puja *</span>
                        <input
                          type="date"
                          name="dateOfPuja"
                          value={form.dateOfPuja}
                          onChange={onChange}
                          min={minDate}
                          required
                        />
                        {errors.dateOfPuja && <p className="field-error">{errors.dateOfPuja}</p>}
                      </label>
                      <label className={errors.timeOfPuja ? 'has-error' : ''}>
                        <span className="field-label">Time of Puja *</span>
                        <select
                          className="theme-select"
                          name="timeOfPuja"
                          value={form.timeOfPuja}
                          onChange={onChange}
                          required
                        >
                          <option value="">Select 1-hour slot</option>
                          {primarySlots.map((slot) => (
                            <option key={slot.label} value={slot.label}>
                              {slot.label}
                            </option>
                          ))}
                        </select>
                        {form.dateOfPuja && primarySlots.length === 0 && (
                          <span className="field-hint">
                            No upcoming slots left for this date.
                          </span>
                        )}
                        {errors.timeOfPuja && <p className="field-error">{errors.timeOfPuja}</p>}
                      </label>
                      <label className={errors.alternateDate ? 'has-error' : ''}>
                        <span className="field-label">Alternate Date of Puja</span>
                        <input
                          type="date"
                          name="alternateDate"
                          value={form.alternateDate}
                          onChange={onChange}
                          min={minAlternateDate}
                        />
                        {errors.alternateDate && <p className="field-error">{errors.alternateDate}</p>}
                      </label>
                      <label className={errors.alternateTime ? 'has-error' : ''}>
                        <span className="field-label">Alternative Time of Puja</span>
                        <select
                          className="theme-select"
                          name="alternateTime"
                          value={form.alternateTime}
                          onChange={onChange}
                        >
                          <option value="">Select 1-hour slot</option>
                          {alternateSlots.map((slot) => (
                            <option key={`alt-${slot.label}`} value={slot.label}>
                              {slot.label}
                            </option>
                          ))}
                        </select>
                        {errors.alternateTime && <p className="field-error">{errors.alternateTime}</p>}
                      </label>
                    </div>
                  </div>

                  <label className="puja-form__full">
                    <span className="field-label">Comments</span>
                    <textarea
                      name="comments"
                      value={form.comments}
                      onChange={onChange}
                      placeholder="Anything the priest should know"
                      rows={3}
                      autoCapitalize="sentences"
                      enterKeyHint="done"
                      maxLength={500}
                    />
                  </label>

                  <label className={`puja-form__agree${errors.agree ? ' has-error' : ''}`}>
                    <input
                      type="checkbox"
                      name="agree"
                      checked={form.agree}
                      onChange={onChange}
                    />
                    <span>I Agree to the terms and conditions</span>
                  </label>
                  {errors.agree && <p className="field-error">{errors.agree}</p>}

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
