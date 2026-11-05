import { createApp } from 'vue';
import VueKonva from 'vue-konva';
import App from './App.vue';
import { initTheme } from './lib/theme.js';
import router from './router';
import { dismissibleNotice } from './directives/dismissibleNotice.js';
import './assets/notifications.css';

// bootstrap: css for the styling, js bundle for things like the navbar hamburger menu
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

// our own small style tweaks go after bootstrap so they win when both set the same thing
import './assets/main.css';
// shared hover, press and page motion; last so its transitions apply over every other stylesheet
import './assets/motion.css';

const stopTheme = initTheme();
if (import.meta.hot) import.meta.hot.dispose(stopTheme);

const app = createApp(App); // 1. create the app first
app.directive('dismissible', dismissibleNotice);
app.use(router); // 2. then switch on routing
app.use(VueKonva); // feature 6: konva canvas for the floor plan editor
app.mount('#app'); // 3. then show it on the page
