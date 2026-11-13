// Env must be set before importing the app (config reads lazily via getters).
// Note: config.js loads server/.env via dotenv, so currency is pinned here
// to keep the test deterministic regardless of the developer's .env.
process.env.PAYWAY_MERCHANT_ID = "test_merchant";
process.env.PAYWAY_API_KEY = "test_api_key";
process.env.PAYWAY_BASE_URL = "https://checkout-sandbox.payway.com.kh";
process.env.PAYWAY_CURRENCY = "KHR";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import supertest from "supertest";
import { createHmac } from "node:crypto";

const { default: createApp } = await import("../src/app.js");
const { sign, reqTime, generateTranId, PaywayError } = await import(
  "../src/services/payway.service.js"
);

const app = createApp();
const request = supertest(app);

/** Helper: respond to any fetch with a canned JSON payload. */
function stubFetch(payload, { ok = true, status = 200 } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(payload),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const qrResponse = {
  status: { code: "0", message: "Success.", trace_id: "t1" },
  amount: 250,
  currency: "KHR",
  qrString: "000201010212...",
  qrImage: "data:image/png;base64,AAAA",
  abapay_deeplink: "abamobilebank://ababank.com?type=payway&qrcode=000201",
  app_store: "https://itunes.apple.com/aba",
  play_store: "https://play.google.com/aba",
};

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/products", () => {
  it("returns 10 products with unique prices within 100..500 KHR", async () => {
    const res = await request.get("/api/products").expect(200);

    expect(res.body).toHaveLength(10);
    const prices = res.body.map((p) => p.price);
    expect(new Set(prices).size).toBe(10);
    for (const price of prices) {
      expect(Number.isInteger(price)).toBe(true);
      expect(price).toBeGreaterThanOrEqual(100);
      expect(price).toBeLessThanOrEqual(500);
    }
  });

  it("returns one product by id and 404 for unknown ids", async () => {
    const res = await request.get("/api/products/p05").expect(200);
    expect(res.body.name).toBe("Potato Chips");
    expect(res.body.price).toBe(250);

    await request.get("/api/products/nope").expect(404);
  });
});

describe("PayWay service helpers", () => {
  it("reqTime() renders UTC YYYYMMDDHHmmss", () => {
    // 2026-01-01T10:05:00Z
    expect(reqTime(new Date("2026-01-01T10:05:00Z"))).toBe("20260101100500");
  });

  it("sign() concatenates fields in documentation order and hashes with HMAC-SHA512", () => {
    const fields = { req_time: "A", merchant_id: "B", tran_id: "C", currency: "D" };
    const expected = createHmac("sha512", "test_api_key")
      .update("ABC" + "D") // amount..payment_option skipped (empty), order preserved
      .digest("base64");
    expect(sign(fields)).toBe(expected);
  });

  it("generateTranId() stays within the 20 char PayWay limit", () => {
    for (let i = 0; i < 20; i++) expect(generateTranId().length).toBeLessThanOrEqual(20);
  });
});

