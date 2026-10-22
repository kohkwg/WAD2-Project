<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'

const props = defineProps({ event: { type: Object, required: true }, mode: { type: String, default: 'view' } })
const emit = defineEmits(['close', 'registered'])
const dialog = ref(null)
const showRegistration = ref(props.mode === 'rsvp')
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const success = ref('')
const questions = ref([])
const answers = ref({})
const signedIn = ref(false)
const registrationStatus = ref(props.event.registration_status)
const questionsReady = ref(false)
let previousFocus
let previousOverflow
const alreadyRegistered = computed(() => ['confirmed', 'pending', 'waitlisted', 'offered', 'rejected'].includes(registrationStatus.value))
const closed = computed(() => props.event.registration_closes_at && new Date(props.event.registration_closes_at) <= new Date())
const dateLabel = computed(() => new Date(props.event.start_time).toLocaleString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }))

onMounted(async () => {
  previousFocus = document.activeElement
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value.showModal()
  if (showRegistration.value) await loadRegistration()
})
onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  previousFocus?.focus()
})
async function loadRegistration() {
  showRegistration.value = true
  loading.value = true
  error.value = ''
  try {
    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    signedIn.value = !!data.session
    if (!signedIn.value) return
    const [questionResult, registrationResult] = await Promise.all([
      supabase.from('event_questions').select('id, prompt, type, options, required, position').eq('event_id', props.event.id).order('position'),
      supabase.from('registrations').select('status').eq('event_id', props.event.id).eq('user_id', data.session.user.id).maybeSingle(),
    ])
    if (questionResult.error) throw questionResult.error
    if (registrationResult.error) throw registrationResult.error
    registrationStatus.value = registrationResult.data?.status || null
    questions.value = questionResult.data || []
    answers.value = Object.fromEntries(questions.value.map(q => [q.id, q.type === 'multi_choice' ? [] : '']))
    questionsReady.value = true
    await nextTick()
    dialog.value?.querySelector('form input, form select, form textarea, form button')?.focus()
  } catch (e) {
    error.value = e.message || 'Could not load registration. Please try again.'
  } finally {
    loading.value = false
  }
}
async function submitRsvp() {
  if (submitting.value || !questionsReady.value || alreadyRegistered.value || closed.value) return
  error.value = ''
  for (const question of questions.value) {
    const value = answers.value[question.id]
    if (question.required && (value == null || (Array.isArray(value) ? !value.length : !String(value).trim()))) {
      error.value = `Please answer: ${question.prompt}`
      return
    }
  }
  submitting.value = true
  try {
    const { data, error: rpcError } = await supabase.rpc('register_for_event', {
      p_event_id: props.event.id,
      p_answers: questions.value.filter(q => answers.value[q.id] !== '' && answers.value[q.id] != null).map(q => ({
        question_id: q.id,
        answer: q.type === 'number' ? Number(answers.value[q.id]) : q.type === 'yes_no' ? answers.value[q.id] === 'yes' : answers.value[q.id],
      })),
    })
    if (rpcError) throw rpcError
    const registration = Array.isArray(data) ? data[0] : data
    registrationStatus.value = registration?.status
    success.value = ({ confirmed: 'You’re going! Your RSVP is confirmed.', pending: 'RSVP sent. Waiting for organiser approval.', waitlisted: 'You’ve joined the waitlist.' })[registration?.status] || 'Your RSVP has been saved.'
    emit('registered')
  } catch (e) {
    error.value = e.message || 'Could not save your RSVP. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="event-dialog" aria-labelledby="event-dialog-title" @cancel.prevent="!submitting && emit('close')" @click="($event.target === dialog && !submitting) && emit('close')">
    <div class="dialog-content">
      <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
        <div>
          <p class="small text-secondary text-capitalize mb-2">{{ event.category || 'Event' }}</p>
          <h2 id="event-dialog-title" class="h4 fw-bold mb-0">{{ event.title }}</h2>
        </div>
        <button type="button" class="btn-close flex-shrink-0" aria-label="Close event details" :disabled="submitting" @click="emit('close')"></button>
      </div>
      <p class="text-secondary mb-2">{{ dateLabel }}</p>
      <p v-if="event.venue_name" class="text-secondary mb-2">{{ event.venue_name }}</p>
      <p class="small text-secondary">{{ event.confirmed_count ?? 0 }} going<template v-if="event.spots_left != null"> · {{ Number(event.spots_left) === 0 ? 'Full' : `${event.spots_left} spots left` }}</template></p>
      <p v-if="event.description" class="event-description">{{ event.description }}</p>
      <div v-if="success" class="alert alert-success" role="status">{{ success }}</div>
      <template v-else-if="showRegistration">
        <hr />
        <h3 class="h6 fw-bold">RSVP</h3>
        <p v-if="loading" class="text-secondary" role="status">Loading registration…</p>
        <div v-else-if="error && !questionsReady" class="alert alert-danger" role="alert">{{ error }} <button type="button" class="btn btn-link btn-sm" @click="loadRegistration">Try again</button></div>
        <p v-else-if="!signedIn" class="text-secondary" role="status">Please sign in to RSVP for this event.</p>
        <p v-else-if="alreadyRegistered" class="text-secondary" role="status">Your registration status: {{ registrationStatus }}.</p>
        <p v-else-if="closed" class="text-secondary">Registration for this event has closed.</p>
        <form v-else-if="questionsReady" @submit.prevent="submitRsvp">
          <p class="small text-secondary">{{ event.requires_approval ? 'The organiser will review your RSVP.' : Number(event.spots_left) === 0 && event.spots_left != null ? 'This event is full. RSVP to join the waitlist.' : 'Confirm your RSVP to reserve a spot.' }}</p>
          <div v-for="q in questions" :key="q.id" class="mb-3">
            <fieldset v-if="q.type === 'multi_choice'">
              <legend class="fs-6">{{ q.prompt }}{{ q.required ? ' *' : '' }}</legend>
              <div v-for="(option, index) in q.options" :key="index" class="form-check">
                <input :id="`answer-${q.id}-${index}`" v-model="answers[q.id]" type="checkbox" :value="option" class="form-check-input" :disabled="submitting" />
                <label :for="`answer-${q.id}-${index}`" class="form-check-label">{{ option }}</label>
              </div>
            </fieldset>
            <template v-else>
              <label :for="`answer-${q.id}`" class="form-label">{{ q.prompt }}{{ q.required ? ' *' : '' }}</label>
              <textarea v-if="q.type === 'long_text'" :id="`answer-${q.id}`" v-model="answers[q.id]" :required="q.required" :disabled="submitting" class="form-control" rows="3"></textarea>
              <select v-else-if="['single_choice', 'yes_no'].includes(q.type)" :id="`answer-${q.id}`" v-model="answers[q.id]" :required="q.required" :disabled="submitting" class="form-select">
                <option value="">Choose an answer</option>
                <template v-if="q.type === 'yes_no'"><option value="yes">Yes</option><option value="no">No</option></template>
                <template v-else><option v-for="(option, index) in q.options" :key="index" :value="option">{{ option }}</option></template>
              </select>
              <input v-else :id="`answer-${q.id}`" v-model="answers[q.id]" :type="q.type === 'number' ? 'number' : 'text'" :step="q.type === 'number' ? 'any' : undefined" :required="q.required" :disabled="submitting" class="form-control" />
            </template>
          </div>
          <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
          <button type="submit" class="btn btn-primary" :disabled="submitting">{{ submitting ? 'Saving…' : 'Confirm RSVP' }}</button>
        </form>
      </template>
      <button v-else type="button" class="btn btn-primary" :disabled="alreadyRegistered || closed" @click="loadRegistration">{{ alreadyRegistered ? 'Already registered' : closed ? 'RSVP closed' : 'RSVP' }}</button>
    </div>
  </dialog>
</template>

<style scoped>
.event-dialog { width: min(600px, calc(100% - 32px)); max-height: calc(100dvh - 48px); padding: 0; border: 1px solid #e4e6eb; border-radius: 20px; color: #252b35; box-shadow: 0 24px 80px #14213d30; }
.event-dialog::backdrop { background: #18243770; backdrop-filter: blur(3px); }
.dialog-content { padding: 28px; }
.event-description { white-space: pre-wrap; overflow-wrap: anywhere; margin: 24px 0; }
@media (max-width: 575px) { .dialog-content { padding: 22px; } }
</style>
