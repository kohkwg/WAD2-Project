<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

// a back link that returns to the page the person came from. `to` is only the fallback for when
// there is nothing behind us (a bookmark, a link opened in a new tab, a page refresh).
// it stays a real link, so open-in-new-tab and copy-address still work.


const props = defineProps({
  to: {
    type: [String, Object],
    required: true
  }
});

const router = useRouter();

const href = computed(() => router.resolve(props.to).href);

function go(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  // vue-router keeps the previous in-app location in history.state.back
  if (window.history.state?.back) router.back();else router.push(props.to);
}
</script>

<template>
  <a :href="href" @click="go">
    <slot />
  </a>
</template>
