import { createRouter, createWebHistory } from 'vue-router';
import RsvpView from '../views/RsvpView.vue';
import MyRsvpsView from '../views/MyRsvpsView.vue';
import OrganiserEventsView from '../views/OrganiserEventsView.vue';
import ManageEventView from '../views/ManageEventView.vue';
import { USING_SUPABASE, getCurrentUser } from '../utils/api.js';
import { feature1Routes } from './feature1Routes';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      // discovery loads asynchronously. restoring before its rows render clamps
      // the saved offset to the loading screen's height and loses the position.
      return new Promise(resolve => {
        let timer;
        let frame;
        const observer = new ResizeObserver(check);
        function finish(position) {
          observer.disconnect();
          clearTimeout(timer);
          cancelAnimationFrame(frame);
          resolve(position);
        }
        function check() {
          if (router.currentRoute.value.fullPath !== to.fullPath) return finish(false);
          if (document.documentElement.scrollHeight >= savedPosition.top + innerHeight - 1) {
            finish({
              ...savedPosition,
              behavior: 'instant'
            });
          }
        }
        observer.observe(document.body);
        timer = setTimeout(() => finish(router.currentRoute.value.fullPath === to.fullPath ? {
          ...savedPosition,
          behavior: 'instant'
        } : false), 3000);
        frame = requestAnimationFrame(check);
      });
    }
    if (to.hash) {
      let id = to.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {/* keep malformed url escapes literal. */}
      const target = document.getElementById(id);
      if (target) return {
        el: target,
        behavior: 'instant'
      };
    }
    if (to.path === '/' || to.path !== from.path) return {
      top: 0,
      behavior: 'instant'
    };
    return false;
  },
  routes: [{
    path: '/',
    name: 'home',
    component: () => import('../views/LandingView.vue'),
    meta: {
      title: 'Welcome'
    }
  },
  // signing in happens on the landing page; /login links keep working
  {
    path: '/login',
    redirect: to => ({
      path: '/',
      query: to.query
    })
  },
  // opened from the password-reset email; public, because the link signs them in itself
  {
    path: '/reset-password',
    component: () => import('../views/ResetPasswordView.vue'),
    meta: {
      title: 'Reset password'
    }
  }, {
    path: '/events',
    redirect: to => ({
      path: '/discover',
      query: to.query,
      hash: to.hash
    })
  }, {
    path: '/events/:id/rsvp',
    component: RsvpView,
    meta: {
      title: 'Event RSVP'
    }
  }, {
    path: '/community',
    component: () => import('../views/CommunityView.vue'),
    meta: {
      title: 'Community'
    }
  }, {
    path: '/community/plan',
    redirect: '/community'
  }, {
    path: '/groups/:id',
    component: () => import('../views/GroupView.vue'),
    meta: {
      title: 'Group'
    }
  },
  // invite links: /g/<token> opens the group, private or public
  {
    path: '/g/:token',
    component: () => import('../views/GroupView.vue'),
    meta: {
      title: 'Group invite'
    }
  }, {
    path: '/my-rsvps',
    component: MyRsvpsView,
    meta: {
      title: 'Plans'
    }
  }, {
    path: '/organiser/events',
    component: OrganiserEventsView,
    meta: {
      title: 'Organise'
    }
  }, {
    path: '/organiser/events/new',
    component: () => import('../views/NewEventView.vue'),
    meta: {
      title: 'Create event'
    }
  }, {
    path: '/j/:token',
    redirect: to => `/g/${to.params.token}`
  },
  // the guest list now lives in manage event; older links keep their ?status filter
  {
    path: '/organiser/events/:id/rsvps',
    redirect: to => ({
      path: `/organiser/events/${to.params.id}/manage`,
      query: {
        ...to.query,
        tab: 'rsvps'
      }
    })
  }, {
    path: '/organiser/events/:id/manage',
    component: ManageEventView,
    meta: {
      title: 'Manage event'
    }
  },
  // editing moved into manage event; older links and bookmarks still land there
  {
    path: '/organiser/events/:id/edit',
    redirect: to => ({
      path: `/organiser/events/${to.params.id}/manage`,
      query: {
        tab: 'edit'
      }
    })
  },
  // feature 1: public discovery (demo/live) and signed-in live profile (aishani).
  ...feature1Routes,
  // feature 3: check-in (huxley). live supabase only; requiresauth even under /events.
  {
    path: '/events/:eventId/ticket',
    component: () => import('../views/checkin/MyTicketView.vue'),
    meta: {
      title: 'My ticket',
      requiresAuth: true
    }
  }, {
    path: '/events/:eventId/check-in',
    component: () => import('../views/checkin/SelfCheckInView.vue'),
    meta: {
      title: 'Check in',
      requiresAuth: true
    }
  }, {
    path: '/organiser/events/:eventId/check-in',
    component: () => import('../views/checkin/StaffStationView.vue'),
    meta: {
      title: 'Check-in station',
      requiresAuth: true
    }
  }, {
    path: '/organiser/events/:eventId/venue-qr',
    component: () => import('../views/checkin/VenueQrView.vue'),
    meta: {
      title: 'Venue QR',
      requiresAuth: true
    }
  }, {
    path: '/organiser/events/:eventId/attendance',
    component: () => import('../views/checkin/AttendanceDashboardView.vue'),
    meta: {
      title: 'Attendance',
      requiresAuth: true
    }
  },
  // feature 6: floor plan editor (vivienne). organisers edit, the event's team views;
  // participants see it read-only on the public event page. live supabase only.
  {
    path: '/organiser/events/:eventId/floor-plan',
    component: () => import('../editor.vue'),
    meta: {
      title: 'Floor plan',
      requiresAuth: true
    }
  },
  // any url not listed above (e.g. a typo) goes back to /events
  {
    path: '/:pathMatch(.*)*',
    redirect: '/events'
  }]
});
router.beforeEach(async to => {
  if (to.path === '/' || to.path === '/reset-password') return true;
  if (!USING_SUPABASE) return true;
  const user = await getCurrentUser();
  // discovery and event pages stay public, except check-in pages that are marked requiresauth
  if (!to.meta.requiresAuth && (to.path === '/discover' || to.path === '/community' || /^\/groups\/[^/]+\/?$/.test(to.path) || to.path === '/events' || to.path.startsWith('/events/'))) return true;
  if (!user) return {
    path: '/',
    query: {
      redirect: to.fullPath
    }
  };
  return true;
});
export default router;
