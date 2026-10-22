<script setup>
import { computed, ref } from 'vue'

const permissionMode = ref('with')
const isLocked = ref(false)

const canEdit = computed(() => {
    return permissionMode.value === 'with' && !isLocked.value
})

const editorStatus = computed(() => {
    if (isLocked.value) return 'Locked: Nobody can edit'
    if (permissionMode.value === 'with') return 'With Perms: Editing enabled'
    return 'No Perms: View Only'
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

const floorObjects = ref([
    {
        id: 'stage',
        type: 'rect',
        label: 'Stage',
        x: 80,
        y: 70,
        width: 220,
        height: 90,
        fill: '#2f80ed',
    },
    {
        id: 'booth-a',
        type: 'rect',
        label: 'Booth A',
        x: 390,
        y: 90,
        width: 120,
        height: 80,
        fill: '#27ae60',
    },
    {
        id: 'booth-b',
        type: 'rect',
        label: 'Booth B',
        x: 560,
        y: 90,
        width: 120,
        height: 80,
        fill: '#f2994a',
    },
    {
        id: 'entrance',
        type: 'rect',
        label: 'Entrance',
        x: 370,
        y: 440,
        width: 160,
        height: 60,
        fill: '#9b51e0',
    },
    {
        id: 'helper',
        type: 'rect',
        label: 'Helper Desk',
        x: 90,
        y: 320,
        width: 150,
        height: 70,
        fill: '#eb5757',
    }
])

const people = ref([
    {
        id: 'organiser-vivienne',
        name: 'Vivienne',
        role: 'Organiser',
        x: 720,
        y: 90,
        radius: 22,
        fill: '#111827',
    },
    {
        id: 'helper-jay',
        name: 'Jay',
        role: 'Helper',
        x: 300,
        y: 270,
        radius: 20,
        fill: '#0f766e',
    },
    {
        id: 'helper-maya',
        name: 'Maya',
        role: 'Helper',
        x: 650,
        y: 340,
        radius: 20,
        fill: '#7c3aed',
    },
])

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

function toggleLock() {
    isLocked.value = !isLocked.value
}

function resetDemo() {
    permissionMode.value = 'with'
    isLocked.value = false
}
</script>

<template>
    <main class="container py-4">
        <div class="d-flex align-items-center justify-content-between mb-3">
            <div>
                <h1 class="h3 mb-1">Floor Plan Editor Skeleton</h1>
                <p class="text-muted mb-0">{{ editorStatus }}</p>
            </div>

            <div class="d-flex gap-2">
                <div class="btn-group">
                    <button class="btn" :class="permissionMode === 'with' ? 'btn-primary' : 'btn-outline-primary'"
                        :disabled="isLocked" @click="permissionMode = 'with'">
                        With perms
                    </button>

                    <button class="btn" :class="permissionMode === 'none' ? 'btn-primary' : 'btn-outline-primary'"
                        :disabled="isLocked" @click="permissionMode = 'none'">
                        No perms
                    </button>
                </div>

                <button class="btn" :class="isLocked ? 'btn-danger' : 'btn-outline-danger'" @click="toggleLock">
                    {{ isLocked ? 'Unlock' : 'Lock' }}
                </button>

                <button class="btn btn-outline-secondary" @click="resetDemo">
                    Reset
                </button>

            </div>
        </div>

        <section class="edit-panel mb-3">
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
                            :disabled="!canEdit"
                        >
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
                            :disabled="!canEdit"
                        >
                            <option>Organiser</option>
                            <option>Helper</option>
                        </select>
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
    </main>
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
