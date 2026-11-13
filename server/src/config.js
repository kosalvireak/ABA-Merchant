import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Always load server/.env relative to this file, so the server works no
// matter which directory it is started from (root, server/, npm --prefix...).
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

// Demo price bounds (KHR). Products must stay inside this range; it also
// happens to match the PayWay minimum of 100 KHR.
export const AMOUNT_MIN = 100;
export const AMOUNT_MAX = 500;

// Riel has no decimals in practice.
export const CURRENCY = "KHR";

function readInt(name, fallback) {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Fail-fast validation, called once at startup from index.js.
 * Throws with a clear, human message so the developer knows what to fix.
 */
export function validateConfig() {
  if (!process.env.PAYWAY_MERCHANT_ID) {
    throw new Error(
      "PAYWAY_MERCHANT_ID is missing. Register at https://sandbox.payway.com.kh " +
        "to get sandbox credentials, then copy server/.env.example to server/.env."
    );
  }

  if (!process.env.PAYWAY_API_KEY) {
    throw new Error(
      "PAYWAY_API_KEY is missing. It was emailed to you together with the merchant id."
    );
  }
}

export const config = {
  get port() {
    return readInt("PORT", 3001);
  },
  get clientOrigin() {
    return process.env.CLIENT_ORIGIN || "http://localhost:5173";
  },
  get paywayBaseUrl() {
    return process.env.PAYWAY_BASE_URL || "https://checkout-sandbox.payway.com.kh";
  },
  get paywayMerchantId() {
    return process.env.PAYWAY_MERCHANT_ID || "";
  },
  get paywayApiKey() {
    return process.env.PAYWAY_API_KEY || "";
  },
  get paywayPublicKey(){
    return process.env.PAYWAY_PUBLIC_KEY || "";
  },
  /**
   * Public HTTPS URL PayWay can POST payment notifications to.
   * Optional: without it, payment status relies on polling only.
   */
  get paywayCallbackUrl() {
    return process.env.PAYWAY_CALLBACK_URL || "";
  },
  /** QR / transaction lifetime in minutes (PayWay minimum is 3). */
  get qrLifetimeMinutes() {
    return Math.max(3, readInt("QR_LIFETIME_MINUTES", 5));
  },
  /** True when pointed at production; used for a startup warning. */
  get isProduction() {
    return /checkout\.payway\.com\.kh/.test(process.env.PAYWAY_BASE_URL || "");
  },
  /**
   * Currency charged on the QR: "KHR" (default) or "USD".
   * Note: KHR must be enabled on the merchant profile; some sandbox
   * profiles ship with USD only (see README).
   */
  get paywayCurrency() {
    return (process.env.PAYWAY_CURRENCY || "KHR").toUpperCase() === "USD" ? "USD" : "KHR";
  },
  /** Only used when paywayCurrency is USD: riel per USD for converting prices. */
  get usdRate() {
    const rate = Number(process.env.PAYWAY_USD_RATE);
    return Number.isFinite(rate) && rate > 0 ? rate : 4100;
  },
};
