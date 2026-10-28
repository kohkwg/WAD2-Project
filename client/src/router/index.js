import { createRouter, createWebHistory } from 'vue-router'
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
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      // Discovery loads asynchronously. Restoring before its rows render clamps
      // the saved offset to the loading screen's height and loses the position.
      return new Promise(resolve => {
        let timer
        let frame
        const observer = new ResizeObserver(check)
        function finish(position) {
          observer.disconnect()
          clearTimeout(timer)
          cancelAnimationFrame(frame)
          resolve(position)
        }
        function check() {
          if (router.currentRoute.value.fullPath !== to.fullPath) return finish(false)
          if (document.documentElement.scrollHeight >= savedPosition.top + innerHeight - 1) {
            finish({ ...savedPosition, behavior: 'instant' })
          }
        }
        observer.observe(document.body)
        timer = setTimeout(() => finish(router.currentRoute.value.fullPath === to.fullPath ? { ...savedPosition, behavior: 'instant' } : false), 3000)
        frame = requestAnimationFrame(check)
      })
    }
    if (to.hash) {
      let id = to.hash.slice(1)
      try { id = decodeURIComponent(id) } catch { /* Keep malformed URL escapes literal. */ }
      const target = document.getElementById(id)
      if (target) return { el: target, behavior: 'instant' }
    }
    if (to.path !== from.path) return { top: 0, behavior: 'instant' }
    return false
  },
  routes: [
    { path: '/', redirect: '/discover' },
    { path: '/login', component: LoginView, meta: { title: 'Sign in' } },
    { path: '/events', redirect: to => ({ path: '/discover', query: to.query, hash: to.hash }) },
    { path: '/events/:id/rsvp', component: RsvpView, meta: { title: 'Event RSVP' } },
    { path: '/my-rsvps', component: MyRsvpsView, meta: { title: 'My RSVPs' } },
    { path: '/organiser/events', component: OrganiserEventsView, meta: { title: 'My events' } },
    { path: '/organiser/events/new', component: CreateEventView, meta: { title: 'Create event' } },
    { path: '/organiser/events/:id/rsvps', component: ManageRsvpsView, meta: { title: 'Manage RSVPs' } },
    { path: '/organiser/events/:id/manage', component: ManageEventView, meta: { title: 'Manage event' } },

    // Feature 1: public discovery (demo/live) and signed-in live profile (Aishani).
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

    // OpenJio planning: group hangouts, solo plans and invite links (F5–F7).
    { path: '/hangouts', component: () => import('../views/hangouts/HangoutsView.vue'), meta: { title: 'Hangouts' } },
    { path: '/hangouts/new', component: () => import('../views/hangouts/CreateHangoutView.vue'), meta: { title: 'New hangout' } },
    { path: '/hangouts/:id', component: () => import('../views/hangouts/HangoutView.vue'), meta: { title: 'Hangout' } },
    { path: '/join/:code', component: () => import('../views/hangouts/JoinHangoutView.vue'), meta: { title: 'Join hangout' } },

    // Any URL not listed above (e.g. a typo) goes back to /events
    { path: '/:pathMatch(.*)*', redirect: '/events' },
  ],
})

router.beforeEach(async (to) => {
  if (!USING_SUPABASE) return to.path === '/login' ? '/events' : true
  const user = await getCurrentUser()
  if (to.path === '/login') return user ? '/events' : true
  // Discovery and event pages stay public, except check-in pages that are marked requiresAuth
  if (!to.meta.requiresAuth && (to.path === '/discover' || to.path === '/events' || to.path.startsWith('/events/'))) return true
  if (!user) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

export default router
