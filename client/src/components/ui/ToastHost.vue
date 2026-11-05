<script setup>
import { nextTick, watch } from 'vue';
import { RouterLink } from 'vue-router';
import cheerfulDino from '@/assets/dinos/cheer.png';
import curiousDino from '@/assets/dinos/wondering.png';
import sadDino from '@/assets/dinos/sad.png';
import { focusAfterNotice } from '@/directives/dismissibleNotice.js';
import { toasts, dismissToast } from '@/composables/useToast';
// return focus to the page if a timed-out notice contained the focused button

watch(() => toasts.items.map(item => String(item.id)), async ids => {
  const notice = document.activeElement?.closest('.toast-item');
  if (!notice || ids.includes(notice.dataset.toastId)) return;
  await nextTick();
  focusAfterNotice(notice);
});

async function closeToast(id, event) {
  const notice = event.currentTarget.closest('.toast-item');
  dismissToast(id);
  await nextTick();
  if (notice) focusAfterNotice(notice);
}
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <div
      v-for="item in toasts.items"
      :key="item.id"
      :data-toast-id="item.id"
      class="toast-item"
      :class="`toast-item--${item.tone}`"
      role="status">
        <img
          class="toast-dino"
          :src="['sad', 'error'].includes(item.tone) ? sadDino : item.tone === 'success' ? cheerfulDino : curiousDino"
          alt=""
          aria-hidden="true"
          width="56"
          height="56"
        />
        <div class="toast-copy">
          <span>{{ item.message }}</span>
          <RouterLink
          v-if="item.to"
          :to="item.to"
          class="toast-link"
          @click="dismissToast(item.id)">View update →</RouterLink>
        </div>
        <button
        v-if="item.action"
        type="button"
        class="toast-action"
        @click="item.action.onClick(); dismissToast(item.id)">{{ item.action.label }}</button>
        <button
        type="button"
        class="toast-close"
        aria-label="Dismiss notification"
        @click="closeToast(item.id, $event)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  z-index: 2000;
  right: max(16px, env(safe-area-inset-right));
  top: calc(16px + env(safe-area-inset-top));
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  gap: 8px;
  width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}

.toast-item {
  position: relative;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 52px 10px 14px;
  border-radius: 14px;
  background: var(--dino-ink);
  color: var(--dino-surface);
  font-size: .9rem;
  font-weight: 600;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .22);
  pointer-events: auto;
}

.toast-item--error {
  background: var(--dino-danger);
  color: #fff;
}

.toast-copy {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.toast-dino {
  flex: none;
  object-fit: contain;
  filter: drop-shadow(0 3px 2px rgba(0,0,0,.15));
}

.toast-link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: inherit;
  font-weight: 700;
  text-underline-offset: 3px;
}

.toast-item:focus-within {
  outline: 3px solid var(--dino-primary);
  outline-offset: -3px;
}

.toast-item--sad {
  border-left: 4px solid var(--dino-primary);
}

.toast-action {
  min-height: 44px;
  padding: 4px 12px;
  border: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--dino-surface) 18%, transparent);
  color: inherit;
  font: inherit;
  font-weight: 700;
}

.toast-action:hover {
  background: color-mix(in srgb, var(--dino-surface) 28%, transparent);
}

.toast-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 1.2rem;
  line-height: 1;
  opacity: .7;
}

.toast-close:hover {
  opacity: 1;
  background: rgba(255, 255, 255, .12);
}

.toast-enter-active, .toast-leave-active {
  transition: opacity var(--dino-motion-normal) var(--dino-ease), transform var(--dino-motion-normal) var(--dino-ease);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(.98);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.toast-move {
  transition: transform var(--dino-motion-normal) var(--dino-ease);
}

@media (max-width: 575px) {
  .toast-host {
    right: 12px;
    width: calc(100vw - 24px);
  }
  .toast-dino {
    width: 44px;
    height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active, .toast-leave-active, .toast-move {
    transition: none;
  }
}
</style>
