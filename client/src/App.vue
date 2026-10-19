<!-- <script setup>
import axios from 'axios'
import { ref } from 'vue'

const message = ref('Ready to build')

async function checkServer() {
  const response = await axios.get('http://127.0.0.1:3000/health')
  message.value = response.data.message
}
</script>

<template>
  <main class="container py-4">
    <h1>Vue Template</h1>
    <p>{{ message }}</p>
    <button class="btn btn-primary" type="button" @click="checkServer">
      Check Server
    </button>
  </main>
</template> -->


<script setup>
import Editor from './editor.vue'
</script>

<template>
  <Editor />
</template>