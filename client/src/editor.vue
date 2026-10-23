<script setup>
// Feature 6 (Vivienne): floor plan editor + read-only viewer for one event.
// Organisers drag boxes (zones) and labelled people markers, then Save; the layout
// is stored in public.floor_plans (see utils/floorPlan.js). Everyone else, and the
// public event page (read-only prop), sees the saved plan without editing controls.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { canEditFloorPlan, getFloorPlan, saveFloorPlan } from '@/utils/floorPlan'

const props = defineProps({
    // Viewer mode for the public event page: never editable, hidden when no plan exists
    eventId: { type: String, default: '' },
    readOnly: { type: Boolean, default: false },
})

const route = useRoute()
const eventId = computed(() => props.eventId || String(route.params.eventId || ''))

const loading = ref(true)
const loadError = ref('')
const isOrganiser = ref(false)
const planId = ref(null)
const saving = ref(false)
const saveMessage = ref('') // 'Saved.' or an error
const dirty = ref(false)

// Real roles: only the event's organisers edit (RLS enforces it on save too)
const canEdit = computed(() => !props.readOnly && isOrganiser.value)

const editorStatus = computed(() => {
    if (canEdit.value) return dirty.value ? 'Unsaved changes' : 'All changes saved'
    return 'View only'
})

const stageConfig = {
    width: 900,
    height: 560
}

const floorBounds = {
    x: 20,
    y: 20,
    width: 860,
    height: 520,
}

const boxColours = ['#2f80ed', '#27ae60', '#f2994a', '#9b51e0', '#eb5757', '#0891b2']
const personColours = ['#111827', '#0f766e', '#7c3aed', '#be123c', '#1d4ed8', '#a16207']
const nextBoxNumber = ref(1)
const nextPersonNumber = ref(1)

// New plans start empty; organisers add boxes (zones) and labelled people markers
const floorObjects = ref([])
const people = ref([])

async function load() {
    loading.value = true
    loadError.value = ''
    try {
        const [plan, organiser] = await Promise.all([
            getFloorPlan(eventId.value),
            props.readOnly ? Promise.resolve(false) : canEditFloorPlan(eventId.value),
        ])
        isOrganiser.value = Boolean(organiser)
        if (plan) {
            planId.value = plan.id
            floorObjects.value = plan.layout?.objects ?? []
            people.value = plan.layout?.people ?? []
            nextBoxNumber.value = floorObjects.value.length + 1
            nextPersonNumber.value = people.value.length + 1
        }
    } catch (e) {
        loadError.value = e.message || 'Could not load the floor plan.'
    } finally {
        loading.value = false
        await nextTick()
        dirty.value = false
    }
}

// Any edit after loading (move, add, rename, remove) marks the plan unsaved
watch([floorObjects, people], () => {
    if (!loading.value) {
        dirty.value = true
        saveMessage.value = ''
    }
}, { deep: true })

async function save() {
    if (!canEdit.value || saving.value) return
    saving.value = true
    saveMessage.value = ''
    try {
        const row = await saveFloorPlan(eventId.value, {
            id: planId.value,
            width: stageConfig.width,
            height: stageConfig.height,
            objects: floorObjects.value,
            people: people.value,
        })
        planId.value = row.id
        dirty.value = false
        saveMessage.value = 'Saved.'
    } catch (e) {
        saveMessage.value = e.message || 'Could not save the floor plan.'
    } finally {
        saving.value = false
    }
}

function removeItem(list, item) {
    if (!canEdit.value) return
    list.splice(list.indexOf(item), 1)
}

onMounted(load)

function updatePosition(item, event) {
    item.x = event.target.x()
    item.y = event.target.y()
}

function safeGridPosition(index, options) {
    const columns = Math.max(1, Math.floor((floorBounds.width - options.padding * 2) / options.columnWidth))
    const rows = Math.max(1, Math.floor((floorBounds.height - options.padding * 2) / options.rowHeight))
    const slot = index % (columns * rows)
    const column = slot % columns
    const row = Math.floor(slot / columns)

    return {
        x: floorBounds.x + options.padding + column * options.columnWidth + options.offsetX,
        y: floorBounds.y + options.padding + row * options.rowHeight + options.offsetY,
    }
}

function addBox() {
    if (!canEdit.value) return

    const boxNumber = nextBoxNumber.value
    const width = 130
    const height = 70
    const position = safeGridPosition(boxNumber - 1, {
        padding: 36,
        columnWidth: 150,
        rowHeight: 90,
        offsetX: 0,
        offsetY: 0,
    })

    floorObjects.value.push({
        id: `box-${Date.now()}`,
        type: 'rect',
        label: `New Box ${boxNumber}`,
        x: Math.min(position.x, floorBounds.x + floorBounds.width - width),
        y: Math.min(position.y, floorBounds.y + floorBounds.height - height),
        width,
        height,
        fill: boxColours[(floorObjects.value.length + boxNumber) % boxColours.length],
    })

    nextBoxNumber.value += 1
}

