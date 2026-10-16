import { createRouter, createWebHistory } from 'vue-router'
import EventsPlaceholderView from '../views/EventsPlaceholderView.vue'
import RsvpView from '../views/RsvpView.vue'
import MyRsvpsView from '../views/MyRsvpsView.vue'
import OrganiserEventsView from '../views/OrganiserEventsView.vue'
import CreateEventView from '../views/CreateEventView.vue'
import ManageRsvpsView from '../views/ManageRsvpsView.vue'
import LoginView from '../views/LoginView.vue'
import { USING_SUPABASE, getCurrentUser } from '../utils/api.js'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/events' },
    { path: '/login', component: LoginView },
    { path: '/events', component: EventsPlaceholderView },
    { path: '/events/:id/rsvp', component: RsvpView },
    { path: '/my-rsvps', component: MyRsvpsView },
    { path: '/organiser/events', component: OrganiserEventsView },
    { path: '/organiser/events/new', component: CreateEventView },
    { path: '/organiser/events/:id/rsvps', component: ManageRsvpsView },

    // Any URL not listed above (e.g. a typo) goes back to /events
    { path: '/:pathMatch(.*)*', redirect: '/events' },
  ],
})

// Runs before every page change. Returning a path sends them there instead.
router.beforeEach(async (to) => {
  // Mock mode: Alex is always "logged in", so the login page isn't needed
  if (!USING_SUPABASE) return to.path === '/login' ? '/events' : true

  // Supabase mode: every page needs a signed-in user (the database rules use auth.uid())
  const user = await getCurrentUser()
  if (!user && to.path !== '/login') {
    return { path: '/login', query: { redirect: to.fullPath } } // come back here after sign-in
  }
  if (user && to.path === '/login') return '/events'
  return true
})

export default router
