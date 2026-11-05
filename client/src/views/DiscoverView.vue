<script setup>
import '../assets/design-baseline.css'
import {
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
  computed,
  nextTick,
} from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { USING_SUPABASE, getMyRsvps, JOINED_STATUSES } from '@/utils/api'
import { observeDiscoverySession } from '@/lib/discoveryState'
import { useEvents, useRecommendations } from '@/composables/useEvents'
import { useDiscoveryMotion } from '@/composables/useDiscoveryMotion'
import { toast } from '@/composables/useToast'
import { EVENT_GROUPS, sameCategories } from '@/lib/eventGroups'
import {
  normalizeDiscoveryFilters,
  discoveryDateRange,
  discoveryEventQuery,
  discoveryUrlQuery,
  discoveryFiltersFromQuery,
} from '@/lib/discoveryFilters'

import DiscoveryEventRow from '@/components/discovery/DiscoveryEventRow.vue'
import DiscoveryDayRow from '@/components/discovery/DiscoveryDayRow.vue'
import DiscoveryWeekCalendar from '@/components/discovery/DiscoveryWeekCalendar.vue'
import DiscoveryStreetMap from '@/components/discovery/DiscoveryStreetMap.vue'
import EventFilters from '@/components/EventFilters.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import BumpValue from '@/components/ui/BumpValue.vue'

const BROWSING_STORAGE_KEY = 'bookedz-discover-browsing'
const MOBILE_QUERY = '(max-width: 991px)'
const EVENTS_PER_PAGE = 10
const MAX_WEEKS = 26
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const CLOCK_INTERVAL = 60000

const route = useRoute()
const router = useRouter()

// Restore the previous search and filters.
function restoreBrowsing() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(BROWSING_STORAGE_KEY))
    const restoredFilters = normalizeDiscoveryFilters(saved?.filters)

    // Support older saved filters.
    if (saved?.filters?.availableOnly) {
      restoredFilters.extras = ['spots_left']
    }

    return {
      filters: restoredFilters,
      search: saved?.search || saved?.filters?.search || '',
      sort:
        (saved?.sort || saved?.filters?.sort) === 'popular'
          ? 'popular'
          : 'soonest',
      mode: saved?.mode === 'map' ? 'map' : 'list',
    }
  } catch {
    return {
      filters: normalizeDiscoveryFilters(),
      search: '',
      sort: 'soonest',
      mode: 'list',
    }
  }
}

// State
const browsing = restoreBrowsing()

const filters = ref(browsing.filters)
const search = ref(browsing.search)
const sort = ref(browsing.sort)
const viewMode = ref(browsing.mode)

const loggedIn = ref(false)
const selectedEventId = ref(null)
const visibleCount = ref(EVENTS_PER_PAGE)
const weekOffset = ref(0)
const weeksShown = ref(1)
const clock = ref(Date.now())

const mySchedule = ref([])
const scheduleError = ref('')

const pageRoot = ref(null)
const searchControl = ref(null)
const resultList = ref(null)
const toolbar = ref(null)
const categoryRow = ref(null)

const smallScreen = ref(window.matchMedia(MOBILE_QUERY).matches)
const rowFade = ref({
  start: false,
  end: false,
})

let smallMedia
let rowObserver
let clockTimer
let stopAuth
let listScrollY = 0

useDiscoveryMotion(pageRoot)

// List, map and saved count use separate requests.
const {
  events,
  total,
  loading,
  error,
  fetchEvents,
} = useEvents()

const {
  events: mapEvents,
  loading: mapLoading,
  fetchEvents: fetchMapEvents,
} = useEvents()

const {
  total: savedCount,
  fetchEvents: fetchSavedCount,
} = useEvents()

const {
  recommended,
  actionPending,
  actionError,
  fetchRecommendations,
  clearRecommendations,
  updatePreference,
} = useRecommendations()

// Display values
const savedSelected = computed(() => {
  return filters.value.saved && loggedIn.value
})

const showSavedChip = computed(() => {
  return loggedIn.value && (savedCount.value > 0 || filters.value.saved)
})

