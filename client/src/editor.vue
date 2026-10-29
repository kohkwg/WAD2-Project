<script setup>
// Feature 6 (Vivienne): floor plan editor + read-only viewer for one event.
// Organisers drag boxes (zones) and labelled people markers, then Save; the layout
// is stored in public.floor_plans (see utils/floorPlan.js). Everyone else, and the
// public event page (read-only prop), sees the saved plan without editing controls.
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { canEditFloorPlan, getFloorPlans, saveFloorPlan, getPlanMembers, getHelperPlacements, saveHelperPlacement, deleteHelperPlacement, uploadPlanBackground, deleteFloorAsset } from '@/utils/floorPlan'
import { USING_SUPABASE, getEvent } from '@/utils/api'
import { clampPosition, backgroundUrl, fitRotated, clampOpacity, clampRotation, clampScale, validateFloorImage } from '@/utils/floorPlanModel'
import ProgrammeFlow from '@/components/floor-plan/ProgrammeFlow.vue'

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
const plans = ref([])
const activePlanIndex = ref(0)
const planName = ref('Plan 1')
const savedPlan = ref(null)
const saving = ref(false)
const saveMessage = ref('') // 'Saved.' or an error
const planSwitchMessage = ref('')
const dirty = ref(false)

// Real roles: only the event's organisers edit (RLS enforces it on save too)
const canEdit = computed(() => !props.readOnly && isOrganiser.value)
const canvasLocked = ref(false)
const layoutEditable = computed(() => canEdit.value && !canvasLocked.value)

