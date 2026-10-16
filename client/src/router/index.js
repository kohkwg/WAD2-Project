import { createRouter, createWebHistory } from 'vue-router'
import EventsPlaceholderView from '../views/EventsPlaceholderView.vue'
import RsvpView from '../views/RsvpView.vue'
import MyRsvpsView from '../views/MyRsvpsView.vue'
import OrganiserEventsView from '../views/OrganiserEventsView.vue'
import CreateEventView from '../views/CreateEventView.vue'
import ManageRsvpsView from '../views/ManageRsvpsView.vue'
import ManageEventView from '../views/ManageEventView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/events' },
    { path: '/events', component: EventsPlaceholderView, meta: { title: 'Events' } },
    { path: '/events/:id/rsvp', component: RsvpView, meta: { title: 'Event RSVP' } },
    { path: '/my-rsvps', component: MyRsvpsView, meta: { title: 'My RSVPs' } },
    { path: '/organiser/events', component: OrganiserEventsView, meta: { title: 'My events' } },
    { path: '/organiser/events/new', component: CreateEventView, meta: { title: 'Create event' } },
    { path: '/organiser/events/:id/rsvps', component: ManageRsvpsView, meta: { title: 'Manage RSVPs' } },
    { path: '/organiser/events/:id/manage', component: ManageEventView, meta: { title: 'Manage event' } },

    // Any URL not listed above (e.g. a typo) goes back to /events
    { path: '/:pathMatch(.*)*', redirect: '/events' },
  ],
})

export default router
