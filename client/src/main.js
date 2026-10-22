import { createApp } from 'vue'
import VueKonva from 'vue-konva'

import App from './App.vue'
import router from './router'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

createApp(App).use(router).use(VueKonva).mount('#app')
