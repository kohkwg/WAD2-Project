import { createApp } from 'vue'
import VueKonva from 'vue-konva'
import App from './App.vue'
import router from './router'

// Bootstrap: CSS for the styling, JS bundle for things like the navbar hamburger menu
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

// Our own small style tweaks go AFTER Bootstrap so they win when both set the same thing
import './assets/main.css'

const app = createApp(App) // 1. create the app first
app.use(router)            // 2. then switch on routing
app.use(VueKonva)          // Feature 6: Konva canvas for the floor plan editor
app.mount('#app')          // 3. then show it on the page