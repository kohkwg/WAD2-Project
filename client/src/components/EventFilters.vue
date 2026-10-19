<script setup>
import { reactive, watch } from 'vue'
import { CATEGORIES } from '@/lib/constants'

const props = defineProps({ modelValue: { type: Object, required: true } })
const emit = defineEmits(['update:modelValue'])

const local = reactive({ ...props.modelValue })

// Debounce the search box so we don't hit Supabase on every keystroke
let timer
watch(
  () => ({ ...local }),
  (val) => {
    clearTimeout(timer)
    timer = setTimeout(() => emit('update:modelValue', { ...val, page: 1 }), 300)
  },
  { deep: true },
)

function reset() {
  Object.assign(local, {
    search: '', category: '', tag: '', dateFrom: '', dateTo: '', availableOnly: false, sort: 'soonest',
  })
}
</script>

<template>
  <form class="card shadow-sm" @submit.prevent>
    <div class="card-body">
      <div class="row g-3 align-items-end">
        <div class="col-12 col-md-4">
          <label for="search" class="form-label small text-secondary mb-1">Search</label>
          <input id="search" v-model="local.search" type="search" class="form-control"
                 placeholder="Title, description or venue" />
        </div>

        <div class="col-6 col-md-2">
          <label for="category" class="form-label small text-secondary mb-1">Category</label>
          <select id="category" v-model="local.category" class="form-select">
            <option value="">All</option>
            <option v-for="c in CATEGORIES" :key="c" :value="c" class="text-capitalize">{{ c }}</option>
          </select>
        </div>

        <div class="col-6 col-md-2">
          <label for="dateFrom" class="form-label small text-secondary mb-1">From</label>
          <input id="dateFrom" v-model="local.dateFrom" type="date" class="form-control" />
        </div>

        <div class="col-6 col-md-2">
          <label for="dateTo" class="form-label small text-secondary mb-1">To</label>
          <input id="dateTo" v-model="local.dateTo" type="date" class="form-control" />
        </div>

        <div class="col-6 col-md-2">
          <label for="sort" class="form-label small text-secondary mb-1">Sort by</label>
          <select id="sort" v-model="local.sort" class="form-select">
            <option value="soonest">Soonest</option>
            <option value="popular">Most popular</option>
          </select>
        </div>

        <div class="col-12 d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div class="form-check">
            <input id="available" v-model="local.availableOnly" type="checkbox" class="form-check-input" />
            <label for="available" class="form-check-label small">Only events with spots left</label>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="reset">Clear filters</button>
        </div>
      </div>
    </div>
  </form>
</template>
