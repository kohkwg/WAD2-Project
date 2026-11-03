<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CreateEventView from './CreateEventView.vue'
import HangoutWizard from '../components/hangout/HangoutWizard.vue'

// Create event starts by choosing a template. ?template= keeps the choice in the URL,
// so Back returns to the picker and a reload keeps the chosen wizard.
const route = useRoute()
const router = useRouter()
const template = computed(() => (['official', 'hangout'].includes(route.query.template) ? route.query.template : ''))
const heading = ref(null)
const hangoutCreated = ref(false) // switching templates makes no sense once the hangout exists

function choose(value) {
  router.push({ query: { ...route.query, template: value } })
}
watch(template, async (value) => {
  if (value) return
  await nextTick()
  heading.value?.focus({ preventScroll: true })
})
</script>

<template>
  <div v-if="template && !hangoutCreated" class="template-switch">
    <RouterLink :to="{ query: { ...route.query, template: undefined } }">← Choose a different template</RouterLink>
    <span>{{ template === 'official' ? 'Official event' : 'Hangout' }} template · your draft is kept if you switch</span>
  </div>
  <!-- KeepAlive keeps each wizard's draft while the organiser compares templates. -->
  <KeepAlive>
    <CreateEventView v-if="template === 'official'" />
    <HangoutWizard v-else-if="template === 'hangout'" @created="hangoutCreated = true" />
  </KeepAlive>
  <div v-if="!template" class="template-picker">
    <p class="picker-washi">New on Bookedz</p>
    <h1 ref="heading" tabindex="-1">What are you making?</h1>
    <p class="picker-lede">Pick a template. You can go back and switch before you publish.</p>
    <div class="template-grid">
      <button type="button" class="template-card template-card--official" @click="choose('official')">
        <span class="template-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15a3 3 0 0 0 3-3h30a3 3 0 0 0 3 3v4a5 5 0 0 0 0 10v4a3 3 0 0 0-3 3H9a3 3 0 0 0-3-3v-4a5 5 0 0 0 0-10Z"/><path d="M30 12v24" stroke-dasharray="3 3"/><path d="m15 24 4 4 7-8"/></svg>
        </span>
        <span class="template-kicker">Official event</span>
        <span class="template-title">A Bookedz event for the public</span>
        <span class="template-copy">A set date, time and venue, with RSVP questions, capacity, waitlist, check-in and organiser tools.</span>
        <span class="template-points"><span>Workshops</span><span>Talks</span><span>Club nights</span></span>
        <span class="template-go">Use Official <span aria-hidden="true">→</span></span>
      </button>
      <button type="button" class="template-card template-card--hangout" @click="choose('hangout')">
        <span class="template-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="17" r="6"/><circle cx="33" cy="19" r="5"/><path d="M6 38c1-7 6-11 11-11s10 4 11 11M27 37c1-5 4-8 7-8s7 3 8 8"/></svg>
        </span>
        <span class="template-kicker">Hangout</span>
        <span class="template-title">Plan an outing with friends</span>
        <span class="template-copy">Share one link, collect everyone’s free times, shape a plan from real Bookedz events and places, then vote and confirm.</span>
        <span class="template-points"><span>Private invite</span><span>Open Jio</span><span>Solo plan</span></span>
        <span class="template-go">Use Hangout <span aria-hidden="true">→</span></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.template-picker { padding-block: 1rem 2rem; }
.template-switch { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; margin-bottom: 12px; font-size: .85rem; color: var(--bookedz-muted); }
.template-switch a { display: inline-flex; align-items: center; min-height: 44px; font-weight: 700; color: var(--bookedz-primary-dark); text-decoration: none; }
.template-switch a:hover { text-decoration: underline; }
.template-picker h1 { margin-bottom: .5rem; }
.template-picker h1:focus { outline: none; }
.picker-washi { display: inline-block; margin: 0 0 14px; padding: 4px 12px; background: var(--bookedz-mango-soft); color: var(--bookedz-ink); font-size: .75rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; transform: rotate(-1.5deg); }
.picker-lede { color: var(--bookedz-muted); margin-bottom: 1.75rem; }
.template-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.template-card { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 28px; border: 1px solid var(--bookedz-border); border-radius: var(--bookedz-radius-card); background: var(--bookedz-surface); color: var(--bookedz-ink); text-align: left; box-shadow: var(--bookedz-card-shadow); transition: transform var(--bookedz-motion-normal) var(--bookedz-ease), box-shadow var(--bookedz-motion-normal) var(--bookedz-ease), border-color var(--bookedz-motion-fast) var(--bookedz-ease); }
.template-card:hover { transform: translateY(-4px); box-shadow: var(--bookedz-shadow); border-color: var(--bookedz-control-border); }
.template-card:active { transform: translateY(0); transition-duration: var(--bookedz-motion-feedback); }
.template-icon { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 18px; }
.template-icon svg { width: 40px; height: 40px; }
.template-card--official .template-icon { background: var(--bookedz-orange-soft); color: var(--bookedz-primary-dark); }
.template-card--hangout .template-icon { background: var(--bookedz-teal-soft); color: var(--bookedz-teal-ink); }
.template-kicker { font-size: .78rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--bookedz-primary-dark); }
.template-card--hangout .template-kicker { color: var(--bookedz-teal-ink); }
.template-title { font-family: var(--bookedz-heading); font-size: 1.45rem; font-weight: 900; line-height: 1.15; }
.template-copy { color: var(--bookedz-muted); line-height: 1.55; }
.template-points { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 4px; border-top: 1px dashed var(--bookedz-border); width: 100%; padding-top: 12px; }
.template-points span { padding: 4px 10px; border-radius: 99px; background: var(--bookedz-glass-solid); border: 1px solid var(--bookedz-border); font-size: .78rem; font-weight: 600; }
.template-go { margin-top: auto; padding-top: 8px; font-weight: 800; color: var(--bookedz-primary-dark); }
.template-card--hangout .template-go { color: var(--bookedz-teal-ink); }
@media (max-width: 767.98px) { .template-grid { grid-template-columns: 1fr; } .template-card { padding: 22px; } }
@media (prefers-reduced-motion: reduce) { .template-card,.template-card:hover { transition: none; transform: none; } }
</style>
