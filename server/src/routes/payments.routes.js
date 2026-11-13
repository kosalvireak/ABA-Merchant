import { Router } from "express";
import { findProduct } from "../data/products.js";
import { getTransaction, setTransaction } from "../data/transactions.js";
import {
  createQr,
  checkTransaction,
  generateTranId,
  PaywayError,
} from "../services/payway.service.js";
import { AMOUNT_MIN, AMOUNT_MAX, config } from "../config.js";

const router = Router();

// POST /api/payments/khqr
//
// 1. Look up the product on the server. Never accept an amount from the
//    client - the price always comes from the server product list.
// 2. Sanity check the amount (also PayWay's minimum is 100 KHR).
// 3. Ask PayWay to generate the dynamic QR.
// 4. Return everything the client needs (QR image + ABA Mobile deeplink).
router.post("/khqr", async (req, res, next) => {
  try {
    const productId = req.body?.productId;

    // 400: input we can't even use.
    if (typeof productId !== "string" || productId.trim() === "") {
      return res.status(400).json({
        error: {
          code: "INVALID_INPUT",
          message: "Request body must include a productId string, e.g. { \"productId\": \"p05\" }",
        },
      });
    }

    const product = findProduct(productId);
    if (!product) {
      // 404: unknown product. Any "amount" in the body is simply ignored.
      return res.status(404).json({
        error: { code: "PRODUCT_NOT_FOUND", message: `Unknown product: ${productId}` },
      });
    }

    // Amount is server-owned data; still sanity check it as a guard against
    // a bad product list (wrong currency, decimals, out-of-range price).
    const amount = product.price;
    if (!Number.isInteger(amount) || amount < AMOUNT_MIN || amount > AMOUNT_MAX) {
      return res.status(500).json({
        error: {
          code: "AMOUNT_INVALID",
          message: `Product price ${amount} is not a valid integer between ${AMOUNT_MIN} and ${AMOUNT_MAX} KHR.`,
        },
      });
    }

    const tranId = generateTranId();
    const qr = await createQr({ amount, tranId });
    // Remember the transaction so the callback webhook and status endpoint
    // can find it later.
    setTransaction(tranId, { status: "PENDING", raw: null });

    res.json({
      productId: product.id,
      productName: product.name,
      amount,
      currency: product.currency,
      payAmount: qr.payAmount,
      payCurrency: qr.payCurrency,
      tranId: qr.tranId,
      qrString: qr.qr,
      qrImage: qr.qrImage,
      abapayDeeplink: qr.abapayDeeplink,
      appStore: qr.appStore,
      playStore: qr.playStore,
      expiresAt: qr.expiresAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof PaywayError) {
      return res.status(err.httpStatus || 500).json({
        error: { code: err.code, message: err.message },
      });
    }
    next(err);
  }
});

// GET /api/payments/:tranId/status
//
// Payment status for the polling client. The in-memory store (fed by the
// callback webhook) is checked first; otherwise we ask PayWay directly.
router.get("/:tranId/status", async (req, res) => {
  const { tranId } = req.params;

  const cached = getTransaction(tranId);
  if (cached?.status === "PAID") {
    return res.json({ status: "PAID", raw: cached.raw });
  }

  try {
    const result = await checkTransaction(tranId);
    setTransaction(tranId, { status: result.status, raw: result.raw });
    res.json({ status: result.status, raw: result.raw });
  } catch (err) {
    if (err instanceof PaywayError) {
      return res.status(err.httpStatus || 500).json({
        error: { code: err.code, message: err.message },
      });
    }
    throw err;
  }
});

// POST /api/payments/callback
//
// PayWay webhook. Fired when a payment completes (or changes state).
// The notification body is NOT trusted on its own: we immediately verify
// the tran_id with the Check Transaction API, as PayWay recommends.
router.post("/callback", async (req, res) => {
  const { tran_id: tranId, status } = req.body ?? {};

  if (!tranId) {
    return res.status(400).json({
      error: { code: "INVALID_CALLBACK", message: "Callback must include tran_id." },
    });
  }

  try {
    // status "0" in the notification means approved; still confirm via API.
    const verified = status === "0" ? await checkTransaction(tranId) : null;
    setTransaction(tranId, {
      status: verified?.status ?? "UNKNOWN",
      raw: verified?.raw ?? req.body,
    });
    res.json({ status: "received" });
  } catch (err) {
    // Never 500 back to PayWay for a bad callback - just log and accept.
    console.error("[callback] could not verify", tranId, err.message);
    res.json({ status: "received" });
  }
});

export default router;
