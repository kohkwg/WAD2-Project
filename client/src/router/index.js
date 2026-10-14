import { createRouter, createWebHistory } from 'vue-router'
import EventsPlaceholderView from '../views/EventsPlaceholderView.vue'
import RsvpView from '../views/RsvpView.vue'
import MyRsvpsView from '../views/MyRsvpsView.vue'
import OrganiserEventsView from '../views/OrganiserEventsView.vue'
import CreateEventView from '../views/CreateEventView.vue'
import ManageRsvpsView from '../views/ManageRsvpsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/events' },
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

export default router