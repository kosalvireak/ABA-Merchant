<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  product: { type: Object, default: null },
  payment: { type: Object, default: null },
  status: { type: String, required: true }, // idle | loading | success | error | expired | paid
  error: { type: String, default: null },
  secondsLeft: { type: Number, default: 0 },
});

const emit = defineEmits(["retry", "regenerate", "close"]);

const showDebug = ref(false);

// What the QR actually charges: product price in ៛, or the converted USD
// amount when the sandbox/merchant profile runs in USD mode.
const amountLabel = computed(() =>
  props.payment?.payCurrency === "USD"
    ? `$${props.payment.payAmount}`
    : `${props.payment?.amount} ៛`
);

function formatCountdown(seconds) {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Opens the ABA Mobile deeplink so the customer can confirm the payment
// inside the app. If ABA Mobile is not installed the OS offers the store
// page (see payment.appStore / payment.playStore).
function openDeeplink() {
  const link = props.payment?.abapayDeeplink;
  if (link) window.location.href = link;
}
</script>

<template>
  <aside class="qr-panel">
    <div class="qr-panel-head">
      <h2>Scan &amp; pay</h2>
      <button v-if="product" class="link-btn" type="button" @click="emit('close')">
        Close
      </button>
    </div>

    <!-- Initial: no product selected yet -->
    <div v-if="status === 'idle'" class="qr-state qr-idle">
      <p class="qr-emoji">🛒</p>
      <p>Pick a product to see its KHQR code.</p>
    </div>

    <!-- Loading -->
    <div v-else-if="status === 'loading'" class="qr-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>Generating QR for {{ product?.name }}…</p>
    </div>

    <!-- Error -->
    <div v-else-if="status === 'error'" class="qr-state qr-error">
      <p class="qr-emoji">⚠️</p>
      <p>{{ error }}</p>
      <button class="btn primary" type="button" @click="emit('retry')">Retry</button>
    </div>

    <!-- Expired -->
    <div v-else-if="status === 'expired'" class="qr-state qr-expired">
      <p class="qr-emoji">⏱️</p>
      <p><strong>Expired</strong></p>
      <p>This QR code is no longer valid.</p>
      <button class="btn primary" type="button" @click="emit('regenerate')">
        Regenerate
      </button>
    </div>

    <!-- Success / Paid -->
    <div v-else class="qr-state qr-success">
      <template v-if="payment">
        <div class="qr-summary">
          <span class="qr-product">{{ product?.emoji }} {{ product?.name }}</span>
          <span class="qr-amount">{{ amountLabel }}</span>
        </div>

        <div class="qr-image-wrap">
          <img
            :src="payment.qrImage"
            alt="KHQR payment code"
            width="260"
            height="260"
            :class="{ blurred: secondsLeft <= 0 && status !== 'paid' }"
          />
          <span v-if="status === 'paid'" class="paid-badge">Paid ✓</span>
          <span v-else-if="secondsLeft <= 0" class="expired-badge">Expired</span>
        </div>

        <p v-if="status === 'paid'" class="qr-paid-line">Thank you! Payment received.</p>
        <p v-else class="qr-countdown" :class="{ urgent: secondsLeft <= 30 }">
          Expires in {{ formatCountdown(secondsLeft) }}
        </p>

        <button
          v-if="status !== 'paid'"
          class="btn primary"
          type="button"
          @click="openDeeplink"
        >
          Pay with ABA Mobile
        </button>

        <button class="link-btn small" type="button" @click="emit('regenerate')">
          Regenerate
        </button>

        <details class="qr-debug">
          <summary @click.prevent="showDebug = !showDebug">Debug</summary>
          <div v-if="showDebug" class="qr-debug-body">
            <div><span>tranId</span><code>{{ payment.tranId }}</code></div>
            <div><span>qrString</span><code class="break">{{ payment.qrString }}</code></div>
          </div>
        </details>
      </template>
    </div>
  </aside>
</template>
