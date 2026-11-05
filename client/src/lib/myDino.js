// the signed-in user's chosen dino, shared by every avatar that can show "you".
import { ref, computed } from 'vue';
import { getCurrentUser, onAuthChange } from '@/utils/api';
import { dinoById } from '@/lib/dinos';

const me = ref(null); // { id, dino } or null

let started = false;

function start() {
  if (started) return;
  started = true;
  getCurrentUser().then(user => {
    me.value = user ? {
      id: user.id,
      dino: user.user_metadata?.dino
    } : null;
  }).catch(() => {});
  onAuthChange(user => {
    me.value = user ? {
      id: user.id,
      dino: user.user_metadata?.dino
    } : null;
  });
}

export function useMyDino() {
  start();
  const myId = computed(() => me.value?.id || null);
  const mySrc = computed(() => dinoById(me.value?.dino)?.src || '');
  // image for a person's avatar: only the signed-in user's own dino is known to the browser.
  const dinoFor = personId => personId && personId === me.value?.id ? mySrc.value : '';
  return {
    myId,
    mySrc,
    dinoFor
  };
}
