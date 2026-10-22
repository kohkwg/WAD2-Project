// BOILERPLATE: minimal router for Feature 3 while we work off main.
// When Denzel's shell is merged, copy these route entries into his router.
import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/utils/supabase'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: () => import('@/views/DevLoginView.vue'), meta: { title: 'Sign in' } },

    // Feature 3: participant
    {
      path: '/events/:eventId/ticket',
      component: () => import('@/views/checkin/MyTicketView.vue'),
      meta: { title: 'My ticket', requiresAuth: true },
    },
    {
      path: '/events/:eventId/check-in',
      component: () => import('@/views/checkin/SelfCheckInView.vue'),
      meta: { title: 'Check in', requiresAuth: true },
    },

    // Feature 3: staff / organiser
    {
      path: '/organiser/events/:eventId/check-in',
      component: () => import('@/views/checkin/StaffStationView.vue'),
      meta: { title: 'Check-in station', requiresAuth: true },
    },
    {
      path: '/organiser/events/:eventId/venue-qr',
      component: () => import('@/views/checkin/VenueQrView.vue'),
      meta: { title: 'Venue QR', requiresAuth: true },
    },
    {
      path: '/organiser/events/:eventId/attendance',
      component: () => import('@/views/checkin/AttendanceDashboardView.vue'),
      meta: { title: 'Attendance', requiresAuth: true },
    },

    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})

// Signed-out users go to /login and come back afterwards. This matters for the
// venue QR: a phone camera opens /events/<id>/check-in?s=..., and we must not lose ?s=.
router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  const { data } = await supabase.auth.getSession()
  return data.session ? true : { path: '/login', query: { redirect: to.fullPath } }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Bookedz` : 'Bookedz'
})

export default router
