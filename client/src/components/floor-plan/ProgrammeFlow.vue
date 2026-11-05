<script setup>
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { getProgramme, saveProgrammeItem, deleteProgrammeItem } from '@/utils/floorPlan';
import { programmePayload, singaporeInput } from '@/utils/floorPlanModel';
import ShowHideButton from '@/components/ui/ShowHideButton.vue';
import WheelDateTime from '@/components/ui/WheelDateTime.vue';
// collapsible: the public event page folds the list away behind a show/hide button (editors always see it)

const props = defineProps({
  eventId: {
    type: String,
    required: true
  },
  canEdit: Boolean,
  planId: {
    type: String,
    default: null
  },
  zones: {
    type: Array,
    default: () => []
  },
  collapsible: Boolean,
  eventStart: {
    type: String,
    default: ''
  },
  eventEnd: {
    type: String,
    default: ''
  }
});

const open = ref(false);
// the event's own time, in singapore, which every programme item has to fall inside

const windowStart = computed(() => props.eventStart ? singaporeInput(props.eventStart) : '');

const windowLabel = computed(() => {
  if (!props.eventStart || !props.eventEnd) return '';
  const fmt = value => new Date(value).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return `${fmt(props.eventStart)} to ${fmt(props.eventEnd)}`;
});

const bodyId = useId();

const showBody = computed(() => !props.collapsible || open.value);

const items = ref([]),
  error = ref(''),
  loading = ref(false),
  busy = ref(false),
  editing = ref(false),
  pendingDelete = ref(null);

const empty = () => ({
  id: null,
  title: '',
  description: '',
  starts_at: '',
  ends_at: '',
  location_label: '',
  zone_key: ''
});

const draft = ref(empty());

// Each load uses a new token. Code ignores a reply that has an old token.
let generation = 0;

onBeforeUnmount(() => {
  generation++;
});

watch(() => [props.eventId, props.planId], load, {
  immediate: true
});

async function load() {
  const token = ++generation;
  items.value = [];
  error.value = '';
  editing.value = false;
  pendingDelete.value = null;
  busy.value = false;
  loading.value = true;
  try {
    const rows = await getProgramme(props.eventId, props.planId);
    if (token === generation) items.value = rows;
  } catch (e) {
    if (token === generation) error.value = e.message;
  } finally {
    if (token === generation) loading.value = false;
  }
}

const ordered = computed(() => [...items.value].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.position - b.position));

function edit(item) {
  draft.value = item ? {
    ...item,
    starts_at: singaporeInput(item.starts_at),
    ends_at: singaporeInput(item.ends_at)
  } : empty();
  editing.value = true;
  error.value = '';
}
// new items join the open plan; an existing item keeps its plan (or stays event-level
// unless it now points at a zone, which belongs to the open plan).

const planFor = payload => draft.value.id ? draft.value.floor_plan_id || (payload.zone_key ? props.planId : null) || null : props.planId || null;

async function save() {
  if (busy.value || !props.canEdit) return;
  const token = generation,
    eid = props.eventId;
  error.value = '';
  busy.value = true;
  try {
    const payload = programmePayload(draft.value, props.zones, {
      start: props.eventStart,
      end: props.eventEnd
    });
    const row = await saveProgrammeItem(eid, {
      ...payload,
      id: draft.value.id,
      floor_plan_id: planFor(payload),
      position: items.value.length
    });
    if (token !== generation) return;
    items.value = [...items.value.filter(x => x.id !== row.id), row];
    editing.value = false;
  } catch (e) {
    if (token === generation) error.value = e.message;
  } finally {
    if (token === generation) busy.value = false;
  }
}

async function remove() {
  if (busy.value || !props.canEdit) return;
  const token = generation,
    id = pendingDelete.value.id;
  busy.value = true;
  error.value = '';
  try {
    await deleteProgrammeItem(props.eventId, id);
    if (token === generation) {
      items.value = items.value.filter(x => x.id !== id);
      pendingDelete.value = null;
    }
  } catch (e) {
    if (token === generation) error.value = e.message;
  } finally {
    if (token === generation) busy.value = false;
  }
}

