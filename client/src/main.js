import { createApp } from 'vue'
import VueKonva from 'vue-konva'

import App from './App.vue'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

createApp(App)
    .use(VueKonva)
    .mount('#app')