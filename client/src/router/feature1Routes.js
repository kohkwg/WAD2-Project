// add these to your main router (src/router/index.js):
//
//   import { feature1routes } from './feature1routes'
//   const router = createrouter({
//     history: createwebhistory(),
//     routes: [ ...feature1routes, /* other features */ ],
//   })

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
