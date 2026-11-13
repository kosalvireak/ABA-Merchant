<script setup>
import { onMounted, ref } from "vue";
import { getProducts } from "./api/client.js";
import { useKhqr } from "./composables/useKhqr.js";
import ProductGrid from "./components/ProductGrid.vue";
import QrPanel from "./components/QrPanel.vue";

const products = ref([]);
const loadError = ref(null);

const {
  selectedProduct,
  payment,
  status,
  error: qrError,
  secondsLeft,
  select,
  regenerate,
  clear,
} = useKhqr();

onMounted(async () => {
  try {
    products.value = await getProducts();
  } catch (err) {
    loadError.value = err.message;
  }
});

function retry() {
  if (selectedProduct.value) select(selectedProduct.value);
}

// Mobile: the QR panel is a bottom sheet, closed with the Close button.
function closePanel() {
  clear();
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <h1>KHQR Mart <span class="header-badge">demo</span></h1>
      <p class="header-sub">Scan-to-pay playground for ABA / Bakong KHQR</p>
    </header>

    <main class="layout">
      <section class="col-products">
        <div v-if="loadError" class="load-error">
          <p>{{ loadError }}</p>
          <button class="btn" type="button" @click="location.reload()">Reload page</button>
        </div>
        <ProductGrid
          v-else
          :products="products"
          :selected-id="selectedProduct?.id ?? null"
          @select="select"
        />
      </section>

      <!-- Desktop: sticky side panel. Mobile: bottom sheet when a product is selected. -->
      <div
        class="col-qr"
        :class="{ 'sheet-open': status !== 'idle' }"
      >
        <div class="qr-backdrop" @click="closePanel"></div>
        <QrPanel
          :product="selectedProduct"
          :payment="payment"
          :status="status"
          :error="qrError"
          :seconds-left="secondsLeft"
          @retry="retry"
          @regenerate="regenerate"
          @close="closePanel"
        />
      </div>
    </main>

    <footer class="page-footer">
      Demo only. Scanning and paying with a real bank app transfers real money.
    </footer>
  </div>
</template>