const emptySuggestions = computed(() => {
  return EVENT_GROUPS.filter((group) => {
    return !sameCategories(filters.value.categories, group.categories)
  }).slice(0, 4)
})

const activeCategory = computed(() => {
  return filters.value.categories.length === 1
    ? filters.value.categories[0]
    : ''
})

const categoryTitle = computed(() => {
  if (savedSelected.value) {
    return 'Your saved events'
  }

  if (activeCategory.value) {
    const category = activeCategory.value
    const title = category.charAt(0).toUpperCase() + category.slice(1)

    return `${title} events`
  }

  return 'Discover events'
})

const remaining = computed(() => {
  return Math.max(0, total.value - events.value.length)
})

const whenActive = computed(() => {
  const pickingWithoutDates =
    filters.value.when === 'pick_dates' &&
    !(filters.value.dateFrom && filters.value.dateTo)

  return Boolean(filters.value.when) && !pickingWithoutDates
})

const filtersActive = computed(() => {
  return Boolean(
    search.value ||
      whenActive.value ||
      filters.value.extras.length ||
      filters.value.categories.length ||
      savedSelected.value,
  )
})

// Desktop browsing starts with one week.
const weekMode = computed(() => {
  return !smallScreen.value && !filtersActive.value
})

function weekAt(weeks) {
  const offset = (weekOffset.value + weeks) * 7 * MILLISECONDS_PER_DAY

  return discoveryDateRange('week', clock.value + offset)
}

function weekWindow(range) {
  if (!weekMode.value) {
    return range
  }

  const firstWeek = weekAt(0)
  const lastWeek = weekAt(weeksShown.value - 1)

  const dateFrom =
    range.dateFrom && range.dateFrom > firstWeek.dateFrom
      ? range.dateFrom
      : firstWeek.dateFrom

  const dateTo =
    range.dateTo && range.dateTo < lastWeek.dateTo
      ? range.dateTo
      : lastWeek.dateTo

  return {
    ...range,
    dateFrom,
    dateTo,
  }
}

function dayLabel(key) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-SG', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  })
}

const nextWeekLabel = computed(() => {
  const next = weekAt(weeksShown.value)

  return `${dayLabel(next.dateFrom)} – ${dayLabel(next.dateTo)}`
})

// Build matching queries for the list and map.
function baseQuery() {
  const activeFilters = {
    ...filters.value,
    saved: savedSelected.value,
  }

  const options = {
    search: search.value,
    sort: sort.value,
    page: 1,
    now: clock.value,
  }

  return weekWindow(discoveryEventQuery(activeFilters, options))
}

const eventQuery = computed(() => {
  return {
    ...baseQuery(),
    limit: weekMode.value ? 200 : visibleCount.value,
  }
})

const mapQuery = computed(() => {
  return {
    ...baseQuery(),
    forMap: true,
  }
})

const discoveryPicks = computed(() => {
  return loggedIn.value ? recommended.value : []
})

const recommendationById = computed(() => {
  return new Map(discoveryPicks.value.map((event) => [event.id, event]))
})

const prominentEventIds = computed(() => {
  return discoveryPicks.value.map((event) => event.id)
})

// On phones the list is hidden while the map shows, so the chosen pin's card (with its View
// event and RSVP buttons) sits under the map; the map itself only shows where the event is.
const selectedMapEvent = computed(() => {
  if (selectedEventId.value == null) return null
  return events.value.find((event) => event.id === selectedEventId.value)
    || mappedPageEvents.value.find((event) => event.id === selectedEventId.value)
    || null
})

const mappedPageEvents = computed(() => {
  const rows =
    mapEvents.value.length || mapLoading.value
      ? mapEvents.value
      : events.value

  return rows.map((event) => {
    const pick = recommendationById.value.get(event.id)

    if (!pick) {
      return event
    }

    return {
      ...event,
      pickedForYou: pick.source !== 'general_discovery',
      compatibilityScore: pick.compatibilityScore,
      source: pick.source,
      reason: pick.reason,
    }
  })
})

