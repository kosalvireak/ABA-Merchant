<script setup>
defineProps({
  product: { type: Object, required: true },
  selected: { type: Boolean, default: false },
});

defineEmits(["select"]);
</script>

<template>
  <button
    class="product-card"
    :class="{ selected }"
    type="button"
    @click="$emit('select', product)"
  >
    <span class="product-emoji">{{ product.emoji }}</span>
    <span class="product-name">{{ product.name }}</span>
    <span class="product-price">{{ product.price }} ៛</span>
  </button>
</template>