// Plan background image: { assetId, key, name, opacity }, saved in the layout so
// participants see it too. The picture itself is a file in R2 (public bucket).
const background = ref(null)
const bgImage = shallowRef(null)
const bgError = ref('')
const bgBusy = ref(false)
const retiredAssetIds = ref([]) // replaced/removed backgrounds, deleted once the plan is saved
const unsavedAssetIds = ref([]) // uploaded this session, deleted if the plan is reverted
const bgUrl = computed(() => backgroundUrl(import.meta.env.VITE_R2_PUBLIC_URL, eventId.value, background.value?.key))
let bgToken = 0
watch(() => [background.value?.key, bgUrl.value], () => {
    const url = bgUrl.value
    const token = ++bgToken
    bgImage.value = null
    bgError.value = ''
    if (!background.value) return
    if (!url) {
        bgError.value = import.meta.env.VITE_R2_PUBLIC_URL
            ? 'The background image address is not valid.'
            : 'Add VITE_R2_PUBLIC_URL to client/.env and restart the dev server to show the background.'
        return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => { if (token === bgToken) bgImage.value = image }
    image.onerror = () => { if (token === bgToken) bgError.value = 'The background image could not be loaded.' }
    image.src = url
}, { immediate: true })
const bgRect = computed(() => bgImage.value
    ? fitRotated(bgImage.value.naturalWidth, bgImage.value.naturalHeight, floorBounds, background.value?.rotation, background.value?.scale)
    : null)

const editorStatus = computed(() => {
    if (canEdit.value) return dirty.value || helperDirty.value ? 'Unsaved changes' : 'All changes saved'
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
const boxColourPresets = [
    '#27ae60', '#9b51e0', '#0891b2', '#2f80ed',
    '#f2994a', '#eb5757', '#be123c', '#7c3aed',
    '#0f766e', '#a16207', '#111827', '#6b7280',
]
const personColours = ['#111827', '#0f766e', '#7c3aed', '#be123c', '#1d4ed8', '#a16207']
const boxSizePresets = [
    { label: 'Booth', width: 100, height: 60 },
    { label: 'Standard', width: 130, height: 70 },
    { label: 'Wide', width: 210, height: 70 },
    { label: 'Tall', width: 120, height: 130 },
    { label: 'Large', width: 220, height: 120 },
]
const nextBoxNumber = ref(1)
const nextPersonNumber = ref(1)

// New plans start empty; organisers add boxes (zones) and labelled people markers
const floorObjects = ref([])
const people = ref([])

const currentEvent = ref(null)
const members = ref([])
const allPlacements = ref([])
const placements = ref([])
const selectedMember = ref('')
const helperBusy = ref(false)
const helperError = ref('')
const helperMessage = ref('')
const helperDirty = ref(false)
const venueDraft = ref({ name: '', address: '' })
const activeBoxColourId = ref(null)

// Canva-style resizing: click a box to get handles on its corners and edges.
const selectedBoxId = ref(null)
const stageRef = ref(null)
const transformerRef = ref(null)
const selectedBox = computed(() => floorObjects.value.find(item => item.id === selectedBoxId.value) || null)
const MIN_BOX_WIDTH = 60
const MIN_BOX_HEIGHT = 40
const transformerConfig = {
    rotateEnabled: false,
    keepRatio: false,
    ignoreStroke: true,
    anchorSize: 12,
    anchorCornerRadius: 3,
    anchorFill: '#ffffff',
    anchorStroke: '#aa3e2c',
    borderStroke: '#aa3e2c',
    // Keep the box at least minimum size and inside the floor area (in screen units)
    boundBoxFunc(oldBox, newBox) {
        const scale = stageWidth.value / 900
        const tolerance = 0.5
        if (newBox.width < MIN_BOX_WIDTH * scale || newBox.height < MIN_BOX_HEIGHT * scale) return oldBox
        if (newBox.x < floorBounds.x * scale - tolerance || newBox.y < floorBounds.y * scale - tolerance
            || newBox.x + newBox.width > (floorBounds.x + floorBounds.width) * scale + tolerance
            || newBox.y + newBox.height > (floorBounds.y + floorBounds.height) * scale + tolerance) return oldBox
        return newBox
    },
}
const stageHost = ref(null)
const stageWidth = ref(900)
const scaledStage = computed(() => ({ width: stageWidth.value, height: stageWidth.value * 560 / 900, scaleX: stageWidth.value / 900, scaleY: stageWidth.value / 900 }))
const memberLabel = (id) => members.value.find(m => m.user_id === id)?.profiles?.display_name || 'Team member'
const availableMembers = computed(() => members.value.filter(m => !placements.value.some(p => p.user_id === m.user_id)))
const helperMarkers = computed(() => placements.value.map(p => ({ ...p, name: memberLabel(p.user_id), role: members.value.find(m => m.user_id === p.user_id)?.member_role || 'helper', radius: 20, fill: '#0f766e' })))
const defaultPlanName = index => `Plan ${index + 1}`
const clone = value => JSON.parse(JSON.stringify(value))
function draftPlan(index, event = currentEvent.value) {
    const name = defaultPlanName(index)
    return {
        id: null,
        name,
        width: stageConfig.width,
        height: stageConfig.height,
        layout: {
            version: 1,
            objects: [],
            people: [],
            locked: false,
            background: null,
            venue: { name, address: event?.venue?.address || '' },
        },
    }
}
function snapshotCurrentPlan() {
    return {
        id: planId.value,
        name: planName.value,
        width: stageConfig.width,
        height: stageConfig.height,
        layout: {
            version: 1,
            objects: clone(floorObjects.value),
            people: clone(people.value),
            locked: canvasLocked.value,
            background: background.value ? { ...background.value } : null,
            venue: { name: planName.value, address: venueDraft.value.address },
        },
    }
}
function applyPlan(plan, index, markClean = true) {
    const source = plan || draftPlan(index)
    activePlanIndex.value = index
    planId.value = source.id || null
    planName.value = source.name || defaultPlanName(index)
    const layout = source.layout || {}
    floorObjects.value = Array.isArray(layout.objects) ? clone(layout.objects) : []
    people.value = Array.isArray(layout.people) ? clone(layout.people) : []
    venueDraft.value = {
        name: planName.value,
        address: layout.venue?.address || currentEvent.value?.venue?.address || '',
    }
    canvasLocked.value = Boolean(layout.locked)
    background.value = layout.background?.key ? { assetId: layout.background.assetId || null, key: layout.background.key, name: layout.background.name || '', opacity: clampOpacity(layout.background.opacity), rotation: clampRotation(layout.background.rotation), scale: clampScale(layout.background.scale) } : null
    retiredAssetIds.value = []
    unsavedAssetIds.value = []
    bgBusy.value = false
    placements.value = source.id ? clone(allPlacements.value.filter(spot => spot.floor_plan_id === source.id)) : []
    selectedMember.value = ''
    helperMessage.value = ''
    helperError.value = ''
    activeBoxColourId.value = null
    selectedBoxId.value = null
    nextBoxNumber.value = floorObjects.value.length + 1
    nextPersonNumber.value = people.value.length + 1
    savedPlan.value = clone(source)
    if (markClean) {
        requestAnimationFrame(() => {
            dirty.value = false
            helperDirty.value = false
        })
    }
}
function canLeavePlan() {
    if (!dirty.value && !helperDirty.value) {
        planSwitchMessage.value = ''
        return true
    }
    planSwitchMessage.value = 'Save or revert this floor plan before switching tabs.'
    return false
}
function switchPlan(index) {
    if (index === activePlanIndex.value) return
    if (!canLeavePlan()) return
    applyPlan(plans.value[index], index)
}
function addPlan() {
    if (!canEdit.value || !canLeavePlan()) return
    const next = draftPlan(plans.value.length)
    plans.value.push(next)
    applyPlan(next, plans.value.length - 1, false)
    dirty.value = true
}
function revertPlan() {
    discardUnsavedBackgrounds()
    if (!planId.value && plans.value.length > 1) {
        const nextIndex = Math.max(0, activePlanIndex.value - 1)
        plans.value.splice(activePlanIndex.value, 1)
        applyPlan(plans.value[nextIndex], nextIndex)
        planSwitchMessage.value = ''
        saveMessage.value = ''
        return
    }
    if (savedPlan.value) applyPlan(savedPlan.value, activePlanIndex.value)
    planSwitchMessage.value = ''
    saveMessage.value = ''
}
let requestGeneration = 0
let resizeObserver
let resizeFrame = 0
async function load() {
    const token = ++requestGeneration
    loading.value = true
    loadError.value = ''
    isOrganiser.value = false
    planId.value = null
    plans.value = []
    activePlanIndex.value = 0
    planName.value = 'Plan 1'
    savedPlan.value = null
    floorObjects.value = []
    people.value = []
    allPlacements.value = []
    placements.value = []
    members.value = []
    selectedMember.value = ''
    currentEvent.value = null
    venueDraft.value = { name: '', address: '' }
    canvasLocked.value = false
    background.value = null
    retiredAssetIds.value = []
    unsavedAssetIds.value = []
    saving.value = false
    helperBusy.value = false
    helperError.value = ''
    helperMessage.value = ''
    saveMessage.value = ''
    planSwitchMessage.value = ''
    activeBoxColourId.value = null
    if (!USING_SUPABASE) { loading.value = false; return }
    try {
        const [loadedPlans, organiser, event] = await Promise.all([
            getFloorPlans(eventId.value),
            props.readOnly ? Promise.resolve(false) : canEditFloorPlan(eventId.value),
            getEvent(eventId.value),
        ])
        if (token !== requestGeneration) return
        isOrganiser.value = Boolean(organiser)
        currentEvent.value = event
        plans.value = loadedPlans.length ? loadedPlans.map((plan, index) => ({ ...plan, name: plan.name || defaultPlanName(index) })) : [draftPlan(0, event)]
        if (!props.readOnly) {
            const [team, spots] = await Promise.all([getPlanMembers(eventId.value), getHelperPlacements(eventId.value)])
            if (token !== requestGeneration) return
            members.value = team
            allPlacements.value = spots
        }
        applyPlan(plans.value[0], 0)
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
watch(planName, (name) => {
    if (plans.value[activePlanIndex.value]) plans.value[activePlanIndex.value] = { ...plans.value[activePlanIndex.value], name }
    venueDraft.value = { ...venueDraft.value, name }
})
onUnmounted(() => { requestGeneration++; resizeObserver?.disconnect(); cancelAnimationFrame(resizeFrame) })
async function addHelper() {
    if (!layoutEditable.value || !planId.value || !selectedMember.value || helperBusy.value) return
    const token = requestGeneration
    helperBusy.value = true; helperError.value = ''
    try {
        const row = await saveHelperPlacement(eventId.value, { floor_plan_id: planId.value, user_id: selectedMember.value, x: 90, y: 90, label: memberLabel(selectedMember.value) })
        if (token === requestGeneration) {
            placements.value.push(row)
            allPlacements.value.push(row)
            selectedMember.value = ''
        }
    } catch (e) { if (token === requestGeneration) helperError.value = e.message }
    finally { if (token === requestGeneration) helperBusy.value = false }
}
function moveHelper(id, x, y) {
    if (!layoutEditable.value || helperBusy.value) return
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
            const row = await saveHelperPlacement(eid, { id: p.id, floor_plan_id: p.floor_plan_id, user_id: p.user_id, x: p.x, y: p.y, label: p.label })
            allPlacements.value = allPlacements.value.map(spot => spot.id === row.id ? row : spot)
            placements.value = placements.value.map(spot => spot.id === row.id ? row : spot)
        }
        if (token === requestGeneration) { helperDirty.value = false; helperMessage.value = 'Helper positions saved.' }
    } catch (e) { if (token === requestGeneration) helperError.value = `Some positions may have saved. Retry saving helper positions. ${e.message}` }
    finally { if (token === requestGeneration) helperBusy.value = false }
}
async function removeHelper(id) {
    if (!layoutEditable.value || helperBusy.value) return
    const token = requestGeneration
    helperBusy.value = true; helperError.value = ''
    try {
        await deleteHelperPlacement(eventId.value, id)
        if (token === requestGeneration) {
            placements.value = placements.value.filter(p => p.id !== id)
            allPlacements.value = allPlacements.value.filter(p => p.id !== id)
        }
    }
    catch (e) { if (token === requestGeneration) helperError.value = e.message }
    finally { if (token === requestGeneration) helperBusy.value = false }
}

// Any edit after loading (move, add, rename, remove) marks the plan unsaved
watch([floorObjects, people, venueDraft, canvasLocked, planName, background], () => {
    if (!loading.value) {
        dirty.value = true
        saveMessage.value = ''
    }
}, { deep: true })

async function save() {
    if (!canEdit.value || saving.value) return
    const token = requestGeneration
    const snapshot = JSON.stringify([planName.value, floorObjects.value, people.value, venueDraft.value, canvasLocked.value, background.value])
    saving.value = true
    saveMessage.value = ''
    try {
        const row = await saveFloorPlan(eventId.value, {
            id: planId.value,
            name: planName.value,
            width: stageConfig.width,
            height: stageConfig.height,
            objects: floorObjects.value,
            people: people.value,
            venue: { name: planName.value, address: venueDraft.value.address },
            locked: canvasLocked.value,
            background: background.value,
        })
        if (token !== requestGeneration) return
        planId.value = row.id
        planName.value = row.name || planName.value
        plans.value[activePlanIndex.value] = row
        savedPlan.value = clone(row)
        cleanUpBackgroundAssets()
        dirty.value = JSON.stringify([planName.value, floorObjects.value, people.value, venueDraft.value, canvasLocked.value, background.value]) !== snapshot
        saveMessage.value = dirty.value ? 'Saved earlier changes. New changes remain unsaved.' : 'Saved.'
    } catch (e) {
        if (token === requestGeneration) saveMessage.value = e.message || 'Could not save the floor plan.'
    } finally {
        if (token === requestGeneration) saving.value = false
    }
}

// Backgrounds: upload needs a saved plan (the file is filed under it). Replaced or
// removed files are only deleted once the plan is saved, so Revert restores them.
const bgInput = ref(null)
async function onBackgroundPicked(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !layoutEditable.value || !planId.value || bgBusy.value) return
    const token = requestGeneration
    const pid = planId.value
    bgError.value = ''
    try {
        validateFloorImage(file)
        bgBusy.value = true
        const uploaded = await uploadPlanBackground(eventId.value, pid, file)
        if (token !== requestGeneration || pid !== planId.value) {
            deleteFloorAsset(eventId.value, uploaded.assetId).catch(() => {})
            return
        }
        const previous = background.value?.assetId
        if (previous) {
            if (unsavedAssetIds.value.includes(previous)) deleteFloorAsset(eventId.value, previous).catch(() => {})
            else retiredAssetIds.value = [...retiredAssetIds.value, previous]
            unsavedAssetIds.value = unsavedAssetIds.value.filter(id => id !== previous)
        }
        unsavedAssetIds.value = [...unsavedAssetIds.value, uploaded.assetId]
        background.value = { ...uploaded, opacity: background.value?.opacity ?? 1, rotation: background.value?.rotation ?? 0, scale: background.value?.scale ?? 1 }
    } catch (e) {
        if (token === requestGeneration) bgError.value = e.message || 'Could not upload the background.'
    } finally {
        if (token === requestGeneration) bgBusy.value = false
    }
}
function removeBackground() {
    if (!layoutEditable.value || !background.value) return
    const id = background.value.assetId
    if (id) {
        if (unsavedAssetIds.value.includes(id)) deleteFloorAsset(eventId.value, id).catch(() => {})
        else retiredAssetIds.value = [...retiredAssetIds.value, id]
        unsavedAssetIds.value = unsavedAssetIds.value.filter(x => x !== id)
    }
    background.value = null
}
function setBackgroundOpacity(value) {
    if (background.value) background.value = { ...background.value, opacity: clampOpacity(value) }
}
function setBackgroundRotation(value) {
    if (background.value) background.value = { ...background.value, rotation: clampRotation(value) }
}
function setBackgroundScale(value) {
    if (background.value) background.value = { ...background.value, scale: clampScale(value) }
}
function cleanUpBackgroundAssets() {
    const keep = background.value?.assetId
    retiredAssetIds.value.filter(id => id !== keep).forEach(id => deleteFloorAsset(eventId.value, id).catch(() => {}))
    retiredAssetIds.value = []
    unsavedAssetIds.value = []
}
function discardUnsavedBackgrounds() {
    unsavedAssetIds.value.forEach(id => deleteFloorAsset(eventId.value, id).catch(() => {}))
    unsavedAssetIds.value = []
}

function removeItem(list, item) {
    if (!layoutEditable.value) return
    const index = list.indexOf(item)
    if (index >= 0) list.splice(index, 1)
    if (activeBoxColourId.value === item.id) activeBoxColourId.value = null
}

function applyBoxColour(item, colour) {
    if (!layoutEditable.value) return
    item.fill = colour
}

function selectBox(item) {
    if (layoutEditable.value) selectedBoxId.value = item.id
}
function deselectBox(event) {
    const target = event.target
    if (target.findAncestor('Transformer', true) || target.findAncestor('.box-group', true)) return
    selectedBoxId.value = null
}
// The transformer scales the group; turn that scale into a real width/height.
function onBoxTransform(item, event) {
    if (!layoutEditable.value) return
    const node = event.target
    const width = Math.min(Math.max(Math.round(item.width * node.scaleX()), MIN_BOX_WIDTH), floorBounds.width)
    const height = Math.min(Math.max(Math.round(item.height * node.scaleY()), MIN_BOX_HEIGHT), floorBounds.height)
    node.scale({ x: 1, y: 1 })
    node.findOne('Rect')?.size({ width, height })
    const label = node.findOne('Text')
    label?.setAttrs({ width: width - 16, y: height / 2 - 8 })
    item.width = width
    item.height = height
    item.sizeMode = 'Custom'
    const position = clampPosition(item, node.x(), node.y())
    node.position(position)
    Object.assign(item, position)
}
function syncTransformer() {
    const transformer = transformerRef.value?.getNode?.()
    const stage = stageRef.value?.getNode?.()
    if (!transformer || !stage) return
    const node = selectedBox.value && layoutEditable.value ? stage.findOne(`#box-${selectedBox.value.id}`) : null
    transformer.nodes(node ? [node] : [])
    transformer.forceUpdate()
    transformer.getLayer()?.batchDraw()
}
watch([selectedBoxId, layoutEditable, loading, () => floorObjects.value.length, () => selectedBox.value?.width, () => selectedBox.value?.height, () => selectedBox.value?.x, () => selectedBox.value?.y],
    () => { if (selectedBoxId.value && !selectedBox.value) selectedBoxId.value = null; syncTransformer() },
    { flush: 'post' })

function updatePosition(item, event) {
    if (!layoutEditable.value) return
    const position = clampPosition(item, event.target.x(), event.target.y())
    event.target.position(position)
    Object.assign(item, position)
}

function resizeBox(item, width, height) {
    if (!layoutEditable.value) return
    const nextWidth = Math.min(Math.max(Number(width) || item.width || 130, 60), floorBounds.width)
    const nextHeight = Math.min(Math.max(Number(height) || item.height || 70, 40), floorBounds.height)
    item.width = nextWidth
    item.height = nextHeight
    item.sizeMode = 'Custom'
    Object.assign(item, clampPosition(item, item.x, item.y))
}

function boxSizeLabel(item) {
    if (item.sizeMode === 'Custom') return 'Custom'
    return boxSizePresets.find(preset => preset.width === item.width && preset.height === item.height)?.label || 'Custom'
}

function applyBoxSize(item, label) {
    if (label === 'Custom') {
        item.sizeMode = 'Custom'
        return
    }
    const preset = boxSizePresets.find(option => option.label === label)
    if (!preset || !layoutEditable.value) return
    item.width = preset.width
    item.height = preset.height
    delete item.sizeMode
    Object.assign(item, clampPosition(item, item.x, item.y))
}

function updateHelperPosition(person, event) {
    if (!layoutEditable.value || helperBusy.value) return
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
    if (!layoutEditable.value) return

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
    if (!layoutEditable.value) return

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
    <div v-if="!readOnly || (!loading && !loadError && planId)"
        :class="readOnly ? 'floor-plan-viewer' : 'container py-4 floor-editor'">
        <p v-if="!USING_SUPABASE" class="alert alert-info">Floor plans and programme editing require a configured live
            Supabase connection.</p>
        <template v-if="!readOnly && USING_SUPABASE">
            <RouterLink :to="`/organiser/events/${eventId}/manage`" class="small d-block mb-3">&larr; Manage event
            </RouterLink>
            <div class="floor-page-heading d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
                <div>
                    <span class="ticket-kicker">Event workspace</span>
                    <div class="floor-title-row">
                        <h1 class="h2 mb-1">Floor plan</h1>
                        <button v-if="canEdit" class="btn btn-sm add-plan-button" type="button"
                            aria-label="Add another floor plan" :disabled="dirty || helperDirty" @click="addPlan">+</button>
                    </div>
                    <p class="text-muted mb-0" role="status">{{ loading ? 'Loading…' : editorStatus }}</p>
                </div>

                <div v-if="canEdit" class="d-flex align-items-center gap-2">
                    <span v-if="saveMessage" class="small"
                        :class="saveMessage === 'Saved.' ? 'text-success' : 'text-danger'" role="status">{{ saveMessage
                        }}</span>
                    <button class="btn btn-outline-secondary" type="button" :disabled="saving || (!dirty && !helperDirty)"
                        @click="revertPlan">
                        Revert
                    </button>
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
        <div v-else-if="loadError" class="alert alert-danger" role="alert">{{ loadError }} <button
                class="btn btn-sm btn-outline-danger" @click="load">Retry floor plan</button></div>

        <template v-else-if="USING_SUPABASE">
            <div v-if="canEdit || plans.length > 1" class="floor-plan-switcher" aria-label="Floor plan tabs">
                <div class="floor-plan-tabs" role="tablist" aria-label="Floor plans for this event">
                    <button v-for="(plan, index) in plans" :key="plan.id || `draft-${index}`" class="floor-plan-tab"
                        type="button" role="tab" :aria-selected="index === activePlanIndex"
                        :class="{ active: index === activePlanIndex }" @click="switchPlan(index)">
                        {{ plan.name || defaultPlanName(index) }}
                    </button>
                    <button v-if="canEdit" class="floor-plan-tab floor-plan-tab--add" type="button"
                        :disabled="dirty || helperDirty" aria-label="Add another floor plan" @click="addPlan">+</button>
                </div>
                <div v-if="canEdit" class="plan-meta-grid">
                    <label class="plan-name-field">Plan / venue name
                        <input v-model="planName" class="form-control" maxlength="80" :disabled="!canEdit"
                            placeholder="Plan name">
                    </label>
                    <label class="plan-name-field plan-address-field">Address
                        <textarea v-model="venueDraft.address" class="form-control" maxlength="360" rows="2"
                            :disabled="!canEdit" placeholder="Venue address"></textarea>
                    </label>
                </div>
                <p v-if="planSwitchMessage" class="small text-danger mb-0" role="alert">{{ planSwitchMessage }}</p>
            </div>
            <div class="floor-editor-layout" :class="{ 'viewer-layout': readOnly }">
                <aside v-if="canEdit" class="floor-tools">
                    <p v-if="canEdit && !floorObjects.length && !people.length" class="text-muted small">
                        No floor plan yet. Add boxes for areas (stage, booths, entrance) and people for helper spots,
                        drag them into place, then save.
                    </p>

                    <section v-if="canEdit" class="edit-panel">
                        <div>
                            <div class="edit-heading">
                                <div>
                                    <span class="panel-kicker">Plan zones</span>
                                    <h2 class="h6 mb-0">Boxes</h2>
                                </div>
                                <button class="btn btn-sm btn-outline-primary" type="button" :disabled="!layoutEditable"
                                    @click="addBox">
                                    Add box
                                </button>
                            </div>

                            <div class="edit-grid item-scroll-list box-scroll-list"
                                :class="{ 'is-scrollable': floorObjects.length > 2 }">
                                <div v-for="item in floorObjects" :key="item.id" class="edit-field edit-field--box">
                                    <button class="colour-dot colour-dot-button" type="button"
                                        :style="{ backgroundColor: item.fill }"
                                        :aria-label="`Choose colour for ${item.label}`"
                                        :aria-expanded="activeBoxColourId === item.id"
                                        :disabled="!layoutEditable"
                                        @click="activeBoxColourId = activeBoxColourId === item.id ? null : item.id"></button>
                                    <input v-model="item.label" class="form-control form-control-sm box-name-input" maxlength="24"
                                        :aria-label="`Box name: ${item.label}`" :disabled="!layoutEditable">
                                    <div class="box-size-tools">
                                        <select class="form-select form-select-sm box-size-chip" :value="boxSizeLabel(item)"
                                            :aria-label="`Size preset for ${item.label}`" :disabled="!layoutEditable"
                                            @change="applyBoxSize(item, $event.target.value)">
                                            <option v-for="preset in boxSizePresets" :key="preset.label"
                                                :value="preset.label">{{ preset.label }}</option>
                                            <option value="Custom">Custom</option>
                                        </select>
                                        <div v-if="boxSizeLabel(item) === 'Custom'" class="box-dimension-chip">
                                            <input :value="item.width" type="number" min="60" :max="floorBounds.width"
                                                class="form-control form-control-sm dimension-input"
                                                :aria-label="`Width for ${item.label}`" :disabled="!layoutEditable"
                                                @change="resizeBox(item, $event.target.value, item.height)">
                                            <span aria-hidden="true">&times;</span>
                                            <input :value="item.height" type="number" min="40" :max="floorBounds.height"
                                                class="form-control form-control-sm dimension-input"
                                                :aria-label="`Height for ${item.label}`" :disabled="!layoutEditable"
                                                @change="resizeBox(item, item.width, $event.target.value)">
                                        </div>
                                        <span v-else class="box-dim-readout">{{ item.width }}&times;{{ item.height }}</span>
                                    </div>
                                    <div v-if="activeBoxColourId === item.id" class="box-colour-picker"
                                        :aria-label="`Colour options for ${item.label}`">
                                        <button v-for="colour in boxColourPresets" :key="colour" class="box-colour-swatch"
                                            type="button" :style="{ backgroundColor: colour }"
                                            :class="{ active: item.fill === colour }"
                                            :aria-label="`Use ${colour} for ${item.label}`"
                                            :disabled="!layoutEditable"
                                            @click="applyBoxColour(item, colour)"></button>
                                        <label class="box-custom-colour">Custom
                                            <input v-model="item.fill" type="color" :disabled="!layoutEditable"
                                                :aria-label="`Custom colour for ${item.label}`">
                                        </label>
                                    </div>
                                    <button class="btn btn-sm btn-outline-danger" type="button"
                                        :aria-label="`Remove ${item.label}`"
                                        :disabled="!layoutEditable"
                                        @click.prevent="removeItem(floorObjects, item)">&times;</button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div class="edit-heading">
                                <div>
                                    <span class="panel-kicker">Free markers</span>
                                    <h2 class="h6 mb-0">People</h2>
                                </div>
                                <button class="btn btn-sm btn-outline-primary" type="button" :disabled="!layoutEditable"
                                    @click="addPerson">
                                    Add person
                                </button>
                            </div>

                            <div class="edit-grid people-grid item-scroll-list person-scroll-list"
                                :class="{ 'is-scrollable': people.length > 2 }">
                                <div v-for="person in people" :key="person.id" class="person-edit-row">
                                    <span class="colour-dot" :style="{ backgroundColor: person.fill }"></span>
                                    <input :aria-label="`Person name: ${person.name}`" v-model="person.name"
                                        class="form-control form-control-sm" maxlength="18" :disabled="!layoutEditable">
                                    <select v-model="person.role" class="form-select form-select-sm"
                                        :aria-label="`Role for ${person.name}`" :disabled="!layoutEditable">
                                        <option>Organiser</option>
                                        <option>Helper</option>
                                    </select>
                                    <button class="btn btn-sm btn-outline-danger" type="button"
                                        :aria-label="`Remove ${person.name}`"
                                        :disabled="!layoutEditable"
                                        @click="removeItem(people, person)">&times;</button>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section v-if="canEdit || placements.length" class="helper-panel"
                        aria-label="Team helper placements">
                        <div class="panel-heading">
                            <div>
                                <span class="panel-kicker">Team-only</span>
                                <h2 class="h6">Helper placements</h2>
                            </div>
                            <span class="status-pill">{{ placements.length }} placed</span>
                        </div>
                        <p class="small text-muted">Real event team members. These placements are visible to the event
                            team only.</p>
                        <p v-if="!planId" class="small">Save the floor plan before placing a helper.</p>
                        <div v-if="canEdit" class="d-flex flex-wrap gap-2 mb-2">
                            <label class="flex-grow-1">Team member<select aria-label="Team member"
                                    v-model="selectedMember" class="form-select" :disabled="helperBusy || !planId || canvasLocked">
                                    <option value="">Choose a team member</option>
                                    <option v-for="member in availableMembers" :key="member.user_id"
                                        :value="member.user_id">{{ member.profiles?.display_name || 'Team member' }} ({{
                                        member.member_role }})</option>
                                </select></label>
                            <button class="btn btn-outline-primary align-self-end"
                                :disabled="helperBusy || !planId || !selectedMember || canvasLocked" @click="addHelper">Add
                                helper</button>
                        </div>
                        <div v-for="spot in placements" :key="spot.id" class="helper-row">
                            <span class="helper-name">{{ memberLabel(spot.user_id) }}</span>
                            <label>X<input :value="spot.x" type="number" min="40" max="860"
                                    class="form-control coordinate-input" :disabled="!layoutEditable || helperBusy"
                                    @change="moveHelper(spot.id, $event.target.value, spot.y)" /></label>
                            <label>Y<input :value="spot.y" type="number" min="40" max="486"
                                    class="form-control coordinate-input" :disabled="!layoutEditable || helperBusy"
                                    @change="moveHelper(spot.id, spot.x, $event.target.value)" /></label>
                            <button v-if="canEdit" class="btn btn-outline-danger" :disabled="helperBusy || canvasLocked"
                                @click="removeHelper(spot.id)">Remove helper {{ memberLabel(spot.user_id) }}</button>
                        </div>
                        <button v-if="canEdit" class="btn btn-primary" :disabled="helperBusy || !helperDirty"
                            @click="saveHelpers">Save helper positions</button>
                        <p v-if="helperMessage" role="status" class="text-success mt-2">{{ helperMessage }}</p>
                        <p v-if="helperError" role="alert" class="text-danger mt-2">{{ helperError }}</p>
                    </section>
                </aside>
                <section ref="stageHost" class="editor-shell" aria-label="Floor plan canvas">
                    <div v-if="!readOnly" class="workspace-caption">
                        <div>
                            <span class="panel-kicker">Layout canvas</span>
                            <h2 class="h5 mb-1">Canvas</h2>
                            <p class="small mb-0">{{ canvasLocked ? 'Layout is locked. Unlock it to move or edit zones and people.' : 'Drag zones and people into place. Click a zone to resize it by its handles. Use the fields alongside the canvas for precise labels and coordinates.' }}</p>
                        </div>
                        <button v-if="canEdit" class="btn btn-sm lock-toggle" type="button"
                            :class="{ 'lock-toggle--locked': canvasLocked }"
                            :aria-pressed="canvasLocked"
                            :aria-label="canvasLocked ? 'Unlock layout canvas' : 'Lock layout canvas'"
                            @click="canvasLocked = !canvasLocked">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path v-if="canvasLocked" d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
                                <path v-else d="M8 10V8a5 5 0 0 1 9.5-2.2M8 10h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
                            </svg>
                            {{ canvasLocked ? 'Locked' : 'Lock' }}
                        </button>
                    </div>
                    <div v-if="canEdit" class="background-controls">
                        <input ref="bgInput" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp"
                            tabindex="-1" @change="onBackgroundPicked">
                        <button class="btn btn-sm btn-outline-primary" type="button"
                            :disabled="!layoutEditable || !planId || bgBusy" @click="bgInput.click()">
                            {{ bgBusy ? 'Uploading…' : background ? 'Replace background' : 'Upload plan background' }}
                        </button>
                        <button v-if="background" class="btn btn-sm btn-outline-secondary" type="button"
                            :disabled="!layoutEditable || bgBusy" @click="removeBackground">Remove background</button>
                        <label v-if="background" class="background-opacity">Opacity
                            <input type="range" min="0.1" max="1" step="0.05" :value="background.opacity"
                                :disabled="!layoutEditable" @input="setBackgroundOpacity($event.target.value)">
                        </label>
                        <label v-if="background" class="background-opacity">Rotate
                            <input type="range" min="0" max="360" step="1" :value="background.rotation || 0"
                                :disabled="!layoutEditable" @input="setBackgroundRotation($event.target.value)">
                            <span class="background-angle">{{ Math.round(background.rotation || 0) }}°</span>
                        </label>
                        <label v-if="background" class="background-opacity">Size
                            <input type="range" min="0.5" max="3" step="0.05" :value="background.scale || 1"
                                :disabled="!layoutEditable" @input="setBackgroundScale($event.target.value)">
                            <span class="background-angle">{{ Math.round((background.scale || 1) * 100) }}%</span>
                        </label>
                        <p v-if="!planId" class="small mb-0 w-100">Save the floor plan before adding a background.</p>
                        <p v-else class="small mb-0 w-100">JPEG, PNG or WebP, up to 10 MiB. Participants see it behind the layout.</p>
                    </div>
                    <p v-if="bgError" class="small text-danger mb-2" role="alert">{{ bgError }}</p>
                    <div class="stage-wrap">
                        <v-stage ref="stageRef" :config="{ ...scaledStage, onMousedown: deselectBox, onTouchstart: deselectBox }">
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

                                <v-group v-if="bgRect" :config="{
                                    clipX: floorBounds.x,
                                    clipY: floorBounds.y,
                                    clipWidth: floorBounds.width,
                                    clipHeight: floorBounds.height,
                                    listening: false,
                                }">
                                <v-image :config="{
                                    image: bgImage,
                                    x: bgRect.cx,
                                    y: bgRect.cy,
                                    offsetX: bgRect.width / 2,
                                    offsetY: bgRect.height / 2,
                                    width: bgRect.width,
                                    height: bgRect.height,
                                    rotation: bgRect.rotation,
                                    opacity: background.opacity,
                                    listening: false,
                                }" />
                                </v-group>

                                <v-group v-for="item in floorObjects" :key="item.id" :config="{
                                    id: `box-${item.id}`,
                                    name: 'box-group',
                                    x: item.x,
                                    y: item.y,
                                    draggable: layoutEditable && !saving && !helperBusy,
                                    opacity: layoutEditable || readOnly ? 1 : 0.75,
                                    onMousedown: () => selectBox(item),
                                    onTouchstart: () => selectBox(item),
                                    onTransform: (event) => onBoxTransform(item, event),
                                    onDragend: (event) => updatePosition(item, event),
                                }">
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

                                <v-group v-for="person in [...people, ...helperMarkers]" :key="person.id" :config="{
                                    x: person.x,
                                    y: person.y,
                                    draggable: layoutEditable && !saving && !helperBusy,
                                    opacity: layoutEditable || readOnly ? 1 : 0.75,
                                    onDragend: (event) => person.user_id ? updateHelperPosition(person, event) : updatePosition(person, event),
                                }">
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
                                <v-transformer ref="transformerRef" :config="transformerConfig" />
                            </v-layer>
                        </v-stage>
                    </div>
                </section>
            </div>
        </template>
    </div>
    <div v-if="USING_SUPABASE && !loading && !loadError" :class="readOnly ? '' : 'container pb-4 floor-editor'">
        <ProgrammeFlow class="floor-aux-panel" :key="eventId" :event-id="eventId" :can-edit="canEdit" :plan-id="planId"
            :zones="dirty ? [] : floorObjects" />
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