// Group events by their Singapore date.
const dateGroups = computed(() => {
  const groups = new Map()

  for (const event of events.value) {
    const date = new Date(event.start_time)
    const key = date.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Singapore',
    })

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date: key,
        label: date.toLocaleDateString('en-SG', {
          timeZone: 'Asia/Singapore',
          day: 'numeric',
          month: 'short',
        }),
        weekday: date.toLocaleDateString('en-US', {
          timeZone: 'Asia/Singapore',
          weekday: 'long',
        }),
        year:
          date.getFullYear() !== new Date().getFullYear()
            ? date.getFullYear()
            : '',
        events: [],
      })
    }

    groups.get(key).events.push(event)
  }

  return [...groups.values()]
})

// Filters
function setCategories(categories) {
  searchControl.value?.flushSearch()

  filters.value = {
    ...filters.value,
    saved: false,
    categories,
  }
}

function chooseCategory(category = '') {
  setCategories(category ? [category] : [])
}

function chooseGroup(group) {
  setCategories([...group.categories])
}

function chooseSuggestedGroup(group) {
  search.value = ''
  chooseGroup(group)
}

function chooseSaved() {
  searchControl.value?.flushSearch()

  filters.value = {
    ...filters.value,
    saved: !filters.value.saved,
    categories: [],
  }
}

function clearFilters() {
  filters.value = normalizeDiscoveryFilters()
  search.value = ''
  sort.value = 'soonest'
  visibleCount.value = EVENTS_PER_PAGE
}

function showMore() {
  if (!loading.value) {
    visibleCount.value += EVENTS_PER_PAGE
  }
}

// Mobile list and map
function updateSmallScreen() {
  smallScreen.value = smallMedia?.matches ?? false
}

function updateRowFade() {
  const element = categoryRow.value

  if (!element) {
    return
  }

  rowFade.value = {
    start: element.scrollLeft > 4,
    end: element.scrollLeft + element.clientWidth < element.scrollWidth - 4,
  }
}

async function showPane(pane) {
  if (pane === viewMode.value) {
    return
  }

  searchControl.value?.flushSearch()

  if (pane === 'map') {
    listScrollY = window.scrollY
  }

  viewMode.value = pane
  await nextTick()

  if (pane === 'list') {
    window.scrollTo({
      top: listScrollY,
      behavior: 'instant',
    })
  } else {
    const top = toolbar.value.getBoundingClientRect().top + window.scrollY - 80

    if (window.scrollY > top) {
      window.scrollTo({
        top: Math.max(0, top),
        behavior: 'instant',
      })
    }
  }
}

function selectMapEvent(event, { scroll = true } = {}) {
  selectedEventId.value = event.id

  if (scroll && smallScreen.value) {
    showPane('map')
  }
}

async function showList() {
  searchControl.value?.flushSearch()
  viewMode.value = 'list'

  await nextTick()
  resultList.value?.focus({ preventScroll: true })
}

// Event actions
function refreshSavedCount() {
  if (loggedIn.value) {
    fetchSavedCount({
      savedOnly: true,
      countOnly: true,
    })
  } else {
    savedCount.value = 0
  }
}

function refreshDiscovery() {
  fetchEvents(eventQuery.value)
  fetchMapEvents(mapQuery.value)
  refreshSavedCount()
}

function openSavedEvents() {
  router.push({
    path: '/my-rsvps',
    query: { tab: 'saved' },
  })
}

function openScheduleEvent(event) {
  router.push(`/events/${event.id}/rsvp`)
}

async function changeListingPreference(payload) {
  if (!loggedIn.value || actionPending.value) {
    return
  }

  await updatePreference(payload.event, payload.action)

  if (actionError.value) {
    return
  }

  if (payload.action === 'save') {
    toast('Saved to your list', {
      duration: 6000,
      action: {
        label: 'View saved',
        onClick: openSavedEvents,
      },
    })
  } else {
    toast(`Removed ${payload.event.title} from saved`)
  }

  refreshDiscovery()
}

