const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const PUJA_ORDER_PATH =
  import.meta.env.VITE_PUJA_ORDER_PATH || '/api/public/puja-orders'
const PUJA_PAYPAL_SUCCESS_PATH =
  import.meta.env.VITE_PUJA_PAYPAL_SUCCESS_PATH ||
  '/api/public/puja-orders/paypal-success'
const GENERAL_DONATION_PATH =
  import.meta.env.VITE_GENERAL_DONATION_PATH || '/api/public/general-donations'
const GENERAL_DONATION_PAYPAL_SUCCESS_PATH =
  import.meta.env.VITE_GENERAL_DONATION_PAYPAL_SUCCESS_PATH ||
  '/api/public/general-donations/paypal-success'

/** true = submit only to existing order endpoint (no PayPal) */
export function isDirectOrderSubmit() {
  return String(import.meta.env.VITE_DIRECT_ORDER_SUBMIT).toLowerCase() === 'true'
}

export function getPaypalClientId() {
  return import.meta.env.VITE_PAYPAL_CLIENT_ID || ''
}

export function getPaypalCurrency() {
  return import.meta.env.VITE_PAYPAL_CURRENCY || 'USD'
}

function joinUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${normalized}`
}

export function getPujasUrl() {
  return `${API_BASE}/api/public/pujas`
}

export function getPujaOrderUrl() {
  return joinUrl(PUJA_ORDER_PATH)
}

export function getPaypalSuccessUrl() {
  return joinUrl(PUJA_PAYPAL_SUCCESS_PATH)
}

export function getGeneralDonationUrl() {
  return joinUrl(GENERAL_DONATION_PATH)
}

export function getGeneralDonationPaypalSuccessUrl() {
  return joinUrl(GENERAL_DONATION_PAYPAL_SUCCESS_PATH)
}

export function hasAmount(value) {
  return value !== null && value !== undefined && value !== 0
}

export function formatAmount(value) {
  if (!hasAmount(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0)
}

/** Build the payload the backend expects */
export function buildPujaOrderPayload(form, cartItems, location) {
  const cartMap = new Map()

  cartItems.forEach((item) => {
    cartMap.set(item.id, {
      id: item.id,
      temple_amount: Number(item.temple_amount) || 0,
      home_amount: Number(item.home_amount) || 0,
    })
  })

  return {
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    email: form.email.trim(),
    // Sent unformatted. The inputs mask these for readability, but the
    // backend has always received bare digits and still should.
    mobile: form.mobile.replace(/\D/g, ''),
    address: form.address.trim(),
    country: form.country.trim(),
    state: form.state.trim(),
    city: form.city.trim(),
    pincode: form.pincode.replace(/\D/g, ''),
    location,
    date_of_puja: form.dateOfPuja,
    time_of_puja: form.timeOfPuja,
    // The form no longer collects alternates; the backend contract still
    // carries the (nullable) keys.
    alternate_date_of_puja1: null,
    alternate_time_of_puja2: null,
    terms_conditions: Boolean(form.agree),
    cart: [...cartMap.values()],
  }
}

async function parseJsonResponse(res) {
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }

  if (!res.ok || json?.success === false) {
    const message =
      json?.message ||
      (typeof json?.errors === 'object'
        ? Object.values(json.errors).flat().join(' ')
        : null) ||
      `Request failed (${res.status})`
    throw new Error(message)
  }

  return json
}

export async function submitPujaOrder(payload) {
  const res = await fetch(getPujaOrderUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse(res)
}

/** Build PayPal fields we send to the backend after capture */
export function buildPaypalPaymentPayload(captureDetails, fallbackOrderId, expectedAmount) {
  const capture =
    captureDetails?.purchase_units?.[0]?.payments?.captures?.[0] || null
  const amountValue =
    capture?.amount?.value ??
    captureDetails?.purchase_units?.[0]?.amount?.value ??
    Number(expectedAmount).toFixed(2)
  const currencyCode =
    capture?.amount?.currency_code ??
    captureDetails?.purchase_units?.[0]?.amount?.currency_code ??
    getPaypalCurrency()

  const status = captureDetails?.status || capture?.status || 'UNKNOWN'
  const paid = String(status).toUpperCase() === 'COMPLETED'

  return {
    paypal_order_id: captureDetails?.id || fallbackOrderId || null,
    paypal_capture_id: capture?.id || null,
    paypal_status: status,
    paypal_paid: paid,
    paypal_amount: amountValue != null ? String(amountValue) : null,
    paypal_currency: currencyCode || null,
    paypal_payer_email: captureDetails?.payer?.email_address || null,
    paypal_payer_id: captureDetails?.payer?.payer_id || null,
    paypal_create_time: captureDetails?.create_time || capture?.create_time || null,
    paypal_update_time: captureDetails?.update_time || capture?.update_time || null,
    paypal_raw: captureDetails || null,
  }
}

/** Call after PayPal payment succeeds */
export async function confirmPaypalSuccess({
  pujaRequestId,
  email,
  paypal,
}) {
  const body = {
    puja_request_id: pujaRequestId,
    email,
    ...paypal,
  }

  const res = await fetch(getPaypalSuccessUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return parseJsonResponse(res)
}

export function buildGeneralDonationPayload(form, amount) {
  return {
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    mobile: form.mobile.replace(/\D/g, ''),
    email: form.email.trim(),
    address: form.address.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    zip: form.pincode.replace(/\D/g, ''),
    pincode: form.pincode.replace(/\D/g, ''),
    confirmation: Boolean(form.agree),
    amount: Number(amount),
  }
}

export async function submitGeneralDonation(payload) {
  const res = await fetch(getGeneralDonationUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse(res)
}

export async function confirmGeneralDonationPaypalSuccess({
  donationRequestId,
  email,
  paypal,
}) {
  const res = await fetch(getGeneralDonationPaypalSuccessUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      donation_request_id: donationRequestId,
      email,
      ...paypal,
      payment_method: 'PayPal',
    }),
  })

  return parseJsonResponse(res)
}