function addPerson() {
    if (!canEdit.value) return

    const personNumber = nextPersonNumber.value
    const radius = 20
    const labelHeight = 34
    const position = safeGridPosition(personNumber - 1, {
        padding: radius + 42,
        columnWidth: 92,
        rowHeight: 86,
        offsetX: 0,
        offsetY: 0,
    })

    people.value.push({
        id: `person-${Date.now()}`,
        name: `Person ${personNumber}`,
        role: 'Helper',
        x: Math.min(position.x, floorBounds.x + floorBounds.width - radius),
        y: Math.min(position.y, floorBounds.y + floorBounds.height - radius - labelHeight),
        radius,
        fill: personColours[(people.value.length + personNumber) % personColours.length],
    })

    nextPersonNumber.value += 1
}

function keepInsideFloor(item, position) {
    const minX = floorBounds.x
    const minY = floorBounds.y
    const maxX = floorBounds.x + floorBounds.width - item.width
    const maxY = floorBounds.y + floorBounds.height - item.height

    return {
        x: Math.min(Math.max(position.x, minX), maxX),
        y: Math.min(Math.max(position.y, minY), maxY),
    }
}

function keepPersonInsideFloor(person, position) {
    const labelHeight = 34
    const minX = floorBounds.x + person.radius
    const minY = floorBounds.y + person.radius
    const maxX = floorBounds.x + floorBounds.width - person.radius
    const maxY = floorBounds.y + floorBounds.height - person.radius - labelHeight

    return {
        x: Math.min(Math.max(position.x, minX), maxX),
        y: Math.min(Math.max(position.y, minY), maxY),
    }
}

</script>