// Load the user's RSVP schedule.
async function loadSchedule(signedIn) {
  if (!signedIn) {
    mySchedule.value = []
    scheduleError.value = ''
    return
  }

  try {
    const rsvps = await getMyRsvps()

    mySchedule.value = rsvps
      .filter((rsvp) => {
        return JOINED_STATUSES.includes(rsvp.status) && rsvp.event
      })
      .map((rsvp) => {
        return {
          id: rsvp.event.id,
          title: rsvp.event.title,
          start_time: rsvp.event.startTime,
          category: rsvp.event.tags?.[0] || 'event',
          status: rsvp.status,
        }
      })

    scheduleError.value = ''
  } catch {
    scheduleError.value = 'Could not load your schedule.'
  }
}

// Remember browsing choices.
watch(
  [filters, search, sort, viewMode],
  () => {
    try {
      const browsingState = {
        filters: filters.value,
        search: search.value,
        sort: sort.value,
        mode: viewMode.value,
      }

      sessionStorage.setItem(
        BROWSING_STORAGE_KEY,
        JSON.stringify(browsingState),
      )
    } catch {
      // Browsing still works without storage.
    }
  },
  { deep: true, flush: 'sync' },
)

watch(
  [filters, search, sort, weekOffset],
  () => {
    visibleCount.value = EVENTS_PER_PAGE
    weeksShown.value = 1
  },
  { deep: true },
)

watch(mapEvents, (rows) => {
  const selectionExists = rows.some((event) => {
    return event.id === selectedEventId.value
  })

  if (!selectionExists) {
    selectedEventId.value = null
  }
})

// Keep filters and the URL in sync.
watch(
  () => route.query,
  (query) => {
    const filterKeys = [
      'search',
      'when',
      'extras',
      'categories',
      'category',
      'saved',
    ]

    const hasFilters = filterKeys.some((key) => {
      return Object.hasOwn(query, key)
    })

    if (hasFilters) {
      const next = discoveryFiltersFromQuery(query)

      if (JSON.stringify(filters.value) !== JSON.stringify(next)) {
        filters.value = next
      }

      search.value = typeof query.search === 'string' ? query.search : ''
      sort.value = query.sort === 'popular' ? 'popular' : 'soonest'
    }

    // Support older map links.
    if (query.view === 'map') {
      viewMode.value = 'map'

      router.replace({
        path: '/discover',
        query: {
          ...query,
          view: 'list',
        },
      })
    }
  },
  { immediate: true },
)

watch(
  [filters, search, sort],
  () => {
    const query = discoveryUrlQuery(
      filters.value,
      search.value,
      'list',
      sort.value,
    )

    const target = router.resolve({
      path: '/discover',
      query,
    })

    if (target.fullPath !== route.fullPath) {
      router.replace({
        path: '/discover',
        query,
      })
    }
  },
  { deep: true },
)

// Fetch again only when the query changes.
watch(eventQuery, (value, previous) => {
  if (JSON.stringify(value) !== JSON.stringify(previous)) {
    fetchEvents(value)
  }
})

watch(mapQuery, (value, previous) => {
  if (JSON.stringify(value) !== JSON.stringify(previous)) {
    fetchMapEvents(value)
  }
})

// Set up listeners and load data.
onMounted(() => {
  smallMedia = window.matchMedia(MOBILE_QUERY)
  updateSmallScreen()
  smallMedia.addEventListener('change', updateSmallScreen)

  rowObserver = new ResizeObserver(updateRowFade)

  if (categoryRow.value) {
    rowObserver.observe(categoryRow.value)
  }

  updateRowFade()

  clockTimer = setInterval(() => {
    clock.value = Date.now()
  }, CLOCK_INTERVAL)

  if (!USING_SUPABASE) {
    refreshDiscovery()
    loadSchedule(true)
    return
  }

  stopAuth = observeDiscoverySession(
    supabase,
    (session) => {
      loggedIn.value = Boolean(session)
      loadSchedule(Boolean(session))
      clearRecommendations()
      refreshDiscovery()

      if (session) {
        fetchRecommendations(24)
      }
    },
    (failure) => {
      error.value = failure.message || 'Could not load your session.'
    },
  )
})

