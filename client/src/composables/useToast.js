import { reactive, readonly } from 'vue';

// one shared list for action feedback and account updates

const state = reactive({
  items: []
});

const timers = new Map();

let nextId = 1;

// explicit durations keep undo buttons in step with their undo window

export function toast(message, {
  tone = 'success',
  duration = 10_000,
  action = null,
  to = null
} = {}) {
  const id = nextId++;
  state.items.push({
    id,
    message,
    tone,
    action,
    to
  });
  timers.set(id, setTimeout(() => dismissToast(id), duration));
  return id;
}

export function dismissToast(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const index = state.items.findIndex(item => item.id === id);
  if (index !== -1) state.items.splice(index, 1);
}

export function clearToasts() {
  for (const item of [...state.items]) dismissToast(item.id);
}

export const toasts = readonly(state);
