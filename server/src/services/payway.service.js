import { createHmac } from "node:crypto";
import { config } from "../config.js";

/**
 * PayWay QR API wrapper. All PayWay requests are POSTs signed with
 * HMAC-SHA512 (base64-encoded) using the api key provided by ABA Bank.
 *
 * Two endpoints used here (see https://developer.payway.com.kh):
 *   POST /api/payment-gateway/v1/payments/generate-qr      -> dynamic KHQR
 *   POST /api/payment-gateway/v1/payments/check-transaction-2 -> status
 */

const QR_PATH = "/api/payment-gateway/v1/payments/generate-qr";
const CHECK_PATH = "/api/payment-gateway/v1/payments/check-transaction-2";

/** Typed error so the route can map it to a 500 with a readable message. */
export class PaywayError extends Error {
  constructor(message, { httpStatus = 500, code = "PAYWAY_ERROR", raw = null } = {}) {
    super(message);
    this.name = "PaywayError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.raw = raw;
  }
}

/** Request time in PayWay's format: UTC YYYYMMDDHHmmss. */
export function reqTime(date = new Date()) {
  return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

/** Unique tran_id, max 20 chars (PayWay limit). */
export function generateTranId() {
  return `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 20);
}

/**
 * HMAC-SHA512 over the concatenated field values, in exactly the order the
 * QR API documentation prescribes:
 *
 *   req_time, merchant_id, tran_id, amount, items, first_name, last_name,
 *   email, phone, purchase_type, payment_option, callback_url,
 *   return_deeplink, currency, custom_fields, return_params, payout,
 *   lifetime, qr_image_template
 *
 * Fields that are absent/empty are skipped (their position keeps the order).
 */
export function sign(fields, apiKey = config.paywayApiKey) {
  const order = [
    "req_time",
    "merchant_id",
    "tran_id",
    "amount",
    "items",
    "first_name",
    "last_name",
    "email",
    "phone",
    "purchase_type",
    "payment_option",
    "callback_url",
    "return_deeplink",
    "currency",
    "custom_fields",
    "return_params",
    "payout",
    "lifetime",
    "qr_image_template",
  ];

  const b4hash = order.map((key) => fields[key] ?? "").join("");
  return createHmac("sha512", apiKey).update(b4hash).digest("base64");
}

function toBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

async function callPayway(path, body) {
  let response;
  try {
    response = await fetch(`${config.paywayBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new PaywayError(`Cannot reach PayWay: ${err.message}`, {
      code: "PAYWAY_UNREACHABLE",
    });
  }

  let raw;
  try {
    raw = await response.json();
  } catch {
    throw new PaywayError(`PayWay returned non-JSON (HTTP ${response.status})`, {
      code: "PAYWAY_BAD_RESPONSE",
    });
  }

  return { response, raw };
}

/**
 * Generate a dynamic KHQR via PayWay.
 * Amount is the product price in integer KHR. When PAYWAY_CURRENCY=USD
 * (sandbox convenience) it is converted server-side before charging.
 *
 * @param {{ amount: number, tranId?: string, lifetimeMinutes?: number }} params
 * @returns {{ qr: string, qrImage: string, abapayDeeplink: string,
 *             appStore: string, playStore: string, tranId: string,
 *             payAmount: number, payCurrency: "KHR"|"USD",
 *             expiresAt: Date }}
 */
export async function createQr({ amount, tranId = generateTranId(), lifetimeMinutes }) {
  const lifetime = lifetimeMinutes ?? config.qrLifetimeMinutes;
  const currency = config.paywayCurrency;

  // KHR charges integer riel; USD charges a 2-decimal amount (min 0.01).
  let payAmount;
  if (currency === "KHR") {
    payAmount = amount;
  } else {
    payAmount = Math.max(0.01, Math.round((amount / config.usdRate) * 100) / 100);
  }

  const time = reqTime();
  const callbackUrl = config.paywayCallbackUrl ? toBase64(config.paywayCallbackUrl) : "";

  const fields = {
    req_time: time,
    merchant_id: config.paywayMerchantId,
    tran_id: tranId,
    amount: payAmount.toFixed(currency === "KHR" ? 0 : 2),
    payment_option: "abapay_khqr",
    callback_url: callbackUrl,
    currency,
    lifetime: String(lifetime),
  };

  const body = {
    ...fields,
    hash: sign(fields),
  };

  const { response, raw } = await callPayway(QR_PATH, body);

  // PayWay returns status.code "0" on success.
  if (!response.ok || raw?.status?.code !== "0") {
    throw new PaywayError(
      `PayWay rejected the QR request: ${raw?.status?.message || `HTTP ${response.status}`}`,
      {
        code: raw?.status?.code === "5" ? "PAYWAY_INVALID_HASH" : "PAYWAY_GENERATION_FAILED",
        raw,
      }
    );
  }

  return {
    tranId,
    qr: raw.qrString,
    qrImage: raw.qrImage,
    abapayDeeplink: raw.abapay_deeplink,
    appStore: raw.app_store,
    playStore: raw.play_store,
    payAmount,
    payCurrency: currency,
    expiresAt: new Date(Date.now() + lifetime * 60_000),
  };
}

/**
 * Ask PayWay for the status of one of our transactions.
 * @returns {"PAID"|"PENDING"|"UNKNOWN"}
 */
export async function checkTransaction(tranId) {
  const time = reqTime();
  const fields = {
    req_time: time,
    merchant_id: config.paywayMerchantId,
    tran_id: tranId,
  };

  const { response, raw } = await callPayway(CHECK_PATH, {
    ...fields,
    hash: sign(fields),
  });

  // status.code "00" = ok; "6" = transaction not found (e.g. not paid yet in sandbox)
  if (raw?.status?.code === "6") {
    return { status: "PENDING", raw };
  }
  if (raw?.status?.code !== "00") {
    throw new PaywayError(
      `PayWay status check failed: ${raw?.status?.message || `HTTP ${response.status}`}`,
      { code: "PAYWAY_CHECK_FAILED", raw }
    );
  }

  // payment_status_code: 0 APPROVED, 2 PENDING, 3 DECLINED, 4 REFUNDED, 7 CANCELLED
  const statusCode = raw?.data?.payment_status_code;
  const status = statusCode === 0 ? "PAID" : statusCode === 2 ? "PENDING" : "UNKNOWN";
  return { status, raw };
}
