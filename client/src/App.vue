<script setup>
import axios from 'axios'
import { ref } from 'vue'
import { RouterView } from 'vue-router'
import NavBar from './components/NavBar.vue'

const message = ref('Ready to build')

async function checkServer() {
  const response = await axios.get('http://127.0.0.1:3000/health')
  message.value = response.data.message
}
</script>

<template>
  <NavBar />
  <main class="container py-4">
    <RouterView />
    <p>{{ message }}</p>
    <button class="btn btn-primary" type="button" @click="checkServer">
      Check Server
    </button>
  </main>
</template>