<template>
    <!-- Viewer mode renders nothing until a plan exists, so event pages without one stay clean -->
    <div v-if="!readOnly || (!loading && !loadError && planId)" :class="readOnly ? 'floor-plan-viewer' : 'container py-4'">
        <template v-if="!readOnly">
            <RouterLink :to="`/organiser/events/${eventId}/manage`" class="small d-block mb-3">&larr; Manage event</RouterLink>
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                <div>
                    <h1 class="h3 mb-1">Floor plan</h1>
                    <p class="text-muted mb-0" role="status">{{ loading ? 'Loading…' : editorStatus }}</p>
                </div>

                <div v-if="canEdit" class="d-flex align-items-center gap-2">
                    <span v-if="saveMessage" class="small" :class="saveMessage === 'Saved.' ? 'text-success' : 'text-danger'" role="status">{{ saveMessage }}</span>
                    <button class="btn btn-primary" type="button" :disabled="saving || !dirty" @click="save">
                        <span v-if="saving" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
                        Save floor plan
                    </button>
                </div>
            </div>
        </template>
        <h2 v-else class="h5 mb-2">Floor plan</h2>

        <div v-if="loading && !readOnly" class="py-5 text-center">
            <div class="spinner-border" role="status"><span class="visually-hidden">Loading floor plan…</span></div>
        </div>
        <div v-else-if="loadError" class="alert alert-danger" role="alert">{{ loadError }}</div>

        <template v-else>
        <p v-if="canEdit && !floorObjects.length && !people.length" class="text-muted small">
            No floor plan yet. Add boxes for areas (stage, booths, entrance) and people for helper spots, drag them into place, then save.
        </p>

        <section v-if="canEdit" class="edit-panel mb-3">
            <div>
                <div class="edit-heading">
                    <h2 class="h6 mb-0">Boxes</h2>
                    <button
                        class="btn btn-sm btn-outline-primary"
                        type="button"
                        :disabled="!canEdit"
                        @click="addBox"
                    >
                        Add box
                    </button>
                </div>

                <div class="edit-grid">
                    <label
                        v-for="item in floorObjects"
                        :key="item.id"
                        class="edit-field"
                    >
                        <span
                            class="colour-dot"
                            :style="{ backgroundColor: item.fill }"
                        ></span>
                        <input
                            v-model="item.label"
                            class="form-control form-control-sm"
                            maxlength="24"
                            :aria-label="`Box name: ${item.label}`"
                            :disabled="!canEdit"
                        >
                        <button
                            class="btn btn-sm btn-outline-danger"
                            type="button"
                            :aria-label="`Remove ${item.label}`"
                            @click.prevent="removeItem(floorObjects, item)"
                        >&times;</button>
                    </label>
                </div>
            </div>

            <div>
                <div class="edit-heading">
                    <h2 class="h6 mb-0">People</h2>
                    <button
                        class="btn btn-sm btn-outline-primary"
                        type="button"
                        :disabled="!canEdit"
                        @click="addPerson"
                    >
                        Add person
                    </button>
                </div>

                <div class="edit-grid people-grid">
                    <div
                        v-for="person in people"
                        :key="person.id"
                        class="person-edit-row"
                    >
                        <span
                            class="colour-dot"
                            :style="{ backgroundColor: person.fill }"
                        ></span>
                        <input
                            v-model="person.name"
                            class="form-control form-control-sm"
                            maxlength="18"
                            :disabled="!canEdit"
                        >
                        <select
                            v-model="person.role"
                            class="form-select form-select-sm"
                            :aria-label="`Role for ${person.name}`"
                            :disabled="!canEdit"
                        >
                            <option>Organiser</option>
                            <option>Helper</option>
                        </select>
                        <button
                            class="btn btn-sm btn-outline-danger"
                            type="button"
                            :aria-label="`Remove ${person.name}`"
                            @click="removeItem(people, person)"
                        >&times;</button>
                    </div>
                </div>
            </div>
        </section>

        <section class="editor-shell">
            <div class="stage-wrap">
                <v-stage :config="stageConfig">
                <v-layer>
                    <v-rect :config="{
                        x: 0,
                        y: 0,
                        width: stageConfig.width,
                        height: stageConfig.height,
                        fill: '#f6f7f9',
                    }" />

                    <v-rect :config="{
                        x: floorBounds.x,
                        y: floorBounds.y,
                        width: floorBounds.width,
                        height: floorBounds.height,
                        fill: '#ffffff',
                        stroke: '#ced4da',
                        strokeWidth: 2,
                    }" />

                    <v-group
                        v-for="item in floorObjects"
                        :key="item.id"
                        :config="{
                            x: item.x,
                            y: item.y,
                            draggable: canEdit,
                            opacity: canEdit ? 1 : 0.75,
                            dragBoundFunc: (position) => keepInsideFloor(item, position),
                        }"
                        @dragend="updatePosition(item, $event)"
                    >
                        <v-rect :config="{
                            x: 0,
                            y: 0,
                            width: item.width,
                            height: item.height,
                            fill: item.fill,
                            cornerRadius: 6,
                        }" />

                        <v-text :config="{
                            x: 8,
                            y: item.height / 2 - 8,
                            width: item.width - 16,
                            text: item.label,
                            align: 'center',
                            fill: '#ffffff',
                            fontSize: 15,
                            fontStyle: 'bold',
                            wrap: 'none',
                            ellipsis: true,
                            listening: false,
                        }" />
                    </v-group>

                    <v-group
                        v-for="person in people"
                        :key="person.id"
                        :config="{
                            x: person.x,
                            y: person.y,
                            draggable: canEdit,
                            opacity: canEdit ? 1 : 0.75,
                            dragBoundFunc: (position) => keepPersonInsideFloor(person, position),
                        }"
                        @dragend="updatePosition(person, $event)"
                    >
                        <v-circle :config="{
                            x: 0,
                            y: 0,
                            radius: person.radius,
                            fill: person.fill,
                            stroke: '#ffffff',
                            strokeWidth: 3,
                            shadowColor: '#000000',
                            shadowOpacity: 0.14,
                            shadowBlur: 8,
                            shadowOffset: { x: 0, y: 3 },
                        }" />

                        <v-text :config="{
                            x: -person.radius,
                            y: -8,
                            width: person.radius * 2,
                            text: person.name.slice(0, 1),
                            align: 'center',
                            fill: '#ffffff',
                            fontSize: 16,
                            fontStyle: 'bold',
                            listening: false,
                        }" />

                        <v-text :config="{
                            x: -50,
                            y: person.radius + 8,
                            width: 100,
                            text: person.name,
                            align: 'center',
                            fill: '#111827',
                            fontSize: 14,
                            fontStyle: 'bold',
                            wrap: 'none',
                            ellipsis: true,
                            listening: false,
                        }" />

                        <v-text :config="{
                            x: -50,
                            y: person.radius + 25,
                            width: 100,
                            text: person.role,
                            align: 'center',
                            fill: '#6b7280',
                            fontSize: 11,
                            listening: false,
                        }" />
                    </v-group>
                </v-layer>
                </v-stage>
            </div>
        </section>
        </template>
    </div>
</template>

<style scoped>
.editor-shell {
    max-width: 100%;
    overflow: auto;
    padding: 16px;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    background: #f6f7f9;
}

.floor-plan-viewer {
    margin-top: 1.5rem;
}

.edit-panel {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 14px;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    background: #ffffff;
}

.edit-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.edit-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
}

.edit-field,
.person-edit-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.people-grid {
    grid-template-columns: 1fr;
}

.colour-dot {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    border-radius: 999px;
}

.stage-wrap {
    width: fit-content;
    line-height: 0;
}

:deep(.konvajs-content) {
    display: block;
}
</style>
