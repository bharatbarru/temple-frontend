import {
  PayPalButtons,
  PayPalScriptProvider,
  usePayPalScriptReducer,
} from '@paypal/react-paypal-js'
import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  buildGeneralDonationPayload,
  buildPaypalPaymentPayload,
  confirmGeneralDonationPaypalSuccess,
  formatMoney,
  getPaypalClientId,
  getPaypalCurrency,
  submitGeneralDonation,
} from '../api'
import { Diamond, Logo, Ornament } from '../components/Brand'
import '../App.css'
import './Checkout.css'
import './GeneralDonation.css'

const INITIAL_FORM = {
  firstName: '',
  lastName: '',
  mobile: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  amount: '',
  agree: false,
}

const amountLike = (value) =>
  String(value ?? '').replace(/[^\d.]/g, '').replace(/(\..*?)\..*/g, '$1').slice(0, 9)

const digitsOf = (value) => value.replace(/\D/g, '')
const nameLike = (value) => value.replace(/[^\p{L}\p{M}\s'.-]/gu, '').replace(/\s{2,}/g, ' ')

function formatPhone(value) {
  let raw = digitsOf(value)
  if (raw.length === 11 && raw.startsWith('1')) raw = raw.slice(1)
  const digits = raw.slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function formatZip(value) {
  const digits = digitsOf(value).slice(0, 9)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

function PaypalDonation({ amount, email, donationPayload, onPaid, onError }) {
  const [paying, setPaying] = useState(false)
  const [{ isPending, isRejected }] = usePayPalScriptReducer()
  const currency = getPaypalCurrency()

  return (
    <div className="paypal-box">
      <p className="paypal-box__eyebrow">Complete your donation</p>
      <h2 className="paypal-box__title">Pay with PayPal</h2>
      <p className="paypal-box__meta">
        Donation amount <strong>{formatMoney(amount)}</strong>
      </p>
      <p className="paypal-box__note">
        Your donation is sent to Hindu Temple Omaha after PayPal payment succeeds.
      </p>
      {paying && <p className="donation-status" role="status">Payment received. Saving your donation...</p>}
      {isPending && <p className="donation-status" role="status">Loading PayPal...</p>}
      {isRejected ? (
        <p className="field-error" role="alert">
          PayPal could not load. Check the PayPal client ID and try again.
        </p>
      ) : (
        !isPending && (
          <PayPalButtons
            style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' }}
            disabled={paying}
            createOrder={(_data, actions) =>
              actions.order.create({
                purchase_units: [{
                  description: 'Hindu Temple Omaha general donation',
                  amount: { currency_code: currency, value: Number(amount).toFixed(2) },
                }],
                application_context: { shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
              })
            }
            onApprove={async (data, actions) => {
              setPaying(true)
              try {
                const details = await actions.order.capture()
                const paypal = buildPaypalPaymentPayload(details, data.orderID, amount)
                const created = await submitGeneralDonation(donationPayload)
                const donationRequestId = created?.data?.donation_request_id
                if (!donationRequestId) throw new Error('Failed to create donation request after payment.')

                const confirmed = await confirmGeneralDonationPaypalSuccess({
                  donationRequestId,
                  email,
                  paypal,
                })
                onPaid(confirmed, donationRequestId)
              } catch (error) {
                onError(error.message || 'PayPal payment confirmation failed.')
              } finally {
                setPaying(false)
              }
            }}
            onError={() => onError('PayPal could not complete the payment. Please try again.')}
            onCancel={() => onError('PayPal payment was cancelled. No donation was sent to the temple.')}
          />
        )
      )}
    </div>
  )
}

export default function GeneralDonation() {
  const navigate = useNavigate()
  const location = useLocation()
  // The amount is normally collected by the prompt on /pujas and handed over in
  // router state; landing here directly just leaves the field empty and locked.
  const [form, setForm] = useState(() => ({
    ...INITIAL_FORM,
    amount: amountLike(location.state?.amount),
  }))
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [pending, setPending] = useState(null)
  const [successId, setSuccessId] = useState('')
  const [showAmountPrompt, setShowAmountPrompt] = useState(false)
  const amountRef = useRef(null)
  const paypalClientId = getPaypalClientId()

  const amount = Number(form.amount)
  const addressRequired = amount > 100

  // The offering amount drives everything else on this page (address becomes
  // mandatory over $100, PayPal needs a figure), so the rest of the form stays
  // locked until it is given.
  const amountEntered = Number.isFinite(amount) && amount > 0

  const closeAmountPrompt = () => {
    setShowAmountPrompt(false)
    window.requestAnimationFrame(() => amountRef.current?.focus())
  }

  // Locked inputs stay focusable on purpose: a disabled input swallows the
  // click, and we need that click to explain itself.
  const lockProps = amountEntered
    ? {}
    : {
        readOnly: true,
        'aria-disabled': 'true',
        onMouseDown: (event) => {
          event.preventDefault()
          setShowAmountPrompt(true)
        },
        onFocus: (event) => {
          event.target.blur()
          setShowAmountPrompt(true)
        },
        onKeyDown: (event) => {
          if (event.key !== 'Tab') event.preventDefault()
        },
      }

  const onChange = (event) => {
    const { name, value, type, checked } = event.target
    let nextValue = type === 'checkbox' ? checked : value
    if (name === 'firstName' || name === 'lastName' || name === 'city' || name === 'state') nextValue = nameLike(value)
    if (name === 'mobile') nextValue = formatPhone(value)
    if (name === 'pincode') nextValue = formatZip(value)
    if (name === 'email') nextValue = value.replace(/\s/g, '')
    if (name === 'amount') nextValue = amountLike(value)
    setForm((previous) => ({ ...previous, [name]: nextValue }))
    setErrors((previous) => (previous[name] ? { ...previous, [name]: undefined } : previous))
    setSubmitError('')
  }

  const validate = () => {
    const next = {}
    if (!form.firstName.trim()) next.firstName = 'Required'
    if (!form.lastName.trim()) next.lastName = 'Required'
    const phone = digitsOf(form.mobile)
    if (!phone) next.mobile = 'Required'
    else if (phone.length !== 10) next.mobile = 'Enter a 10 digit phone number'
    if (!form.email.trim()) next.email = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email)) next.email = 'Enter a valid email address'
    if (!Number.isFinite(amount) || amount <= 0) next.amount = 'Enter a donation amount'
    if (addressRequired) {
      if (!form.address.trim()) next.address = 'Required for donations over $100'
      if (!form.city.trim()) next.city = 'Required for donations over $100'
      if (!form.state.trim()) next.state = 'Required for donations over $100'
      if (!form.pincode.trim()) next.pincode = 'Required for donations over $100'
      else if (![5, 9].includes(digitsOf(form.pincode).length)) next.pincode = 'Enter a valid ZIP code'
    }
    if (!form.agree) next.agree = 'Please agree before continuing'
    if (!paypalClientId) next.paypal = 'PayPal client ID is missing in env (VITE_PAYPAL_CLIENT_ID).'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = (event) => {
    event.preventDefault()
    if (!amountEntered) {
      setShowAmountPrompt(true)
      return
    }
    if (!validate()) return
    setPending({ payload: buildGeneralDonationPayload(form, amount), amount })
  }

  if (successId) {
    return (
      <div className="checkout-page">
        <header className="app-bar"><div className="app-bar__inner"><Logo /></div></header>
        <div className="checkout-success">
          <Diamond className="checkout-success__mark" />
          <p className="eyebrow">Donation received</p>
          <h1 className="checkout-success__title">Thank you</h1>
          <Ornament />
          <p className="checkout-success__body">Your donation was received by Hindu Temple Omaha. Thank you for supporting the temple.</p>
          <p className="checkout-success__id"><span>Donation ID</span><strong>{successId}</strong></p>
          <Link to="/pujas" className="btn btn--primary">Return to temple offerings</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="checkout-page">
      <header className="app-bar">
        <div className="app-bar__inner">
          <button type="button" className="app-bar__back" onClick={() => navigate(-1)} aria-label="Go back">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12 4 6 10l6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <Logo />
        </div>
      </header>

      <main className="checkout-main donation-main">
        <header className="checkout-hero">
          <p className="eyebrow">Support the temple</p>
          <h1 className="checkout-hero__title">General Donation</h1>
          <Ornament />
          <p className="donation-intro">Offer any amount directly to Hindu Temple Omaha.</p>
        </header>

        <div className="checkout-layout donation-layout">
          <section className="checkout-summary donation-summary">
            <h2>Your offering</h2>
            {pending ? (
              // Once the PayPal order is priced, the figure is fixed. Editing it
              // here would drift from what is actually being charged.
              <p className="donation-summary__amount">{formatMoney(pending.amount)}</p>
            ) : (
              <>
                <label className={`donation-summary__field ${errors.amount ? 'has-error' : ''}`}>
                  <span className="visually-hidden">Donation amount</span>
                  <span className="donation-summary__entry">
                    <span className="donation-summary__currency" aria-hidden="true">$</span>
                    <input
                      ref={amountRef}
                      name="amount"
                      value={form.amount}
                      onChange={onChange}
                      placeholder="0"
                      inputMode="decimal"
                      autoComplete="off"
                      maxLength={9}
                      size={Math.max(1, form.amount.length)}
                      aria-describedby="donation-amount-help"
                    />
                  </span>
                </label>
                {errors.amount && <p className="field-error donation-summary__error">{errors.amount}</p>}
              </>
            )}
            <p className="donation-summary__note" id="donation-amount-help">
              {pending
                ? 'Complete the PayPal payment to finish your donation.'
                : 'Enter your offering amount to unlock the form. Address details are needed for donations over $100.'}
            </p>
          </section>

          <section className="checkout-form-wrap" aria-labelledby="donation-form-heading">
            {pending ? (
              <>
                <h2 id="donation-form-heading">PayPal checkout</h2>
                {submitError && <p className="field-error" role="alert">{submitError}</p>}
                <PayPalScriptProvider options={{ clientId: paypalClientId, currency: getPaypalCurrency(), intent: 'capture' }}>
                  <PaypalDonation
                    amount={pending.amount}
                    email={form.email.trim()}
                    donationPayload={pending.payload}
                    onPaid={(_response, id) => setSuccessId(id)}
                    onError={setSubmitError}
                  />
                </PayPalScriptProvider>
                <button type="button" className="checkout-link" onClick={() => setPending(null)}>Back to donation form</button>
              </>
            ) : (
              <>
                <h2 id="donation-form-heading">Donation details</h2>
                <form className="puja-form" onSubmit={onSubmit} noValidate>
                  <div className={`puja-form__grid${amountEntered ? '' : ' donation-grid--locked'}`}>
                    {[
                      ['firstName', 'First Name *', 'given-name'],
                      ['lastName', 'Last Name *', 'family-name'],
                    ].map(([name, placeholder, autoComplete]) => (
                      <label key={name} className={errors[name] ? 'has-error' : ''}>
                        <span className="visually-hidden">{placeholder}</span>
                        <input name={name} value={form[name]} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} maxLength={40} {...lockProps} />
                        {errors[name] && <p className="field-error">{errors[name]}</p>}
                      </label>
                    ))}
                    <label className={errors.mobile ? 'has-error' : ''}>
                      <span className="visually-hidden">Mobile</span>
                      <span className="field-phone"><span className="field-phone__code" aria-hidden="true">+1</span><input type="tel" name="mobile" value={form.mobile} onChange={onChange} placeholder="(555) 123-4567 *" autoComplete="tel-national" maxLength={14} {...lockProps} /></span>
                      {errors.mobile && <p className="field-error">{errors.mobile}</p>}
                    </label>
                    <label className={errors.email ? 'has-error' : ''}>
                      <span className="visually-hidden">Email</span>
                      <input type="email" name="email" value={form.email} onChange={onChange} placeholder="Email *" autoComplete="email" maxLength={100} {...lockProps} />
                      {errors.email && <p className="field-error">{errors.email}</p>}
                    </label>
                    <label className={`puja-form__full ${errors.address ? 'has-error' : ''}`}>
                      <span className="visually-hidden">Address</span>
                      <input name="address" value={form.address} onChange={onChange} placeholder={`Address${addressRequired ? ' *' : ''}`} autoComplete="street-address" maxLength={150} {...lockProps} />
                      {errors.address && <p className="field-error">{errors.address}</p>}
                    </label>
                    <p className="puja-form__note donation-address-note">{addressRequired ? 'Donations over $100 require address, city, state, and ZIP code.' : 'Address details are optional for donations of $100 or less.'}</p>
                    {[
                      ['city', 'City', 'address-level2'],
                      ['state', 'State', 'address-level1'],
                      ['pincode', 'ZIP Code', 'postal-code'],
                    ].map(([name, placeholder, autoComplete]) => (
                      <label key={name} className={errors[name] ? 'has-error' : ''}>
                        <span className="visually-hidden">{placeholder}</span>
                        <input name={name} value={form[name]} onChange={onChange} placeholder={`${placeholder}${addressRequired ? ' *' : ''}`} autoComplete={autoComplete} maxLength={10} {...lockProps} />
                        {errors[name] && <p className="field-error">{errors[name]}</p>}
                      </label>
                    ))}
                  </div>
                  <label
                    className={`puja-form__agree ${errors.agree ? 'has-error' : ''}${amountEntered ? '' : ' donation-grid--locked'}`}
                    onClick={(event) => {
                      if (amountEntered) return
                      event.preventDefault()
                      setShowAmountPrompt(true)
                    }}
                  >
                    <input type="checkbox" name="agree" checked={form.agree} onChange={onChange} aria-disabled={amountEntered ? undefined : 'true'} />
                    <span>I agree to terms and conditions and confirm that the payment is directly made to Hindu Temple Omaha.</span>
                  </label>
                  {errors.agree && <p className="field-error">{errors.agree}</p>}
                  {errors.paypal && <p className="field-error">{errors.paypal}</p>}
                  {submitError && <p className="field-error" role="alert">{submitError}</p>}
                  <button type="submit" className="btn btn--primary puja-form__submit">Continue to PayPal</button>

                  {showAmountPrompt && (
                    <div
                      className="terms-overlay"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="amount-prompt-title"
                      onClick={closeAmountPrompt}
                    >
                      <div className="terms-panel" onClick={(event) => event.stopPropagation()}>
                        <h3 id="amount-prompt-title" className="terms-panel__title">
                          Please enter the amount first
                        </h3>
                        <Ornament />
                        <div className="terms-panel__body">
                          <p>
                            Enter your offering amount in the <strong>Your offering</strong> box
                            before filling in your details.
                          </p>
                        </div>
                        <div className="terms-panel__actions">
                          <button type="button" className="btn btn--primary" onClick={closeAmountPrompt}>
                            Enter amount
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </form>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