describe("POST /api/payments/khqr", () => {
  it("returns the PayWay QR and deeplink for a valid product", async () => {
    const fetchMock = stubFetch(qrResponse);

    const res = await request.post("/api/payments/khqr").send({ productId: "p05" }).expect(200);

    expect(res.body.amount).toBe(250); // server-side price, not client input
    expect(res.body.currency).toBe("KHR");
    expect(res.body.qrString).toBe("000201010212...");
    expect(res.body.qrImage).toBe("data:image/png;base64,AAAA");
    expect(res.body.abapayDeeplink).toContain("abamobilebank://");
    expect(res.body.tranId).toMatch(/^T/);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // The outgoing request to PayWay is well-formed and signed.
    const body = fetchMock.mock.calls[0][1].body;
    const sent = JSON.parse(body);
    expect(fetchMock.mock.calls[0][0]).toContain("/payments/generate-qr");
    expect(sent.currency).toBe("KHR");
    expect(sent.payment_option).toBe("abapay_khqr");
    expect(sent.amount).toBe("250");
    expect(sent.req_time).toMatch(/^\d{14}$/);
    expect(sent.hash).toBeTypeOf("string");
  });

  it("ignores any amount sent by the client", async () => {
    const fetchMock = stubFetch(qrResponse);

    await request.post("/api/payments/khqr").send({ productId: "p10", amount: 999999 }).expect(200);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.amount).toBe("500");
  });

  it("maps a PayWay rejection to a 500 with a readable message", async () => {
    stubFetch({ status: { code: "5", message: "Invalid hash." } }, { ok: false, status: 400 });

    const res = await request.post("/api/payments/khqr").send({ productId: "p05" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("PAYWAY_INVALID_HASH");
    expect(res.body.error.message).toContain("Invalid hash");
  });

  it("returns 404 for an unknown product", async () => {
    await request.post("/api/payments/khqr").send({ productId: "zz" }).expect(404);
  });

  it("returns 400 when productId is missing", async () => {
    await request.post("/api/payments/khqr").send({}).expect(400);
  });
});

describe("GET /api/payments/:tranId/status", () => {
  it("maps payment_status_code 0 -> PAID and 2 -> PENDING", async () => {
    const paid = stubFetch({
      status: { code: "00", message: "Success!" },
      data: { payment_status_code: 0, payment_status: "APPROVED" },
    });
    const res = await request.get("/api/payments/Tabc123/status").expect(200);
    expect(res.body.status).toBe("PAID");
    expect(JSON.parse(paid.mock.calls[0][1].body).tran_id).toBe("Tabc123");

    vi.unstubAllGlobals();
    stubFetch({
      status: { code: "00", message: "Success!" },
      data: { payment_status_code: 2, payment_status: "PENDING" },
    });
    const res2 = await request.get("/api/payments/Tabc124/status").expect(200);
    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe("PENDING");
  });

  it("treats 'transaction not found' (code 6) as PENDING", async () => {
    stubFetch({ status: { code: "6", message: "Transaction not found" } });
    const res = await request.get("/api/payments/Tnope/status").expect(200);
    expect(res.body.status).toBe("PENDING");
  });
});

describe("POST /api/payments/callback", () => {
  it("verifies the notification and stores PAID, visible via status endpoint", async () => {
    stubFetch({
      status: { code: "00", message: "Success!" },
      data: { payment_status_code: 0, payment_status: "APPROVED" },
    });

    await request
      .post("/api/payments/callback")
      .send({ tran_id: "Tcb01", status: "0" })
      .expect(200);

    // In-memory store was updated -> status endpoint answers without a new call.
    const res = await request.get("/api/payments/Tcb01/status").expect(200);
    expect(res.body.status).toBe("PAID");
  });

  it("answers 400 for a callback without tran_id", async () => {
    await request.post("/api/payments/callback").send({}).expect(400);
  });
});

describe("USD mode", () => {
  it("converts the KHR price and charges 2-decimal USD", async () => {
    // config uses live env getters, so this works without module resets
    process.env.PAYWAY_CURRENCY = "USD";
    const { createQr } = await import("../src/services/payway.service.js");
    stubFetch(qrResponse);

    const qr = await createQr({ amount: 500 });
    const sent = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(sent.currency).toBe("USD");
    expect(sent.amount).toBe("0.12"); // 500 / 4100, rounded
    expect(qr.payCurrency).toBe("USD");
    expect(qr.payAmount).toBe(0.12);
    process.env.PAYWAY_CURRENCY = "KHR";
  });
});

describe("PaywayError", () => {
  it("carries a code and default 500 status", () => {
    const err = new PaywayError("boom");
    expect(err.httpStatus).toBe(500);
    expect(err.code).toBe("PAYWAY_ERROR");
  });
});
