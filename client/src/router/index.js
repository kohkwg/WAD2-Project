import { createRouter, createWebHistory } from 'vue-router'
import { feature1Routes } from './feature1Routes'

export default createRouter({
  history: createWebHistory(),
  routes: [
    ...feature1Routes,
    // other features' routes go here
  ],
})