const time = value => new Intl.DateTimeFormat('en-SG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Singapore'
}).format(new Date(value));
</script>
<template>
<section class="my-4 programme-flow" aria-label="Programme flow">
  <div class="programme-heading" :class="{ 'is-folded': !showBody }">
    <div>
      <span class="programme-kicker">Run of show</span>
      <h2 class="h5 mb-0">Programme</h2>
    </div>
    <button
      v-if="canEdit"
      class="btn btn-sm btn-outline-primary"
      @click="edit(null)"
      :disabled="busy">Add programme item</button>
    <ShowHideButton
      v-else-if="collapsible"
      v-model="open"
      :controls="bodyId"
      label="programme"
      :count="loading ? null : items.length" />
  </div>
  <div :id="bodyId" v-show="showBody">
  <p v-if="loading" role="status">Loading programme…</p>
  <div
      v-dismissible
      v-if="error"
      class="alert alert-danger"
      role="alert">{{ error }} <button
        v-if="!editing && !pendingDelete"
        class="btn btn-sm btn-outline-danger"
        @click="load">Retry programme</button></div>
  <form v-if="editing && canEdit" class="programme-form border rounded p-3 mb-3" @submit.prevent="save">
    <div class="row g-2">
      <label class="col-12">Title<input v-model="draft.title" required maxlength="180" class="form-control" /></label>
      <!-- scrolling wheels, as in create event. plain divs (not labels) so a tap inside the wheels doesn't re-open the field -->
      <div class="col-12 col-sm-6">
        <label :for="`${bodyId}-starts`">Starts (Singapore)</label>
        <WheelDateTime :id="`${bodyId}-starts`" v-model="draft.starts_at" :min="windowStart" />
      </div>
      <div class="col-12 col-sm-6">
        <label :for="`${bodyId}-ends`">Ends (Singapore)</label>
        <WheelDateTime
            :id="`${bodyId}-ends`"
            v-model="draft.ends_at"
            clearable
            :min="draft.starts_at || windowStart" />
      </div>
      <p v-if="windowLabel" class="col-12 small text-secondary mb-0">Times have to fall within the event: {{ windowLabel }}.</p>
      <label class="col-12">Description<textarea v-model="draft.description" class="form-control" maxlength="4000"></textarea></label>
      <label class="col-12 col-sm-6">Location<input v-model="draft.location_label" class="form-control" maxlength="180" /></label>
      <label class="col-12 col-sm-6">Floor-plan zone<select
            aria-label="Floor-plan zone"
            v-model="draft.zone_key"
            class="form-select">
            <option value="">No zone</option>
            <option v-for="zone in zones" :key="zone.id" :value="zone.id">{{ zone.label }}</option></select></label>
    </div>
    <div class="d-flex gap-2 mt-3">
        <button class="btn btn-primary" :disabled="busy">Save programme item</button>
        <button
          type="button"
          class="btn btn-outline-secondary"
          :disabled="busy"
          @click="editing = false">Cancel</button></div>
  </form>
  <div
      v-if="pendingDelete"
      class="alert alert-warning"
      role="alert">Delete “{{ pendingDelete.title }}”? <button class="btn btn-sm btn-danger" :disabled="busy" @click="remove">Confirm delete programme item</button> <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        @click="pendingDelete = null">Cancel</button></div>
  <p v-if="!loading && !items.length" class="programme-empty">No programme items yet.</p>
  <ol v-else class="programme-list">
    <li v-for="item in ordered" :key="item.id" class="programme-item">
      <time class="programme-time" :datetime="item.starts_at">{{ time(item.starts_at) }}</time>
      <div class="programme-copy">
        <h3 class="h6 mb-1">{{ item.title }}</h3>
        <p class="small mb-1">
            <template v-if="item.ends_at">Ends {{ time(item.ends_at) }} (SGT)</template>
            <template v-else>Start time shown in SGT</template></p>
        <p v-if="item.description" class="mb-1">{{ item.description }}</p>
        <p class="small text-muted mb-0">{{ item.location_label }}<template v-if="item.zone_key"> · {{ zones.find(z => z.id === item.zone_key)?.label || 'Zone no longer available' }}</template></p>
        <div v-if="canEdit" class="programme-actions">
            <button
              class="btn btn-sm btn-outline-primary"
              :disabled="busy"
              @click="edit(item)">Edit {{ item.title }}</button>
            <button
              class="btn btn-sm btn-outline-danger"
              :disabled="busy"
              @click="pendingDelete = item">Delete {{ item.title }}</button></div>
      </div>
    </li>
  </ol>
  </div>
</section>
</template>
<style scoped>
.programme-copy {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>

<style scoped>
.programme-flow {
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--dino-border,#e9ded3);
  border-radius: 18px;
  background: var(--dino-surface,#ffffff);
  box-shadow: var(--dino-card-shadow,none);
}

.programme-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: .75rem;
  margin-bottom: 1rem;
}

.programme-heading.is-folded {
  margin-bottom: 0;
}

.programme-kicker {
  display: block;
  color: var(--dino-muted,#636975);
  font-size: .72rem;
  font-weight: 750;
}

.programme-flow h2,.programme-flow h3 {
  font-family: var(--dino-heading,'Bricolage Grotesque',sans-serif);
  letter-spacing: -.02em;
}

.programme-form {
  background: var(--dino-cream,#fff8f1);
}

.programme-flow .border.rounded {
  border-color: var(--dino-border,#e9ded3)!important;
  border-radius: 14px!important;
}

.programme-flow .form-control,.programme-flow .form-select {
  min-height: 42px;
  border-color: var(--dino-border,#e9ded3);
  border-radius: 10px;
}

.programme-flow .btn {
  border-radius: 10px;
  min-height: 38px;
}

.programme-flow .btn-primary {
  --bs-btn-bg: var(--dino-primary-dark,#9a3412);
  --bs-btn-border-color: var(--dino-primary-dark,#9a3412);
  --bs-btn-color: var(--dino-on-action,#ffffff);
  --bs-btn-hover-bg: var(--dino-primary-hover,#9a3412);
  --bs-btn-hover-border-color: var(--dino-primary-hover,#9a3412);
}

.programme-empty {
  margin: 0;
  color: var(--dino-muted,#636975);
}

.programme-list {
  display: grid;
  gap: .7rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.programme-item {
  display: grid;
  grid-template-columns: minmax(9rem,13rem) minmax(0,1fr);
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--dino-border,#e9ded3);
  border-radius: 14px;
  background: var(--dino-cream,#fff8f1);
}

.programme-time {
  color: var(--dino-primary-dark,#9a3412);
  font-weight: 750;
  line-height: 1.35;
}

.programme-actions {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  margin-top: .7rem;
}

@media(max-width:575.98px) {
  .programme-flow {
    padding: 1rem;
    border-radius: 16px;
  }
  .programme-item {
    grid-template-columns: 1fr;
    gap: .45rem;
  }
  .programme-time {
    padding-bottom: .45rem;
    border-bottom: 1px solid var(--dino-border,#e9ded3);
  }
}
</style>
