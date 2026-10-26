<script setup>
// Feature 6 (Vivienne): floor plan editor + read-only viewer for one event.
// Organisers drag boxes (zones) and labelled people markers, then Save; the layout
// is stored in public.floor_plans (see utils/floorPlan.js). Everyone else, and the
// public event page (read-only prop), sees the saved plan without editing controls.
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { canEditFloorPlan, getFloorPlan, saveFloorPlan, getPlanMembers, getHelperPlacements, saveHelperPlacement, deleteHelperPlacement } from '@/utils/floorPlan'
import { USING_SUPABASE, getEvent } from '@/utils/api'
import { clampPosition } from '@/utils/floorPlanModel'
import VenueMap from '@/components/VenueMap.vue'
import ProgrammeFlow from '@/components/floor-plan/ProgrammeFlow.vue'
import FloorPlanImages from '@/components/floor-plan/FloorPlanImages.vue'

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
const planStats = computed(() => [
    { label: 'Zones', value: floorObjects.value.length },
    { label: 'People markers', value: people.value.length },
    { label: 'Team placements', value: placements.value.length },
])

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

const currentEvent = ref(null)
const members = ref([])
const placements = ref([])
const selectedMember = ref('')
const helperBusy = ref(false)
const helperError = ref('')
const helperMessage = ref('')
const helperDirty = ref(false)
const stageHost = ref(null)
const stageWidth = ref(900)
const scaledStage = computed(() => ({ width: stageWidth.value, height: stageWidth.value * 560 / 900, scaleX: stageWidth.value / 900, scaleY: stageWidth.value / 900 }))
const memberLabel = (id) => members.value.find(m => m.user_id === id)?.profiles?.display_name || 'Team member'
const availableMembers = computed(() => members.value.filter(m => !placements.value.some(p => p.user_id === m.user_id)))
const helperMarkers = computed(() => placements.value.map(p => ({ ...p, name: memberLabel(p.user_id), role: members.value.find(m => m.user_id === p.user_id)?.member_role || 'helper', radius: 20, fill: '#0f766e' })))
const mapVenue = computed(() => currentEvent.value?.venue)
const hasCoordinates = computed(() => mapVenue.value?.lat != null && mapVenue.value?.lng != null && Number.isFinite(Number(mapVenue.value.lat)) && Number.isFinite(Number(mapVenue.value.lng)))
let requestGeneration = 0
let resizeObserver
let resizeFrame = 0
async function load() {
    const token = ++requestGeneration
    loading.value = true
    loadError.value = ''
    isOrganiser.value = false
    planId.value = null
    floorObjects.value = []
    people.value = []
    placements.value = []
    members.value = []
    selectedMember.value = ''
    currentEvent.value = null
    saving.value = false
    helperBusy.value = false
    helperError.value = ''
    helperMessage.value = ''
    saveMessage.value = ''
    if (!USING_SUPABASE) { loading.value = false; return }
    try {
        const [plan, organiser, event] = await Promise.all([
            getFloorPlan(eventId.value),
            props.readOnly ? Promise.resolve(false) : canEditFloorPlan(eventId.value),
            getEvent(eventId.value),
        ])
        if (token !== requestGeneration) return
        isOrganiser.value = Boolean(organiser)
        currentEvent.value = event
        if (plan) {
            planId.value = plan.id
            floorObjects.value = Array.isArray(plan.layout?.objects) ? plan.layout.objects : []
            people.value = Array.isArray(plan.layout?.people) ? plan.layout.people : []
            nextBoxNumber.value = floorObjects.value.length + 1
            nextPersonNumber.value = people.value.length + 1
        }
        if (!props.readOnly) {
            const [team, spots] = await Promise.all([getPlanMembers(eventId.value), getHelperPlacements(eventId.value)])
            if (token !== requestGeneration) return
            members.value = team
            placements.value = spots.filter(spot => spot.floor_plan_id === plan?.id)
        }
    } catch (e) {
        if (token === requestGeneration) loadError.value = e.message || 'Could not load the floor plan.'
    } finally {
        if (token === requestGeneration) {
            await nextTick()
            if (token !== requestGeneration) return
            dirty.value = false
            helperDirty.value = false
            loading.value = false
            await nextTick()
            observeStage()
        }
    }
}
function observeStage() {
    resizeObserver?.disconnect()
    if (!stageHost.value) return
    resizeObserver = new ResizeObserver(([entry]) => {
        const width = Math.max(1, Math.min(900, entry.contentRect.width))
        cancelAnimationFrame(resizeFrame)
        resizeFrame = requestAnimationFrame(() => { if (Math.abs(stageWidth.value - width) > 0.5) stageWidth.value = width })
    })
    resizeObserver.observe(stageHost.value)
}
watch([eventId, () => props.readOnly], load, { immediate: true })
onUnmounted(() => { requestGeneration++; resizeObserver?.disconnect(); cancelAnimationFrame(resizeFrame) })
async function addHelper() {
    if (!canEdit.value || !planId.value || !selectedMember.value || helperBusy.value) return
    const token = requestGeneration
    helperBusy.value = true; helperError.value = ''
    try {
        const row = await saveHelperPlacement(eventId.value, { floor_plan_id: planId.value, user_id: selectedMember.value, x: 90, y: 90, label: memberLabel(selectedMember.value) })
        if (token === requestGeneration) { placements.value.push(row); selectedMember.value = '' }
    } catch (e) { if (token === requestGeneration) helperError.value = e.message }
    finally { if (token === requestGeneration) helperBusy.value = false }
}
function moveHelper(id, x, y) {
    if (!canEdit.value || helperBusy.value) return
    const row = placements.value.find(p => p.id === id)
    if (row) { Object.assign(row, clampPosition({ radius: 20 }, x, y)); helperDirty.value = true; helperMessage.value = '' }
}
async function saveHelpers() {
    if (!canEdit.value || helperBusy.value) return
    const token = requestGeneration, eid = eventId.value
    helperBusy.value = true; helperError.value = ''; helperMessage.value = ''
    try {
        for (const p of placements.value) {
            if (token !== requestGeneration) return
            await saveHelperPlacement(eid, { id: p.id, floor_plan_id: p.floor_plan_id, user_id: p.user_id, x: p.x, y: p.y, label: p.label })
        }
        if (token === requestGeneration) { helperDirty.value = false; helperMessage.value = 'Helper positions saved.' }
    } catch (e) { if (token === requestGeneration) helperError.value = `Some positions may have saved. Retry saving helper positions. ${e.message}` }
    finally { if (token === requestGeneration) helperBusy.value = false }
}
async function removeHelper(id) {
    if (!canEdit.value || helperBusy.value) return
    const token = requestGeneration
    helperBusy.value = true; helperError.value = ''
    try { await deleteHelperPlacement(eventId.value, id); if (token === requestGeneration) placements.value = placements.value.filter(p => p.id !== id) }
    catch (e) { if (token === requestGeneration) helperError.value = e.message }
    finally { if (token === requestGeneration) helperBusy.value = false }
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
    const token = requestGeneration
    const snapshot = JSON.stringify([floorObjects.value, people.value])
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
        if (token !== requestGeneration) return
        planId.value = row.id
        dirty.value = JSON.stringify([floorObjects.value, people.value]) !== snapshot
        saveMessage.value = dirty.value ? 'Saved earlier changes. New changes remain unsaved.' : 'Saved.'
    } catch (e) {
        if (token === requestGeneration) saveMessage.value = e.message || 'Could not save the floor plan.'
    } finally {
        if (token === requestGeneration) saving.value = false
    }
}