onBeforeUnmount(() => {
  smallMedia?.removeEventListener('change', updateSmallScreen)
  rowObserver?.disconnect()
  clearInterval(clockTimer)
  stopAuth?.()
  clearRecommendations()
})
</script>

<template>
  <div ref="pageRoot" class="discover-page" tabindex="-1">
    <h1 class="visually-hidden">{{ categoryTitle }}</h1>

    <div class="discovery-search">
      <EventFilters
        ref="searchControl"
        v-model="filters"
        v-model:search="search"
        v-model:sort="sort"
        :total="total"
        :loading="loading"
        :error="error"
        show-active
        @show="showList"
        @retry="refreshDiscovery"
      />
    </div>

    <div ref="toolbar" class="discovery-toolbar">
      <nav
        ref="categoryRow"
        class="category-shortcuts"
        :class="{
          'fade-start': rowFade.start,
          'fade-end': rowFade.end,
        }"
        aria-label="Event categories"
        @scroll.passive="updateRowFade"
      >
        <button
          v-if="showSavedChip"
          type="button"
          class="category-shortcut saved-shortcut"
          :aria-pressed="savedSelected"
          :aria-label="`Saved events, ${savedCount}`"
          @click="chooseSaved"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h12v18l-6-4-6 4V3Z" />
          </svg>

          Saved

          <span class="saved-count" aria-hidden="true">
            {{ savedCount }}
          </span>
        </button>

        <button
          type="button"
          class="category-shortcut"
          :aria-pressed="!filters.categories.length && !savedSelected"
          @click="chooseCategory()"
        >
          All
        </button>

        <button
          v-for="group in EVENT_GROUPS"
          :key="group.id"
          type="button"
          class="category-shortcut cat-tint"
          :class="`cat-${group.categories[0]}`"
          :aria-pressed="sameCategories(filters.categories, group.categories)"
          @click="chooseGroup(group)"
        >
          {{ group.label }}
        </button>
      </nav>

      <div class="results-tools">
        <span aria-live="polite">
          <BumpValue :value="total" />
          {{ total === 1 ? 'event' : 'events' }}
        </span>

        <div
          v-if="smallScreen"
          class="pane-switch"
          :class="{ 'is-map': viewMode === 'map' }"
          role="group"
          aria-label="Show events as"
        >
          <span class="pane-thumb" aria-hidden="true"></span>

          <button
            type="button"
            :aria-pressed="viewMode === 'list'"
            @click="showPane('list')"
          >
            List
          </button>

          <button
            type="button"
            :aria-pressed="viewMode === 'map'"
            @click="showPane('map')"
          >
            Map
          </button>
        </div>
      </div>
    </div>

    <div
      id="event-directory"
      class="discovery-workspace"
      :data-pane="smallScreen ? viewMode : undefined"
    >
      <section
        ref="resultList"
        class="discovery-list"
        aria-label="Upcoming events"
        :aria-busy="loading"
        tabindex="-1"
      >
        <h2 class="visually-hidden">What’s coming up</h2>

        <SkeletonList
          v-if="loading && !events.length"
          :count="5"
          label="Finding your next event…"
        />

        <div
          v-dismissible
          v-else-if="error"
          class="empty-state"
          role="alert"
        >
          <h2>We couldn’t load events</h2>
          <p>{{ error }}</p>

          <button
            type="button"
            class="btn btn-outline-danger"
            @click="refreshDiscovery"
          >
            Try again
          </button>
        </div>

        <div
          v-else-if="!events.length && !loading"
          class="empty-state"
          role="status"
        >
          <template v-if="savedSelected">
            <h2>No saved events here</h2>

            <p>
              {{
                search || filters.when || filters.extras.length
                  ? 'None of your saved events match these filters.'
                  : 'Tap the bookmark on any event to keep it here. Past saves stay in My RSVPs.'
              }}
            </p>

            <button
              type="button"
              class="btn btn-outline-secondary"
              @click="chooseCategory()"
            >
              Browse all events
            </button>
          </template>

          <template v-else-if="!smallScreen && !filtersActive">
            <h2>Nothing on this week</h2>

            <p>
              Try another week in the calendar, or search or pick a category
              to see events on every date.
            </p>

            <button
              type="button"
              class="btn btn-outline-secondary"
              @click="weekOffset++"
            >
              Next week
            </button>
          </template>

          <template v-else>
            <h2>No events found</h2>

            <p>
              {{
                filters.categories.length
                  ? 'Nothing in this group right now. Try another one:'
                  : 'Try another search, or browse a category:'
              }}
            </p>

            <div class="empty-suggestions">
              <button
                v-for="group in emptySuggestions"
                :key="group.id"
                type="button"
                class="category-shortcut cat-tint"
                :class="`cat-${group.categories[0]}`"
                @click="chooseSuggestedGroup(group)"
              >
                {{ group.label }}
              </button>
            </div>

            <button
              type="button"
              class="btn btn-outline-secondary"
              @click="clearFilters"
            >
              Clear search and filters
            </button>
          </template>
        </div>

        <div
          v-else-if="!smallScreen"
          class="event-days"
          :class="{ 'is-refreshing': loading }"
        >
          <DiscoveryDayRow
            v-for="group in dateGroups"
            :key="group.key"
            :group="group"
            :recommendation-by-id="recommendationById"
            :selected-event-id="selectedEventId"
            :bookmark-enabled="loggedIn"
            :preference-pending="actionPending"
            @select="selectMapEvent"
            @preference="changeListingPreference"
          />
        </div>

        <div
          v-else
          class="event-timeline"
          :class="{ 'is-refreshing': loading }"
        >
          <section
            v-for="group in dateGroups"
            :key="group.key"
            class="date-group"
            :aria-label="`${group.label}, ${group.weekday} ${group.year}`"
          >
            <div class="timeline-date">
              <time :datetime="group.date">
                <span class="date-label">
                  {{ group.label }}
                  <template v-if="group.year">, {{ group.year }}</template>
                </span>

                <span class="weekday">{{ group.weekday }}</span>
              </time>
            </div>

            <TransitionGroup
              tag="div"
              name="list-fade"
              class="date-events"
            >
              <DiscoveryEventRow
                v-for="event in group.events"
                :key="event.id"
                :event="event"
                :recommendation="recommendationById.get(event.id)"
                :selected="selectedEventId === event.id"
                :bookmark-enabled="loggedIn"
                :preference-pending="actionPending"
                @select="selectMapEvent"
                @preference="changeListingPreference"
              />
            </TransitionGroup>
          </section>
        </div>

        <div
          v-if="weekMode && !error && events.length"
          class="event-more"
        >
          <button
            type="button"
            class="btn btn-outline-secondary"
            :disabled="loading || weeksShown >= MAX_WEEKS"
            @click="weeksShown++"
          >
            {{ loading ? 'Loading…' : `Show more (${nextWeekLabel})` }}
          </button>
        </div>

        <div
          v-else-if="remaining > 0 && !error"
          class="event-more"
        >
          <button
            type="button"
            class="btn btn-outline-secondary"
            :disabled="loading"
            @click="showMore"
          >
            {{
              loading
                ? 'Loading…'
                : `Show ${Math.min(EVENTS_PER_PAGE, remaining)} more`
            }}
          </button>

          <span>Showing {{ events.length }} of {{ total }}</span>
        </div>
      </section>

      <div class="discovery-map-column">
        <DiscoveryStreetMap
          :events="mappedPageEvents"
          :search-text="search"
          :focused-event-id="selectedEventId"
          :prominent-ids="prominentEventIds"
          :loading="loading"
          :error="error"
          @select="selectedEventId = $event"
          @retry="refreshDiscovery"
        />

        <DiscoveryEventRow
          v-if="smallScreen && selectedMapEvent"
          class="map-selected-card"
          :event="selectedMapEvent"
          :recommendation="recommendationById.get(selectedMapEvent.id)"
          selected
          :bookmark-enabled="loggedIn"
          :preference-pending="actionPending"
          @select="selectMapEvent($event, { scroll: false })"
          @preference="changeListingPreference"
        />

        <DiscoveryWeekCalendar
          v-if="!smallScreen"
          v-model:offset="weekOffset"
          :events="mySchedule"
          :signed-in="loggedIn || !USING_SUPABASE"
          :error="scheduleError"
          @select="openScheduleEvent"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.discover-page {
  padding: 26px 24px 40px;
  max-width: 1600px;
  margin: 0 auto;
  color: var(--bookedz-ink);
}