.colour-dot-button {
    width: 20px;
    height: 20px;
    flex-basis: 20px;
    padding: 0;
    border: 2px solid rgba(255, 255, 255, .65);
    box-shadow: 0 0 0 1px var(--floor-line);
    cursor: pointer
}

.colour-dot-button:disabled {
    cursor: not-allowed;
    opacity: .65
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
.coordinate-input {
    width: 6rem;
}

@media (max-width: 767.98px) {
    .edit-panel {
        grid-template-columns: 1fr;
    }

    .edit-grid {
        grid-template-columns: 1fr;
    }
}
</style>

<style scoped>
.floor-editor,
.floor-plan-viewer {
    --floor-ink: var(--bookedz-ink, #292d32);
    --floor-muted: var(--bookedz-muted, #63665e);
    --floor-paper: var(--bookedz-cream, #fff9ef);
    --floor-surface: var(--bookedz-surface, #fffdfa);
    --floor-coral: var(--bookedz-coral-dark, #aa3e2c);
    --floor-line: var(--bookedz-border, #e5ded2);
    color: var(--floor-ink)
}

.floor-page-heading {
    padding: 1rem 0 1.15rem;
    border-bottom: 1px solid var(--floor-line)
}

.floor-page-heading h1 {
    font-family: var(--bookedz-heading, 'Bricolage Grotesque', sans-serif);
    letter-spacing: -.035em;
    font-size: clamp(1.8rem, 4vw, 2.4rem)
}

.floor-title-row {
    display: flex;
    align-items: center;
    gap: .75rem
}

.add-plan-button {
    width: 2.35rem;
    min-height: 2.35rem;
    padding: 0;
    border-color: var(--floor-coral);
    color: var(--floor-coral);
    font-size: 1.35rem;
    line-height: 1
}

.floor-plan-switcher {
    display: grid;
    gap: .75rem;
    margin: 0 0 1rem
}

.floor-plan-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: .5rem
}

.floor-plan-tab {
    min-height: 42px;
    padding: .55rem .95rem;
    border: 1px solid var(--floor-line);
    border-radius: 999px;
    background: var(--floor-surface);
    color: var(--floor-muted);
    font-weight: 700
}

.floor-plan-tab.active {
    border-color: var(--floor-coral);
    color: var(--floor-coral);
    background: var(--floor-paper)
}

.floor-plan-tab--add {
    min-width: 42px;
    padding-inline: .75rem;
    font-size: 1.2rem
}

.plan-meta-grid {
    display: grid;
    /* name on the left, address across the remaining columns */
    grid-template-columns: minmax(320px, 1fr) repeat(2, minmax(0, 1fr));
    gap: 1rem;
    align-items: start
}

.plan-address-field {
    grid-column: 2 / -1
}

.plan-name-field {
    display: grid;
    gap: .35rem;
    color: var(--floor-muted);
    font-size: .86rem;
    font-weight: 700
}

.plan-address-field textarea {
    min-height: 46px;
    resize: vertical
}

.floor-page-heading .btn-primary,
.floor-editor .btn-primary {
    --bs-btn-bg: var(--floor-coral);
    --bs-btn-border-color: var(--floor-coral);
    --bs-btn-color: var(--bookedz-on-action, #fffdfa);
    --bs-btn-hover-bg: var(--bookedz-primary-hover, #8f3022);
    --bs-btn-hover-border-color: var(--bookedz-primary-hover, #8f3022);
    --bs-btn-hover-color: var(--bookedz-on-action, #fffdfa);
    border-radius: 12px;
    min-height: 42px
}

.floor-editor .btn-outline-primary,
.floor-plan-viewer .btn-outline-primary {
    --bs-btn-color: var(--floor-coral);
    --bs-btn-border-color: var(--floor-coral);
    --bs-btn-hover-bg: var(--floor-coral);
    --bs-btn-hover-border-color: var(--floor-coral);
    border-radius: 10px
}





.floor-editor-layout {
    display: grid;
    grid-template-columns: minmax(320px, 1fr) repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 1rem
}

.floor-tools {
    display: grid;
    gap: 1rem;
    min-width: 0;
    grid-column: 1
}

.editor-shell {
    grid-column: 2 / -1
}

.edit-panel,
.helper-panel {
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--floor-line);
    border-radius: 18px;
    background: var(--floor-surface);
    box-shadow: var(--bookedz-card-shadow, none)
}

.panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: .75rem;
    margin-bottom: .65rem
}

.panel-heading h2,
.edit-panel h2 {
    margin: 0
}

.panel-kicker {
    display: block;
    color: var(--floor-muted);
    font-size: .72rem;
    font-weight: 750;
    letter-spacing: .08em;
    text-transform: uppercase
}

.status-pill {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: .25rem .55rem;
    border: 1px solid var(--floor-line);
    border-radius: 999px;
    background: var(--floor-paper);
    color: var(--floor-muted);
    font-size: .78rem;
    font-weight: 700;
    white-space: nowrap
}

.edit-panel h2,
.helper-panel h2 {
    font-family: var(--bookedz-heading, 'Bricolage Grotesque', sans-serif);
    font-weight: 700;
    letter-spacing: -.02em
}

.edit-panel {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 1rem
}

.edit-grid {
    grid-template-columns: 1fr;
    gap: .55rem
}

.people-grid {
    grid-template-columns: 1fr
}

.item-scroll-list.is-scrollable {
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: .35rem;
    scrollbar-gutter: stable
}

.box-scroll-list.is-scrollable {
    max-height: 14.5rem
}

.person-scroll-list.is-scrollable {
    max-height: 7.75rem
}

.item-scroll-list::-webkit-scrollbar {
    width: 7px
}

.item-scroll-list::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--floor-line)
}

.item-scroll-list::-webkit-scrollbar-track {
    background: transparent
}

.edit-heading {
    margin-bottom: .65rem
}

.edit-heading .btn {
    min-height: 38px
}

.edit-field,
.person-edit-row {
    gap: .5rem;
    padding: .35rem;
    border-radius: 10px;
    background: var(--floor-paper)
}

.edit-field--box {
    display: grid;
    grid-template-columns: 24px minmax(6rem, 1fr) auto;
    grid-template-areas:
        "dot name remove"
        ". tools tools"
        ". palette palette";
    align-items: center
}

.edit-field--box .colour-dot {
    grid-area: dot
}

.edit-field--box>input:first-of-type {
    grid-area: name
}

.box-name-input {
    min-width: 0
}

.box-size-tools {
    grid-area: tools;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    min-width: 0
}

.box-size-chip {
    width: auto;
    min-width: 8.75rem;
    max-width: 100%;
    padding-right: 2.5rem;
    border-radius: 999px;
    font-weight: 700
}

.box-dimension-chip {
    display: inline-flex;
    align-items: center;
    gap: .25rem;
    min-height: 34px;
    padding: .2rem .35rem;
    border: 1px solid var(--floor-line);
    border-radius: 999px;
    color: var(--floor-muted);
    background: var(--floor-surface);
    font-weight: 700
}

.box-dimension-chip .dimension-input {
    width: 4rem;
    min-height: 30px;
    padding: .15rem .35rem;
    border: 0;
    background: transparent;
    color: var(--floor-ink);
    text-align: center
}

.box-dim-readout {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: .25rem .6rem;
    border: 1px solid var(--floor-line);
    border-radius: 999px;
    color: var(--floor-muted);
    background: var(--floor-surface);
    font-size: .82rem;
    font-weight: 700;
    white-space: nowrap
}

.box-colour-picker {
    grid-area: palette;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
    padding: .15rem 0 .05rem
}

.box-colour-swatch {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 2px solid var(--floor-paper);
    border-radius: 999px;
    box-shadow: 0 0 0 1px var(--floor-line);
    cursor: pointer
}

.box-colour-swatch.active {
    box-shadow: 0 0 0 2px var(--floor-coral)
}

.box-custom-colour {
    display: inline-flex;
    align-items: center;
    gap: .35rem;
    min-height: 28px;
    padding: .15rem .35rem .15rem .55rem;
    border: 1px solid var(--floor-line);
    border-radius: 999px;
    color: var(--floor-muted);
    background: var(--floor-surface);
    font-size: .76rem;
    font-weight: 700
}

.box-custom-colour input {
    width: 28px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: transparent
}

.edit-field--box .form-select,
.edit-field--box .dimension-input {
    min-width: 0
}

.edit-field--box .btn {
    grid-area: remove
}

.edit-field .form-control,
.edit-field .form-select,
.person-edit-row .form-control,
.person-edit-row .form-select,
.helper-panel .form-control,
.helper-panel .form-select {
    min-height: 40px;
    border-color: var(--floor-line);
    border-radius: 9px
}

.edit-field--box .box-size-chip {
    min-height: 34px;
    padding-block: .2rem
}

.edit-field--box .box-dimension-chip .dimension-input {
    min-height: 30px;
    border: 0;
    border-radius: 999px
}

.helper-panel {
    padding: 1rem
}

.helper-panel>div:not(.panel-heading) {
    padding: .55rem 0;
    border-top: 1px solid var(--floor-line)
}

.helper-panel label {
    font-size: .86rem;
    font-weight: 600
}

.helper-panel .coordinate-input {
    width: 5.3rem
}

.helper-panel button {
    min-height: 40px;
    border-radius: 10px
}

.helper-row {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) auto auto;
    align-items: end;
    gap: .5rem
}

.helper-row .btn {
    grid-column: 1/-1;
    justify-self: start
}

.helper-name {
    align-self: center;
    font-weight: 700;
    overflow-wrap: anywhere
}

.editor-shell {
    min-width: 0;
    overflow: auto;
    padding: 1rem;
    border: 1px solid var(--floor-line);
    border-radius: 22px;
    background: var(--floor-paper)
}

.background-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .5rem .75rem;
    margin-bottom: .75rem
}

.background-angle {
    min-width: 3ch;
    font-variant-numeric: tabular-nums
}

.background-opacity {
    display: inline-flex;
    align-items: center;
    gap: .5rem;
    color: var(--floor-muted);
    font-size: .86rem;
    font-weight: 700
}

.workspace-caption {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: .2rem .25rem 1rem
}

.workspace-caption h2 {
    font-family: var(--bookedz-heading, 'Bricolage Grotesque', sans-serif);
    font-weight: 700
}

.workspace-caption p {
    color: var(--floor-muted);
    max-width: 60ch
}

.lock-toggle {
    flex: 0 0 auto;
    border-color: var(--floor-line);
    color: var(--floor-muted);
    background: var(--floor-surface)
}

.lock-toggle svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round
}

.lock-toggle--locked {
    color: var(--floor-coral);
    border-color: var(--floor-coral);
    background: var(--floor-surface)
}

.stage-wrap {
    width: 100%;
    background: var(--floor-surface);
    border: 1px solid var(--floor-line);
    border-radius: 14px;
    overflow: hidden
}

.stage-wrap :deep(.konvajs-content) {
    max-width: 100%
}

.stage-wrap :deep(canvas) {
    max-width: 100%;
    height: auto !important;
    display: block
}

.floor-aux-panel {
    display: block;
    padding: 1.1rem 1.25rem;
    margin-top: 1rem !important;
    border: 1px solid var(--floor-line);
    border-radius: 18px;
    background: var(--floor-surface)
}

.floor-aux-panel :deep(.border.rounded),
.floor-aux-panel :deep(.list-group-item) {
    border-color: var(--floor-line) !important
}

.floor-aux-panel :deep(.form-control),
.floor-aux-panel :deep(.form-select) {
    border-color: var(--floor-line);
    border-radius: 10px;
    min-height: 42px
}

.floor-aux-panel :deep(.btn) {
    border-radius: 10px;
    min-height: 38px
}

.floor-aux-panel :deep(.btn-primary) {
    --bs-btn-bg: var(--floor-coral);
    --bs-btn-border-color: var(--floor-coral);
    --bs-btn-hover-bg: var(--bookedz-primary-hover, #8f3022);
    --bs-btn-hover-border-color: var(--bookedz-primary-hover, #8f3022)
}

.floor-aux-panel :deep(.btn-outline-primary) {
    --bs-btn-color: var(--floor-coral);
    --bs-btn-border-color: var(--floor-coral);
    --bs-btn-hover-bg: var(--floor-coral);
    --bs-btn-hover-border-color: var(--floor-coral)
}

.floor-aux-panel :deep(img) {
    border-radius: 12px !important
}

.floor-plan-viewer {
    color: var(--floor-ink)
}

.floor-plan-viewer .floor-editor-layout {
    display: block
}

.floor-plan-viewer .editor-shell {
    background: var(--floor-paper)
}

.floor-editor :focus-visible,
.floor-plan-viewer :focus-visible {
    outline: 3px solid rgba(170, 62, 44, .55);
    outline-offset: 2px
}

@media(max-width:991.98px) {
    .plan-meta-grid {
        grid-template-columns: 1fr
    }

    .plan-address-field {
        grid-column: auto
    }

    .floor-editor-layout {
        grid-template-columns: 1fr
    }

    .floor-tools,
    .editor-shell {
        grid-column: 1
    }

    .floor-tools {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start
    }

    .edit-panel {
        grid-template-columns: repeat(2, minmax(0, 1fr))
    }
}

@media(max-width:575.98px) {
    .floor-editor {
        padding-inline: 1rem
    }


    .floor-tools {
        grid-template-columns: 1fr
    }

    .edit-panel {
        grid-template-columns: 1fr
    }

    .editor-shell {
        padding: .6rem;
        border-radius: 16px
    }

    .workspace-caption {
        flex-direction: column
    }

    .helper-panel {
        overflow-wrap: anywhere
    }

    .helper-row {
        grid-template-columns: 1fr 1fr
    }

    .helper-name {
        grid-column: 1/-1
    }

    .floor-page-heading {
        align-items: flex-start !important
    }

    .floor-page-heading>div:last-child {
        width: 100%;
        justify-content: space-between
    }
}
</style>
