<script setup>
// BOILERPLATE: draws `value` as a CODE128 barcode in an <svg> using JsBarcode.
// Used for the ticket_code on My Ticket, so a handheld or camera barcode scanner
// at the entrance can check people in (staff_check_in accepts ticket codes).
import { onMounted, ref, watch } from 'vue'
import JsBarcode from 'jsbarcode'

const props = defineProps({
  value: { type: String, required: true },
  label: { type: String, default: 'Barcode' },
})

const svg = ref(null)

function draw() {
  if (!svg.value || !props.value) return
  JsBarcode(svg.value, props.value, { format: 'CODE128', height: 64, margin: 8, fontSize: 16, displayValue: true })
}

onMounted(draw)
watch(() => props.value, draw)
</script>

<template>
  <svg ref="svg" class="barcode" role="img" :aria-label="label"></svg>
</template>

<style scoped>
.barcode {
  max-width: 100%;
  height: auto;
  background: #fff;
}
</style>
