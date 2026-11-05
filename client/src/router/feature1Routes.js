// Feature 1 routes. router/index.js adds these routes to the main route list.

export const feature1Routes = [{
  path: '/discover',
  name: 'discover',
  component: () => import('@/views/DiscoverView.vue'),
  meta: {
    title: 'Discover'
  }
}, {
  path: '/profile',
  name: 'profile',
  component: () => import('@/views/ProfileTabsView.vue'),
  meta: {
    title: 'Profile'
  }
}];
