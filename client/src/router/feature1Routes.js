// Add these to your main router (src/router/index.js):
//
//   import { feature1Routes } from './feature1Routes'
//   const router = createRouter({
//     history: createWebHistory(),
//     routes: [ ...feature1Routes, /* other features */ ],
//   })
export const feature1Routes = [
  { path: '/discover', name: 'discover', component: () => import('@/views/DiscoverView.vue'), meta: { title: 'Discover' } },
  { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { title: 'Profile' } },
]
