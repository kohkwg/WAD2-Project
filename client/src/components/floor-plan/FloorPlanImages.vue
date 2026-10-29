<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { getFloorImages, saveFloorImage, floorImageRequest } from '@/utils/floorPlan'
import { validateFloorImage } from '@/utils/floorPlanModel'
const props = defineProps({ eventId: { type: String, required: true }, planId: { type: String, default: null }, canEdit: Boolean, published: Boolean })
const assets = ref([]), error = ref(''), busy = ref(false), loading = ref(false), loadReady = ref(false), message = ref('')
let generation = 0
let uploadController
onBeforeUnmount(() => { generation++; uploadController?.abort() })
watch(() => [props.eventId, props.planId], () => {
  uploadController?.abort()
  busy.value = false
  assets.value = []
  load()
}, { immediate: true })
async function load() {
  if (busy.value) return
  const token = ++generation; error.value = ''; message.value = ''; loading.value = true; loadReady.value = false
  try {
    const rows = await getFloorImages(props.eventId, props.planId)
    const resolved = await Promise.all(rows.map(async row => ({ ...row, ...(await floorImageRequest(`/${row.id}`)) })))
    if (token === generation) { assets.value = resolved; loadReady.value = true }
  } catch (e) { if (token === generation) error.value = e.message }
  finally { if (token === generation) loading.value = false }
}
async function upload(event) {
  const file = event.target.files?.[0]
  if (!file || busy.value || loading.value || !loadReady.value || !props.canEdit || !props.planId || !props.published) return
  const token = generation, eid = props.eventId, pid = props.planId
  const existing = assets.value.find(asset => asset.floor_plan_id === pid)
  uploadController = new AbortController()
  busy.value = true; error.value = ''; message.value = ''
  try {
    validateFloorImage(file)
    const ticket = await floorImageRequest('', { method: 'POST', body: JSON.stringify({ eventId: eid, floorPlanId: pid, filename: file.name, contentType: file.type, size: file.size }) })
    if (token !== generation) return
    const response = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file, signal: uploadController.signal })
    if (!response.ok) throw new Error('Image upload failed. Choose the image again to retry.')
    if (token !== generation) return
    // Only an explicitly public finished image is stored in the public R2 bucket.
    const saved = await saveFloorImage(eid, pid, { ...(existing ? { id: existing.id } : {}), name: file.name, r2_key: ticket.key })
    if (token !== generation) return
    assets.value = [{ ...saved, publicUrl: ticket.publicUrl }]; message.value = 'Public floor-plan image saved.'
  } catch (e) { if (token === generation) error.value = e.message }
  finally { if (token === generation) { busy.value = false; event.target.value = '' } }
}
</script>
<template>
<section v-if="canEdit || assets.length || error" class="my-4 floor-images" aria-label="Floor-plan images">
  <div class="floor-images-heading">
    <div>
      <span class="floor-images-kicker">Public handoff</span>
      <h2 class="h5">Floor-plan image</h2>
    </div>
    <span v-if="assets.length" class="image-status">Shared</span>
  </div>
  <template v-if="canEdit">
    <p class="small text-muted">Upload a finished plan to share publicly on this published event. JPEG, PNG or WebP, up to 10 MiB. Uploading replaces the current image.</p>
    <p v-if="!planId" class="small">Save the floor plan before uploading an image.</p><p v-else-if="!published" class="small">Publish the event before sharing an image.</p>
    <label class="form-label">Public finished floor-plan image<input class="form-control" type="file" accept="image/jpeg,image/png,image/webp" :disabled="busy || loading || !loadReady || !planId || !published" @change="upload" /></label>
  </template>
  <p v-if="loading" role="status">Loading floor-plan images…</p>
  <p v-if="busy" role="status">Uploading image…</p><p v-if="message" class="text-success" role="status">{{ message }}</p>
  <div v-if="error" role="alert" class="alert alert-danger">{{ error }} <button type="button" class="btn btn-sm btn-outline-danger" :disabled="busy || loading" @click="load">Retry loading image</button></div>
  <figure v-for="asset in assets" :key="asset.id" class="floor-image-preview"><img :src="asset.publicUrl" :alt="asset.name" class="img-fluid rounded border" @error="error = 'The floor-plan image could not be displayed.'" /><figcaption class="small text-muted">{{ asset.name }}</figcaption></figure>
</section>
</template>

<style scoped>
.floor-images{padding:1.1rem 1.25rem;border:1px solid var(--bookedz-border,#e5ded2);border-radius:18px;background:var(--bookedz-surface,#fffdfa);box-shadow:var(--bookedz-card-shadow,none)}
.floor-images-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;margin-bottom:.7rem}
.floor-images-kicker{display:block;color:var(--bookedz-muted,#63665e);font-size:.72rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}
.floor-images h2{font-family:var(--bookedz-heading,'Bricolage Grotesque',sans-serif);letter-spacing:-.02em}
.image-status{display:inline-flex;align-items:center;min-height:30px;padding:.25rem .55rem;border:1px solid var(--bookedz-border,#e5ded2);border-radius:999px;background:var(--bookedz-cream,#fff8ec);color:var(--bookedz-muted,#63665e);font-size:.78rem;font-weight:700}
.floor-images .form-control{min-height:42px;border-color:var(--bookedz-border,#e5ded2);border-radius:10px}
.floor-image-preview{margin:1rem 0 0;padding:.65rem;border:1px solid var(--bookedz-border,#e5ded2);border-radius:14px;background:var(--bookedz-cream,#fff8ec)}
.floor-images img{max-width:100%;border-color:var(--bookedz-border,#e5ded2)!important;border-radius:12px}
.floor-images .btn{min-height:38px;border-radius:10px}
@media(max-width:575.98px){.floor-images{padding:1rem;border-radius:16px}}
</style>