.discover-page:focus,
.discovery-list:focus {
  outline: none;
}

/* Search */
.discovery-search {
  position: relative;
  z-index: 12;
  margin-bottom: 14px;
}

.discovery-search :deep(.search-toolbar) {
  border-radius: 10px;
  box-shadow: none;
  padding: 5px;
}

.discovery-search :deep(.search-field input) {
  height: 44px;
  font-size: 14px;
}

.discovery-search :deep(.filter-toggle) {
  border-radius: 7px;
  font-size: 12px;
}

/* Categories */
.discovery-toolbar {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px 20px;
  margin: 14px 0;
}

.category-shortcuts {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  flex: 1 1 0;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 6px 8px 8px 4px;
  margin: -6px -8px -8px -4px;
}

.category-shortcuts::-webkit-scrollbar {
  display: none;
}

.category-shortcuts.fade-end {
  -webkit-mask-image: linear-gradient(
    to right,
    #000 calc(100% - 48px),
    transparent
  );
  mask-image: linear-gradient(
    to right,
    #000 calc(100% - 48px),
    transparent
  );
}

.category-shortcuts.fade-start {
  -webkit-mask-image: linear-gradient(to right, transparent, #000 48px);
  mask-image: linear-gradient(to right, transparent, #000 48px);
}

.category-shortcuts.fade-start.fade-end {
  -webkit-mask-image: linear-gradient(
    to right,
    transparent,
    #000 48px,
    #000 calc(100% - 48px),
    transparent
  );
  mask-image: linear-gradient(
    to right,
    transparent,
    #000 48px,
    #000 calc(100% - 48px),
    transparent
  );
}

.category-shortcut {
  flex: none;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 9px 15px;
  border: 1px solid transparent;
  border-radius: 99px;
  color: var(--bookedz-ink);
  font-size: 12px;
  transition:
    background-color var(--bookedz-motion-fast) var(--bookedz-ease),
    color var(--bookedz-motion-fast) var(--bookedz-ease),
    transform var(--bookedz-motion-feedback) var(--bookedz-ease);
}

.category-shortcut:not(.cat-tint) {
  background: var(--bookedz-hover);
}

.category-shortcut[aria-pressed='true'] {
  background: var(--bookedz-ink);
  color: var(--bookedz-surface);
  animation: pop-once var(--bookedz-motion-slip) var(--bookedz-ease-stamp);
}

.category-shortcut:hover {
  border-color: var(--bookedz-control-border);
}

.category-shortcut:active {
  transform: scale(0.95);
}

.saved-shortcut {
  gap: 6px;
}

.saved-shortcut svg {
  flex: none;
  width: 16px;
  height: 16px;
  fill: currentColor;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linejoin: round;
}

.saved-count {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: color-mix(in srgb, currentColor 16%, transparent);
  font-size: 0.72rem;
  font-weight: 700;
}

.results-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--bookedz-muted);
  font-size: 12px;
}

