<script setup>
import { ref, onUnmounted } from 'vue';
import axios from 'axios';

// search for an address and send the selected place and coordinates to the parent

defineProps({
  label: String,
  inputId: String
});

const emit = defineEmits(['select']);

const query = ref('');

const results = ref([]);

const loading = ref(false);

const errorMessage = ref('');

let timer = null;

// Each new action increases this number. A late response with an older number has no effect.
let requestId = 0;

// wait until typing pauses for 400 milliseconds before searching


function onType() {
  clearTimeout(timer);
  requestId++;
  errorMessage.value = '';
  loading.value = false;
  results.value = [];
  if (query.value.trim().length < 3) {
    return;
  }
  const currentRequestId = requestId;
  timer = setTimeout(() => searchOneMap(currentRequestId, query.value.trim()), 400);
}

function dismissSearch() {
  requestId++;
  clearTimeout(timer);
  loading.value = false;
  results.value = [];
}

async function searchOneMap(currentRequestId, searchValue) {
  loading.value = true;
  try {
    // onemap search does not need an api key
    const response = await axios.get('https://www.onemap.gov.sg/api/common/elastic/search', {
      params: {
        searchVal: searchValue,
        returnGeom: 'Y',
        // include coordinates
        getAddrDetails: 'Y',
        // include the full address + postal code
        pageNum: 1
      }
    });
    if (currentRequestId !== requestId) return;
    results.value = response.data.results.slice(0, 6); // top 6 is plenty
    if (results.value.length === 0) {
      errorMessage.value = 'No matching address. Try a postal code or building name.';
    }
  } catch (error) {
    if (currentRequestId !== requestId) return;
    results.value = [];
    errorMessage.value = 'Could not reach OneMap (' + error.message + ').';
  } finally {
    if (currentRequestId === requestId) loading.value = false;
  }
}

// convert the search result into the venue fields used by the form


function choose(place) {
  requestId++;
  clearTimeout(timer);
  loading.value = false;
  emit('select', {
    name: place.BUILDING !== 'NIL' ? place.BUILDING : place.SEARCHVAL,
    address: place.ADDRESS,
    postal: place.POSTAL,
    lat: Number(place.LATITUDE),
    // onemap sends numbers as text
    lng: Number(place.LONGITUDE)
  });
  query.value = '';
  results.value = [];
}

// allow a typed address without coordinates if the search fails


function useTypedAddress() {
  requestId++;
  clearTimeout(timer);
  loading.value = false;
  emit('select', {
    name: query.value.trim(),
    address: query.value.trim(),
    postal: '',
    lat: null,
    lng: null
  });
  query.value = '';
  errorMessage.value = '';
}

onUnmounted(() => {
  requestId++;
  clearTimeout(timer);
});
</script>

<template>
  <div class="mb-3">
    <!-- show an optional note beside the search label -->
    <div v-if="$slots.note" class="address-label-row">
      <label :for="inputId" class="form-label mb-0">{{ label }}</label>
      <span class="form-text m-0">
        <slot name="note" />
      </span>
    </div>
    <label v-else :for="inputId" class="form-label">{{ label }}</label>
    <div class="input-group">
      <input
      :id="inputId"
      type="text"
      class="form-control"
      placeholder="Start typing a building, street or postal code"
      autocomplete="off"
      v-model="query"
      @input="onType"
      @keydown.esc.prevent="dismissSearch" />
      <span v-if="loading" class="input-group-text">
        <span class="spinner-border spinner-border-sm" role="status">
        <span class="visually-hidden">Searching
            addresses…</span></span>
      </span>
    </div>

    <div v-if="results.length > 0" class="list-group shadow-sm mt-1">
      <button v-for="place in results" :key="place.ADDRESS + place.POSTAL" type="button"
        class="list-group-item list-group-item-action" @click="choose(place)">
        <div class="fw-semibold">
          {{ place.BUILDING !== 'NIL' ? place.BUILDING : place.SEARCHVAL }}
        </div>
        <div class="small text-secondary">{{ place.ADDRESS }}</div>
      </button>
    </div>

    <div v-dismissible v-if="errorMessage" class="form-text text-danger" role="alert">
      {{ errorMessage }}
      <button type="button" class="btn btn-link btn-sm p-0 align-baseline" @click="useTypedAddress">
        Use "{{ query }}" anyway
      </button>
    </div>
  </div>
</template>

<style scoped>
.address-label-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: .25rem 1rem;
  margin-bottom: .5rem;
}
</style>
