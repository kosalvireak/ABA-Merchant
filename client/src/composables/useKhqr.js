import { ref, computed, onUnmounted } from "vue";
import { createKhqr, getPaymentStatus } from "../api/client.js";

/**
 * State + request logic for the QR panel.
 *
 * States: "idle" (no selection) -> "loading" -> "success" | "error" | "expired"
 * A stale response must never overwrite a newer one, so every request
 * carries its own token and only the latest one may update state.
 */
export function useKhqr() {
  const selectedProduct = ref(null);
  const payment = ref(null); // { qrImage, qrString, abapayDeeplink, tranId, expiresAt, ... }
  const status = ref("idle"); // idle | loading | success | error | expired | paid
  const error = ref(null);
  const secondsLeft = ref(0);

  let requestToken = 0; // incremented per request; stale responses are ignored
  let abortController = null;
  let countdownTimer = null;
  let pollTimer = null;
  let disposed = false;

  const isQrActive = computed(
    () => status.value === "success" || status.value === "paid"
  );

  function stopTimers() {
    clearInterval(countdownTimer);
    countdownTimer = null;
    stopPolling();
  }

  function startCountdown() {
    clearInterval(countdownTimer);
    const target = new Date(payment.value.expiresAt).getTime();
    const tick = () => {
      secondsLeft.value = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      if (secondsLeft.value <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        if (status.value !== "paid") {
          status.value = "expired";
          stopPolling();
        }
      }
    };
    tick();
    countdownTimer = setInterval(tick, 250);
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function startPolling() {
    stopPolling();
    const tranId = payment.value.tranId;
    // Poll every 3 seconds while a QR is active. Stopped on expiry,
    // selection change and unmount.
    pollTimer = setInterval(async () => {
      if (status.value !== "success" || disposed || payment.value?.tranId !== tranId) {
        stopPolling();
        return;
      }
      try {
        const result = await getPaymentStatus(tranId);
        if (result.status === "PAID" && payment.value?.tranId === tranId) {
          status.value = "paid";
          stopTimers();
        }
      } catch {
        // network hiccup or gateway hiccup: keep polling silently until expiry
      }
    }, 3000);
  }

  /** Request a fresh QR for a product. Only the newest request may win. */
  async function requestKhqr(product) {
    const token = ++requestToken;
    abortController?.abort();
    abortController = new AbortController();

    stopTimers();
    selectedProduct.value = product;
    payment.value = null;
    error.value = null;
    status.value = "loading";

    try {
      const data = await createKhqr(product.id, {
        signal: abortController.signal,
      });
      if (token !== requestToken || disposed) return; // stale response

      payment.value = data;
      status.value = "success";
      startCountdown();
      startPolling();
    } catch (err) {
      if (err.name === "AbortError" || token !== requestToken || disposed) return;
      error.value = err.message || "Failed to create QR code.";
      status.value = "error";
    }
  }

  /** Called when the user clicks a product (or Regenerate). */
  function select(product) {
    return requestKhqr(product);
  }

  function regenerate() {
    if (selectedProduct.value) return requestKhqr(selectedProduct.value);
  }

  /** Reset to the initial hint state. */
  function clear() {
    requestToken++;
    abortController?.abort();
    stopTimers();
    selectedProduct.value = null;
    payment.value = null;
    error.value = null;
    secondsLeft.value = 0;
    status.value = "idle";
  }

  onUnmounted(() => {
    disposed = true;
    abortController?.abort();
    stopTimers();
  });

  return {
    selectedProduct,
    payment,
    status,
    error,
    secondsLeft,
    isQrActive,
    select,
    regenerate,
    clear,
  };
}
