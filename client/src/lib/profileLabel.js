import { ref } from 'vue';

// the signed-in person's saved username and name, shared so the sidebar updates the moment
// profile saves a change (instead of waiting for a reload).

export const profileLabel = ref({
  username: '',
  displayName: ''
});
