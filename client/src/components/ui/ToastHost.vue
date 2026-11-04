<script setup>
import { toasts, dismissToast } from '@/composables/useToast'
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <div v-for="item in toasts.items" :key="item.id" class="toast-item" :class="`toast-item--${item.tone}`" role="status">
        <svg v-if="item.tone === 'success'" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="m5 10.5 3.2 3.2L15 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span>{{ item.message }}</span>
        <button v-if="item.action" type="button" class="toast-action" @click="item.action.onClick(); dismissToast(item.id)">{{ item.action.label }}</button>
        <button type="button" class="toast-close" aria-label="Dismiss" @click="dismissToast(item.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host { position: fixed; z-index: 2000; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%); display: grid; gap: 8px; width: min(420px, calc(100vw - 32px)); pointer-events: none; }
.toast-item { display: flex; align-items: center; gap: 10px; padding: 10px 8px 10px 14px; border-radius: 14px; background: var(--bookedz-ink); color: var(--bookedz-surface); font-size: .9rem; font-weight: 600; box-shadow: 0 10px 30px rgba(0, 0, 0, .22); pointer-events: auto; }
.toast-item--success svg { color: var(--bookedz-mint); flex: none; }
.toast-item--error { background: var(--bookedz-danger); color: #fff; }
.toast-item span { flex: 1; }
.toast-action { min-height: 32px; padding: 4px 12px; border: 0; border-radius: 8px; background: color-mix(in srgb, var(--bookedz-surface) 18%, transparent); color: inherit; font: inherit; font-weight: 700; }
.toast-action:hover { background: color-mix(in srgb, var(--bookedz-surface) 28%, transparent); }
.toast-close { width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: inherit; font-size: 1.2rem; line-height: 1; opacity: .7; }
.toast-close:hover { opacity: 1; background: rgba(255, 255, 255, .12); }
.toast-enter-active, .toast-leave-active { transition: opacity var(--bookedz-motion-normal) var(--bookedz-ease), transform var(--bookedz-motion-normal) var(--bookedz-ease); }
.toast-enter-from { opacity: 0; transform: translateY(12px) scale(.98); }
.toast-leave-to { opacity: 0; transform: translateY(6px); }
.toast-move { transition: transform var(--bookedz-motion-normal) var(--bookedz-ease); }
@media (max-width: 767px) { .toast-host { bottom: calc(84px + env(safe-area-inset-bottom)); } }
</style>
