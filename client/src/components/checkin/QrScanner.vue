<script setup>
// BOILERPLATE: wraps html5-qrcode. Starts the back camera when mounted, emits
// `decoded` with the QR text, and always turns the camera off when unmounted.
// The camera only works on https or localhost.
import { onMounted, onBeforeUnmount, ref, useId } from 'vue'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

const props = defineProps({
  // ignore the same code for this long, because the library fires ~10x per second
  cooldownMs: { type: Number, default: 3000 },
  // html5-qrcode format names; the staff station adds 'CODE_128' for ticket barcodes
  formats: { type: Array, default: () => ['QR_CODE'] },
})
const emit = defineEmits(['decoded'])

const elementId = `qr-scanner-${useId()}`
const error = ref('')
const starting = ref(true)
let scanner = null
let lastText = ''
let lastAt = 0

// emits (text, formatName), e.g. ('2C3980B894', 'CODE_128')
function onSuccess(text, result) {
  const now = Date.now()
  if (text === lastText && now - lastAt < props.cooldownMs) return
  lastText = text
  lastAt = now
  emit('decoded', text, result?.result?.format?.formatName ?? 'QR_CODE')
}

// Square box for QR codes; a wide, short box when 1D barcodes are allowed too
function scanBox(w, h) {
  if (props.formats.includes('CODE_128')) return { width: Math.floor(w * 0.9), height: Math.floor(h * 0.5) }
  const s = Math.floor(Math.min(w, h) * 0.7)
  return { width: s, height: s }
}

onMounted(async () => {
  scanner = new Html5Qrcode(elementId, {
    formatsToSupport: props.formats.map((f) => Html5QrcodeSupportedFormats[f]),
    verbose: false,
  })
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: scanBox },
      onSuccess,
      () => {}, // "no QR in this frame", fires constantly, ignore
    )
  } catch (e) {
    error.value =
      String(e).includes('NotAllowed') || String(e).includes('Permission')
        ? 'Camera permission was denied. Allow camera access in your browser settings and reload.'
        : 'Could not start the camera. Use a device with a camera, on https or localhost.'
  } finally {
    starting.value = false
  }
})

onBeforeUnmount(async () => {
  try {
    if (scanner?.isScanning) await scanner.stop()
    scanner?.clear()
  } catch {
    /* already stopped */
  }
})
</script>

<template>
  <div>
    <div :id="elementId" class="qr-scanner rounded overflow-hidden bg-dark"></div>
    <p v-if="starting" class="text-body-secondary small mt-2 mb-0">Starting camera…</p>
    <div v-if="error" class="alert alert-warning mt-2 mb-0" role="alert">{{ error }}</div>
  </div>
</template>

<style scoped>
.qr-scanner {
  width: 100%;
  min-height: 240px;
}
</style>