function removeItem(list, item) {
    if (!canEdit.value) return
    const index = list.indexOf(item)
    if (index >= 0) list.splice(index, 1)
}



function updatePosition(item, event) {
    if (!canEdit.value) return
    const position = clampPosition(item, event.target.x(), event.target.y())
    event.target.position(position)
    Object.assign(item, position)
}

function updateHelperPosition(person, event) {
    if (!canEdit.value || helperBusy.value) return
    const position = clampPosition({ radius: 20 }, event.target.x(), event.target.y())
    event.target.position(position)
    moveHelper(person.id, position.x, position.y)
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
        id: `box-${crypto.randomUUID()}`,
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
        id: `person-${crypto.randomUUID()}`,
        name: `Person ${personNumber}`,
        role: 'Helper',
        x: Math.min(position.x, floorBounds.x + floorBounds.width - radius),
        y: Math.min(position.y, floorBounds.y + floorBounds.height - radius - labelHeight),
        radius,
        fill: personColours[(people.value.length + personNumber) % personColours.length],
    })

    nextPersonNumber.value += 1
}

</script>

<template>
    <!-- Viewer mode renders nothing until a plan exists, so event pages without one stay clean -->
    <div v-if="!readOnly || (!loading && !loadError && planId)" :class="readOnly ? 'floor-plan-viewer' : 'container py-4 floor-editor'">
        <p v-if="!USING_SUPABASE" class="alert alert-info">Floor plans and programme editing require a configured live Supabase connection.</p>
        <template v-if="!readOnly && USING_SUPABASE">
            <RouterLink :to="`/organiser/events/${eventId}/manage`" class="small d-block mb-3">&larr; Manage event</RouterLink>
            <div class="floor-page-heading d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
                <div>
                    <span class="ticket-kicker">Event workspace</span><h1 class="h2 mb-1">Floor plan</h1>
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
        <h2 v-else-if="readOnly" class="h5 mb-2">Floor plan</h2>

        <div v-if="loading && !readOnly" class="py-5 text-center">
            <div class="spinner-border" role="status"><span class="visually-hidden">Loading floor plan…</span></div>
        </div>
        <div v-else-if="loadError" class="alert alert-danger" role="alert">{{ loadError }} <button class="btn btn-sm btn-outline-danger" @click="load">Retry floor plan</button></div>

        <template v-else-if="USING_SUPABASE">
        <dl v-if="!readOnly" class="floor-status-strip" aria-label="Floor plan summary">
            <div v-for="stat in planStats" :key="stat.label">
                <dt>{{ stat.label }}</dt>
                <dd>{{ stat.value }}</dd>
            </div>
        </dl>
        <div class="floor-editor-layout" :class="{ 'viewer-layout': readOnly }">
        <aside v-if="canEdit" class="floor-tools">
        <section v-if="!readOnly && currentEvent" class="venue-summary">
            <div class="panel-heading">
                <div>
                    <span class="panel-kicker">Active venue</span>
                    <h2 class="h5">{{ mapVenue?.name || 'Venue not set' }}</h2>
                </div>
                <span v-if="currentEvent.usingBackup" class="badge text-bg-info">Backup active</span>
            </div>
            <p class="venue-address">{{ mapVenue?.address || 'No venue address saved.' }}</p>
            <VenueMap v-if="hasCoordinates" :lat="Number(mapVenue.lat)" :lng="Number(mapVenue.lng)" />
            <p v-else class="text-muted small mb-0">No coordinates saved for this venue.</p>
        </section>
        <p v-if="canEdit && !floorObjects.length && !people.length" class="text-muted small">
            No floor plan yet. Add boxes for areas (stage, booths, entrance) and people for helper spots, drag them into place, then save.
        </p>

        <section v-if="canEdit" class="edit-panel">
            <div>
                <div class="edit-heading">
                    <div>
                        <span class="panel-kicker">Plan zones</span>
                        <h2 class="h6 mb-0">Boxes</h2>
                    </div>
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
                    <div>
                        <span class="panel-kicker">Free markers</span>
                        <h2 class="h6 mb-0">People</h2>
                    </div>
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
                            :aria-label="`Person name: ${person.name}`"
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

        <section v-if="canEdit || placements.length" class="helper-panel" aria-label="Team helper placements">
          <div class="panel-heading">
            <div>
              <span class="panel-kicker">Team-only</span>
              <h2 class="h6">Helper placements</h2>
            </div>
            <span class="status-pill">{{ placements.length }} placed</span>
          </div>
          <p class="small text-muted">Real event team members. These placements are visible to the event team only.</p>
          <p v-if="!planId" class="small">Save the floor plan before placing a helper.</p>
          <div v-if="canEdit" class="d-flex flex-wrap gap-2 mb-2">
            <label class="flex-grow-1">Team member<select aria-label="Team member" v-model="selectedMember" class="form-select" :disabled="helperBusy || !planId"><option value="">Choose a team member</option><option v-for="member in availableMembers" :key="member.user_id" :value="member.user_id">{{ member.profiles?.display_name || 'Team member' }} ({{ member.member_role }})</option></select></label>
            <button class="btn btn-outline-primary align-self-end" :disabled="helperBusy || !planId || !selectedMember" @click="addHelper">Add helper</button>
          </div>
          <div v-for="spot in placements" :key="spot.id" class="helper-row">
            <span class="helper-name">{{ memberLabel(spot.user_id) }}</span>
            <label>X<input :value="spot.x" type="number" min="40" max="860" class="form-control coordinate-input" :disabled="!canEdit || helperBusy" @change="moveHelper(spot.id, $event.target.value, spot.y)" /></label>
            <label>Y<input :value="spot.y" type="number" min="40" max="486" class="form-control coordinate-input" :disabled="!canEdit || helperBusy" @change="moveHelper(spot.id, spot.x, $event.target.value)" /></label>
            <button v-if="canEdit" class="btn btn-outline-danger" :disabled="helperBusy" @click="removeHelper(spot.id)">Remove helper {{ memberLabel(spot.user_id) }}</button>
          </div>
          <button v-if="canEdit" class="btn btn-primary" :disabled="helperBusy || !helperDirty" @click="saveHelpers">Save helper positions</button>
          <p v-if="helperMessage" role="status" class="text-success mt-2">{{ helperMessage }}</p>
          <p v-if="helperError" role="alert" class="text-danger mt-2">{{ helperError }}</p>
        </section>
        </aside>
        <section ref="stageHost" class="editor-shell" aria-label="Floor plan canvas">
            <div class="workspace-caption"><span class="panel-kicker">Layout canvas</span><h2 class="h5 mb-1">Canvas</h2><p class="small mb-0">Drag zones and people into place. Use the fields alongside the canvas for precise labels and coordinates.</p></div>
            <div class="stage-wrap">
                <v-stage :config="scaledStage">
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
                            draggable: canEdit && !saving && !helperBusy,
                            opacity: canEdit ? 1 : 0.75,
                            onDragend: (event) => updatePosition(item, event),
                        }"
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
                        v-for="person in [...people, ...helperMarkers]"
                        :key="person.id"
                        :config="{
                            x: person.x,
                            y: person.y,
                            draggable: canEdit && !saving && !helperBusy,
                            opacity: canEdit ? 1 : 0.75,
                            onDragend: (event) => person.user_id ? updateHelperPosition(person, event) : updatePosition(person, event),
                        }"
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
        </div>
        </template>
    </div>
    <div v-if="USING_SUPABASE && !loading && !loadError" :class="readOnly ? '' : 'container pb-4 floor-editor'">
      <ProgrammeFlow class="floor-aux-panel" :key="eventId" :event-id="eventId" :can-edit="canEdit" :plan-id="planId" :zones="dirty ? [] : floorObjects" />
      <FloorPlanImages class="floor-aux-panel" :key="eventId" :event-id="eventId" :can-edit="canEdit" :plan-id="planId" :published="currentEvent?.status === 'published'" />
    </div>
