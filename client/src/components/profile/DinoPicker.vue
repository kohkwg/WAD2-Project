<script setup>
import { DINOS } from '@/lib/dinos';
defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  disabled: Boolean
});

const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <fieldset class="dino-picker" :disabled="disabled">
    <legend class="visually-hidden">Choose your dino</legend>
    <label
    v-for="dino in DINOS"
    :key="dino.id"
    class="dino-option"
    :class="{ 'is-selected': modelValue === dino.id }">
      <input
      type="radio"
      class="visually-hidden"
      name="profile-dino"
      :value="dino.id"
      :checked="modelValue === dino.id"
      @change="emit('update:modelValue', dino.id)" />
      <img :src="dino.src" alt="" width="96" height="96" loading="lazy" />
      <span>{{ dino.label }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.dino-picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}

.dino-option {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 10px 6px 8px;
  border: 2px solid var(--bookedz-border);
  border-radius: 18px;
  background: var(--bookedz-surface);
  color: var(--bookedz-ink);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
  transition: transform var(--bookedz-motion-fast) var(--bookedz-ease), box-shadow var(--bookedz-motion-fast) var(--bookedz-ease);
}

.dino-option img {
  width: 72px;
  height: 72px;
  object-fit: contain;
}

.dino-option:hover {
  transform: translateY(-2px) rotate(-1deg);
}

.dino-option.is-selected {
  border-color: var(--bookedz-ink);
  background: var(--bookedz-teal-soft);
  box-shadow: 4px 4px 0 var(--bookedz-teal);
}

.dino-option:has(input:focus-visible) {
  outline: 3px solid var(--bookedz-focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .dino-option {
    transition: none;
  }
  .dino-option:hover {
    transform: none;
  }
}
</style>