/* Mobile list/map switch */
.pane-switch {
  position: relative;
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  padding: 2px;
  border-radius: 99px;
  background: var(--bookedz-hover);
}

.pane-switch button {
  position: relative;
  z-index: 1;
  min-width: 64px;
  min-height: 40px;
  padding: 6px 14px;
  border: 0;
  border-radius: 99px;
  background: transparent;
  color: var(--bookedz-muted);
  font-size: 12px;
  font-weight: 600;
  transition:
    background-color var(--bookedz-motion-fast) var(--bookedz-ease),
    color var(--bookedz-motion-fast) var(--bookedz-ease);
}

.pane-switch button[aria-pressed='true'] {
  color: var(--bookedz-ink);
}

.pane-thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc(50% - 2px);
  border-radius: 99px;
  background: var(--bookedz-surface);
  box-shadow: var(--bookedz-tab-shadow);
  transition: transform var(--bookedz-motion-normal) var(--bookedz-ease-stamp);
}

.pane-switch.is-map .pane-thumb {
  transform: translateX(100%);
}

/* List and map layout */
.discovery-workspace {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  min-width: 0;
}

.discovery-list,
.discovery-map-column {
  min-width: 0;
}

.discovery-map-column {
  position: sticky;
  top: calc(var(--topbar-h, 0px) + 18px);
}