</template>

<style scoped>
.editor-shell {
    max-width: 100%;
    overflow: auto;
    padding: 0;
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

<style scoped>
.coordinate-input { width: 6rem; }
@media (max-width: 767.98px) { .edit-panel { grid-template-columns: 1fr; } .edit-grid { grid-template-columns: 1fr; } }
</style>

<style scoped>
.floor-editor,.floor-plan-viewer{--floor-ink:var(--bookedz-ink,#292d32);--floor-muted:var(--bookedz-muted,#63665e);--floor-paper:var(--bookedz-cream,#fff9ef);--floor-surface:var(--bookedz-surface,#fffdfa);--floor-coral:var(--bookedz-coral-dark,#aa3e2c);--floor-line:var(--bookedz-border,#e5ded2);color:var(--floor-ink)}
.floor-page-heading{padding:1rem 0 1.15rem;border-bottom:1px solid var(--floor-line)}
.floor-page-heading h1{font-family:var(--bookedz-heading,'Bricolage Grotesque',sans-serif);letter-spacing:-.035em;font-size:clamp(1.8rem,4vw,2.4rem)}
.floor-page-heading .btn-primary,.floor-editor .btn-primary{--bs-btn-bg:var(--floor-coral);--bs-btn-border-color:var(--floor-coral);--bs-btn-color:var(--bookedz-on-action,#fffdfa);--bs-btn-hover-bg:var(--bookedz-primary-hover,#8f3022);--bs-btn-hover-border-color:var(--bookedz-primary-hover,#8f3022);--bs-btn-hover-color:var(--bookedz-on-action,#fffdfa);border-radius:12px;min-height:42px}
.floor-editor .btn-outline-primary,.floor-plan-viewer .btn-outline-primary{--bs-btn-color:var(--floor-coral);--bs-btn-border-color:var(--floor-coral);--bs-btn-hover-bg:var(--floor-coral);--bs-btn-hover-border-color:var(--floor-coral);border-radius:10px}
.floor-status-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem;margin:0 0 1rem;padding:0}
.floor-status-strip div{padding:.8rem 1rem;border:1px solid var(--floor-line);border-radius:14px;background:var(--floor-surface);box-shadow:var(--bookedz-card-shadow,none)}
.floor-status-strip dt{margin:0;color:var(--floor-muted);font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.floor-status-strip dd{margin:0;color:var(--floor-ink);font-family:var(--bookedz-heading,'Bricolage Grotesque',sans-serif);font-size:1.35rem;font-weight:750;line-height:1.1}
.floor-editor-layout{display:grid;grid-template-columns:minmax(290px,370px) minmax(0,1fr);align-items:start;gap:1rem}
.floor-tools{display:grid;gap:1rem;min-width:0}
.venue-summary,.edit-panel,.helper-panel{padding:1rem;border:1px solid var(--floor-line);border-radius:18px;background:var(--floor-surface);box-shadow:var(--bookedz-card-shadow,none)}
.panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;margin-bottom:.65rem}
.panel-heading h2,.edit-panel h2{margin:0}
.panel-kicker{display:block;color:var(--floor-muted);font-size:.72rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}
.status-pill{display:inline-flex;align-items:center;min-height:30px;padding:.25rem .55rem;border:1px solid var(--floor-line);border-radius:999px;background:var(--floor-paper);color:var(--floor-muted);font-size:.78rem;font-weight:700;white-space:nowrap}
.venue-summary h2,.edit-panel h2,.helper-panel h2{font-family:var(--bookedz-heading,'Bricolage Grotesque',sans-serif);font-weight:700;letter-spacing:-.02em}
.venue-summary p{overflow-wrap:anywhere}.venue-address{color:var(--floor-muted);font-size:.92rem}.venue-summary :deep(.venue-map){border-radius:12px;overflow:hidden}
.edit-panel{display:grid;grid-template-columns:1fr;gap:1rem;padding:1rem}
.edit-grid{grid-template-columns:1fr;gap:.55rem}.people-grid{grid-template-columns:1fr}.edit-heading{margin-bottom:.65rem}.edit-heading .btn{min-height:38px}
.edit-field,.person-edit-row{padding:.35rem;border-radius:10px;background:var(--floor-paper)}
.edit-field .form-control,.person-edit-row .form-control,.person-edit-row .form-select,.helper-panel .form-control,.helper-panel .form-select{min-height:40px;border-color:var(--floor-line);border-radius:9px}
.helper-panel{padding:1rem}.helper-panel>div:not(.panel-heading){padding:.55rem 0;border-top:1px solid var(--floor-line)}.helper-panel label{font-size:.86rem;font-weight:600}.helper-panel .coordinate-input{width:5.3rem}.helper-panel button{min-height:40px;border-radius:10px}
.helper-row{display:grid;grid-template-columns:minmax(8rem,1fr) auto auto;align-items:end;gap:.5rem}
.helper-row .btn{grid-column:1/-1;justify-self:start}.helper-name{align-self:center;font-weight:700;overflow-wrap:anywhere}
.editor-shell{min-width:0;overflow:auto;padding:1rem;border:1px solid var(--floor-line);border-radius:22px;background:var(--floor-paper)}
.workspace-caption{padding:.2rem .25rem 1rem}.workspace-caption h2{font-family:var(--bookedz-heading,'Bricolage Grotesque',sans-serif);font-weight:700}.workspace-caption p{color:var(--floor-muted);max-width:60ch}
.stage-wrap{width:100%;background:var(--floor-surface);border:1px solid var(--floor-line);border-radius:14px;overflow:hidden}.stage-wrap :deep(.konvajs-content){max-width:100%}.stage-wrap :deep(canvas){max-width:100%;height:auto!important;display:block}
.floor-aux-panel{display:block;padding:1.1rem 1.25rem;margin-top:1rem!important;border:1px solid var(--floor-line);border-radius:18px;background:var(--floor-surface)}
.floor-aux-panel :deep(.border.rounded),.floor-aux-panel :deep(.list-group-item){border-color:var(--floor-line)!important}.floor-aux-panel :deep(.form-control),.floor-aux-panel :deep(.form-select){border-color:var(--floor-line);border-radius:10px;min-height:42px}.floor-aux-panel :deep(.btn){border-radius:10px;min-height:38px}.floor-aux-panel :deep(.btn-primary){--bs-btn-bg:var(--floor-coral);--bs-btn-border-color:var(--floor-coral);--bs-btn-hover-bg:var(--bookedz-primary-hover,#8f3022);--bs-btn-hover-border-color:var(--bookedz-primary-hover,#8f3022)}.floor-aux-panel :deep(.btn-outline-primary){--bs-btn-color:var(--floor-coral);--bs-btn-border-color:var(--floor-coral);--bs-btn-hover-bg:var(--floor-coral);--bs-btn-hover-border-color:var(--floor-coral)}.floor-aux-panel :deep(img){border-radius:12px!important}
.floor-plan-viewer{color:var(--floor-ink)}.floor-plan-viewer .floor-editor-layout{display:block}.floor-plan-viewer .editor-shell{background:var(--floor-paper)}
.floor-editor :focus-visible,.floor-plan-viewer :focus-visible{outline:3px solid rgba(170,62,44,.55);outline-offset:2px}
@media(max-width:991.98px){.floor-editor-layout{grid-template-columns:1fr}.floor-tools{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}.venue-summary{grid-column:1/-1}.edit-panel{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:575.98px){.floor-editor{padding-inline:1rem}.floor-status-strip{grid-template-columns:1fr}.floor-tools{grid-template-columns:1fr}.edit-panel{grid-template-columns:1fr}.editor-shell{padding:.6rem;border-radius:16px}.helper-panel{overflow-wrap:anywhere}.helper-row{grid-template-columns:1fr 1fr}.helper-name{grid-column:1/-1}.floor-page-heading{align-items:flex-start!important}.floor-page-heading>div:last-child{width:100%;justify-content:space-between}}
</style>
