import { createRouter, createWebHistory } from 'vue-router'
import EventsPlaceholderView from '../views/EventsPlaceholderView.vue'
import RsvpView from '../views/RsvpView.vue'
import MyRsvpsView from '../views/MyRsvpsView.vue'
import OrganiserEventsView from '../views/OrganiserEventsView.vue'
import CreateEventView from '../views/CreateEventView.vue'
import ManageRsvpsView from '../views/ManageRsvpsView.vue'
import ManageEventView from '../views/ManageEventView.vue'
import LoginView from '../views/LoginView.vue'
import { USING_SUPABASE, getCurrentUser } from '../utils/api.js'
import { feature1Routes } from './feature1Routes'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/events' },
    { path: '/login', component: LoginView, meta: { title: 'Sign in' } },
    { path: '/events', component: EventsPlaceholderView, meta: { title: 'Events' } },
    { path: '/events/:id/rsvp', component: RsvpView, meta: { title: 'Event RSVP' } },
    { path: '/my-rsvps', component: MyRsvpsView, meta: { title: 'My RSVPs' } },
    { path: '/organiser/events', component: OrganiserEventsView, meta: { title: 'My events' } },
    { path: '/organiser/events/new', component: CreateEventView, meta: { title: 'Create event' } },
    { path: '/organiser/events/:id/rsvps', component: ManageRsvpsView, meta: { title: 'Manage RSVPs' } },
    { path: '/organiser/events/:id/manage', component: ManageEventView, meta: { title: 'Manage event' } },

    // Feature 1: discovery + profile (Aishani). Live Supabase only.
    ...feature1Routes,

    // Feature 3: check-in (Huxley). Live Supabase only; requiresAuth even under /events.
    {
      path: '/events/:eventId/ticket',
      component: () => import('../views/checkin/MyTicketView.vue'),
      meta: { title: 'My ticket', requiresAuth: true },
    },
    {
      path: '/events/:eventId/check-in',
      component: () => import('../views/checkin/SelfCheckInView.vue'),
      meta: { title: 'Check in', requiresAuth: true },
    },
    {
      path: '/organiser/events/:eventId/check-in',
      component: () => import('../views/checkin/StaffStationView.vue'),
      meta: { title: 'Check-in station', requiresAuth: true },
    },
    {
      path: '/organiser/events/:eventId/venue-qr',
      component: () => import('../views/checkin/VenueQrView.vue'),
      meta: { title: 'Venue QR', requiresAuth: true },
    },
    {
      path: '/organiser/events/:eventId/attendance',
      component: () => import('../views/checkin/AttendanceDashboardView.vue'),
      meta: { title: 'Attendance', requiresAuth: true },
    },

    // Feature 6: floor plan editor skeleton (Vivienne)
    { path: '/editor', component: () => import('../editor.vue'), meta: { title: 'Floor plan editor' } },

    // Any URL not listed above (e.g. a typo) goes back to /events
    { path: '/:pathMatch(.*)*', redirect: '/events' },
  ],
})

router.beforeEach(async (to) => {
  if (!USING_SUPABASE) return to.path === '/login' ? '/events' : true
  const user = await getCurrentUser()
  if (to.path === '/login') return user ? '/events' : true
  // Event pages stay public, except check-in pages that are marked requiresAuth
  if (!to.meta.requiresAuth && (to.path === '/events' || to.path.startsWith('/events/'))) return true
  if (!user) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

export default router
