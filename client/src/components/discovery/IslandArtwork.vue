<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import island from '@/assets/illustrations/singapore-anchored-boats-plate.webp';
import IslandWater from './IslandWater.vue';
import IslandBoats from './IslandBoats.vue';

// one coordinate system for the supplied artwork and its independent moving parts.

const props = defineProps({
  paused: Boolean
});

const emit = defineEmits(['load', 'error']);

const root = ref(null);

const visible = ref(false);

const tabVisible = ref(true);

const spokes = Array.from({
  length: 18
}, (_, index) => {
  const angle = index * Math.PI / 9;
  return {
    x: Math.cos(angle) * 44,
    y: Math.sin(angle) * 44
  };
});

let observer;

function updateVisibility() {
  tabVisible.value = !document.hidden;
}

onMounted(() => {
  updateVisibility();
  observer = new IntersectionObserver(([entry]) => {
    visible.value = entry.isIntersecting;
  });
  observer.observe(root.value.ownerSVGElement);
  document.addEventListener('visibilitychange', updateVisibility);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  document.removeEventListener('visibilitychange', updateVisibility);
});
</script>

<template>
  <g
  ref="root"
  class="island-artwork"
  :data-motion-active="visible && tabVisible && !props.paused"
  aria-hidden="true"
  pointer-events="none">
    <image
    data-map-artwork
    :href="island"
    width="1200"
    height="900"
    preserveAspectRatio="xMidYMid meet"
    @load="emit('load')"
    @error="emit('error')" />
    <IslandWater />
    <!-- fixed supports stay in the plate; only the wheel and cabins move. -->
    <g transform="translate(1010 525)">
      <g class="flyer-wheel" data-flyer-wheel>
        <circle r="44" fill="none" stroke="#7c91ec" stroke-width="3" />
        <circle r="41" fill="none" stroke="#fffdf5" stroke-width="1.5" />
        <g v-for="(point, index) in spokes" :key="index">
          <path :d="`M0 0L${point.x} ${point.y}`" stroke="#fffef3" stroke-width="1.1" />
          <g :transform="`translate(${point.x} ${point.y})`">
            <g class="flyer-cabin">
            <rect x="-3.5" y="-3" width="7" height="6" rx="2.5" fill="#6460ee" stroke="#fffef3" stroke-width="1" />
            <path d="M-2-1H2" stroke="#b8edff" stroke-width="1.5" /></g>
          </g>
        </g>
        <circle r="4" fill="#fffef4" stroke="#78a4dc" stroke-width="2" />
      </g>
    </g>
    <IslandBoats />
    <g transform="translate(1070 295)">
    <g class="island-plane" data-flying-plane>
      <g transform="rotate(180)">
        <path
          d="M-20 0-3-3 4-18 8-17 6-3 20 1 6 3 8 12 5 13-2 3-17 4Z"
          fill="#fffdf8"
          stroke="#75accc"
          stroke-width=".6"/>
        <path d="M-20 1H17" stroke="#a3cfdf" stroke-width="1"/></g></g></g>
    <g transform="translate(100 -130)">
      <g class="island-seabirds" fill="none" stroke="#fffdf8" stroke-width="2" stroke-linecap="round">
        <g class="bird-wings">
        <path d="M925 167q7-4 12 3 3-9 10-8M947 184q5-3 9 2 2-6 7-6" /></g>
      </g>
    </g>
  </g>
</template>

<style scoped>
.island-artwork {
  --island-play-state: running;
}

.island-artwork[data-motion-active=false] {
  --island-play-state: paused;
}

.flyer-wheel {
  transform-box: fill-box;
  transform-origin: center;
  animation: flyer-turn 48s linear infinite;
}

.flyer-cabin {
  transform-box: fill-box;
  transform-origin: center;
  animation: flyer-turn 48s linear infinite reverse;
}

.island-plane {
  animation: plane-crossing 64s linear infinite;
}

.bird-wings {
  transform-box: fill-box;
  transform-origin: center;
  animation: bird-glide 2.8s ease-in-out infinite;
}

.island-seabirds {
  animation: seabird-drift 14s ease-in-out infinite alternate;
}

.island-artwork[data-motion-active=false] :is(.flyer-wheel,.flyer-cabin,.island-seabirds,.island-plane,.bird-wings) {
  animation-play-state: paused;
}

@keyframes flyer-turn {
  to {
    transform: rotate(360deg);
  }
}

@keyframes plane-crossing {
  0% {
    opacity: 0;
    transform: translate(150px,18px) scale(.72);
  }
  4%,25% {
    opacity: .85;
  }
  30%,100% {
    opacity: 0;
    transform: translate(-520px,-64px) scale(.72);
  }
}

@keyframes bird-glide {
  0%,100% {
    transform: scaleY(.9);
  }
  50% {
    transform: scaleY(1.06);
  }
}

@keyframes seabird-drift {
  to {
    transform: translate(30px,-9px);
  }
}

@media(prefers-reduced-motion:reduce) {
  .island-artwork :is(.flyer-wheel,.flyer-cabin,.island-seabirds,.island-plane,.bird-wings) {
    animation: none;
  }
}
</style>
