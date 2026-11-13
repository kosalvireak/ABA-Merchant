<script setup>
import ProductCard from "./ProductCard.vue";

defineProps({
  products: { type: Array, required: true },
  selectedId: { type: String, default: null },
});

defineEmits(["select"]);
</script>

<template>
  <section class="product-grid" aria-label="Products">
    <ProductCard
      v-for="product in products"
      :key="product.id"
      :product="product"
      :selected="product.id === selectedId"
      @select="$emit('select', $event)"
    />
  </section>
</template>
