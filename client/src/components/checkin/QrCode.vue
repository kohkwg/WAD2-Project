<script setup>
// BOILERPLATE: draws `value` as a QR code on a <canvas> using the qrcode library.
// Re-draws whenever `value` changes (e.g. the venue secret rotates).
import { onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'

const props = defineProps({
  value: { type: String, required: true },
  size: { type: Number, default: 260 },
  label: { type: String, default: 'QR code' },
})

const canvas = ref(null)

async function draw() {
  if (!canvas.value || !props.value) return
  // errorCorrectionLevel 'M' still scans if the screen is a bit scratched or glary
  await QRCode.toCanvas(canvas.value, props.value, { width: props.size, margin: 2, errorCorrectionLevel: 'M' })
}

onMounted(draw)
watch(() => [props.value, props.size], draw)
</script>

<template>
  <canvas ref="canvas" class="qr-code" role="img" :aria-label="label"></canvas>
</template>

<style scoped>
.qr-code {
  max-width: 100%;
  height: auto !important;
  background: #fff;
  border-radius: 0.5rem;
}
</style>