/* Mobile event timeline */
.event-timeline {
  --date-column: 66px;
  position: relative;
  transition: opacity var(--bookedz-motion-fast) var(--bookedz-ease);
}
.event-timeline::before {
  content: '';
  position: absolute;
  left: var(--date-column);
  top: 8px;
  bottom: 12px;
  width: 1px;
  background: var(--bookedz-border);
}
.event-timeline.is-refreshing {
  opacity: 0.55;
}

.date-group {
  display: grid;
  grid-template-columns: var(--date-column) minmax(0, 1fr);
  padding-bottom: 12px;
  animation: route-in var(--bookedz-motion-normal) var(--bookedz-ease) both;
}

.timeline-date {
  position: relative;
  padding: 7px 12px 0 0;
}

.timeline-date::after {
  content: '';
  position: absolute;
  top: 12px;
  right: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bookedz-control-border);
  box-shadow: 0 0 0 3px var(--bookedz-canvas);
}
.date-label,
.weekday {
  display: block;
}

.date-label {
  font-size: 13px;
  font-weight: 700;
}
.weekday {
  margin-top: 2px;
  font-size: 10px;
  color: var(--bookedz-muted);
}

.date-events {
  display: grid;
  gap: 8px;
  padding-left: 12px;
  min-width: 0;
}

.event-more {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 18px 0 8px;
  font-size: 12px;
  color: var(--bookedz-muted);
}
.empty-state,
.loading-state {
  padding: 28px 16px;
  border: 1px solid var(--bookedz-border);
  border-radius: 12px;
  background: var(--bookedz-surface);
  color: var(--bookedz-muted);
  font-size: 14px;
}

.empty-state h2 {
  color: var(--bookedz-ink);
  font-size: 18px;
}

.empty-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0 14px;
}

/* Desktop */
@media (min-width: 992px) {
  .discover-page {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: calc(100svh - var(--topbar-h, 0px));
    padding-bottom: 16px;
    overflow: hidden;
  }

  .discovery-workspace {
    flex: 1;
    min-height: 0;
  }

  .discovery-list {
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 14px 8px 12px;
    margin-left: -12px;
  }

  .discovery-map-column {
    position: static;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }

  .discovery-map-column > :first-child {
    flex: none;
  }

  .event-days {
    transition: opacity var(--bookedz-motion-fast) var(--bookedz-ease);
  }

  .event-days.is-refreshing {
    opacity: 0.55;
  }
}

/* Phones and tablets */
@media (max-width: 991px) {
  .discover-page {
    padding: 18px 12px 32px;
  }

  .discovery-toolbar {
    flex-wrap: wrap;
  }

  .category-shortcuts {
    flex-basis: 100%;
  }

  .results-tools {
    width: 100%;
    justify-content: space-between;
  }

  .discovery-workspace {
    display: block;
    min-width: 0;
  }

  .discovery-map-column {
    position: relative;
    top: auto;
  }

  .map-selected-card {
    margin-top: 12px;
  }

  .discovery-workspace[data-pane='list'] .discovery-map-column,
  .discovery-workspace[data-pane='map'] .discovery-list {
    display: none;
  }
}

@media (max-width: 575px) {
  .event-timeline {
    --date-column: 52px;
  }

  .date-events {
    padding-left: 10px;
  }

  .date-label {
    font-size: 12px;
  }

  .weekday {
    font-size: 10px;
  }

  .category-shortcut {
    padding-inline: 12px;
  }
}
</style>