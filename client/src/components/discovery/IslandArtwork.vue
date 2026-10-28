<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import island from '@/assets/illustrations/singapore-animated-plate.webp'

// One coordinate system for the supplied artwork and its independent moving parts.
const props = defineProps({ paused: Boolean })
const emit = defineEmits(['load', 'error'])
const root = ref(null)
const visible = ref(false)
const tabVisible = ref(true)
const spokes = Array.from({ length: 18 }, (_, index) => {
  const angle = index * Math.PI / 9
  return { x: Math.cos(angle) * 44, y: Math.sin(angle) * 44 }
})
let observer
function updateVisibility() { tabVisible.value = !document.hidden }
onMounted(() => {
  updateVisibility()
  observer = new IntersectionObserver(([entry]) => { visible.value = entry.isIntersecting })
  observer.observe(root.value.ownerSVGElement)
  document.addEventListener('visibilitychange', updateVisibility)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  document.removeEventListener('visibilitychange', updateVisibility)
})
</script>

<template>
  <g ref="root" class="island-artwork" :data-motion-active="visible && tabVisible && !props.paused" aria-hidden="true" pointer-events="none">
    <image data-map-artwork :href="island" width="1200" height="900" preserveAspectRatio="xMidYMid meet" @load="emit('load')" @error="emit('error')" />
    <!-- Fixed supports stay in the plate; only the wheel and cabins move. -->
    <g transform="translate(862 516)">
      <g class="flyer-wheel" data-flyer-wheel>
        <circle r="44" fill="none" stroke="#7c91ec" stroke-width="3" />
        <circle r="41" fill="none" stroke="#fffdf5" stroke-width="1.5" />
        <g v-for="(point, index) in spokes" :key="index">
          <path :d="`M0 0L${point.x} ${point.y}`" stroke="#fffef3" stroke-width="1.1" />
          <g :transform="`translate(${point.x} ${point.y})`">
            <g class="flyer-cabin"><rect x="-3.5" y="-3" width="7" height="6" rx="2.5" fill="#6460ee" stroke="#fffef3" stroke-width="1" /><path d="M-2-1H2" stroke="#b8edff" stroke-width="1.5" /></g>
          </g>
        </g>
        <circle r="4" fill="#fffef4" stroke="#78a4dc" stroke-width="2" />
      </g>
    </g>
    <g transform="translate(895 808)">
      <g class="island-sailing-boat" data-sailing-boat>
        <path d="M16 9 49 23M21 16 56 32M15 19 36 29" fill="none" stroke="#e8fcff" stroke-width="2" stroke-linecap="round" opacity=".8" />
        <g class="boat-bob">
          <ellipse cy="10" rx="27" ry="7" fill="#087da2" opacity=".18" />
          <path d="M-27-7Q-8-13 21 9L27 17Q3 23-25-2Z" fill="#fffaf3" stroke="#92e5ef" stroke-width="1.3" />
          <path d="M-25-2Q0 15 26 16L20 21Q-7 17-25 2Z" fill="#224caf" />
          <path d="M-17-7-5-12 15 2 12 12-9 0Z" fill="#fffefa" />
          <path d="M-5-11 12 0 8 5-10-5Z" fill="#f16654" />
          <path d="M-13-3 7 9" stroke="#6598dd" stroke-width="3" />
        </g>
      </g>
    </g>
    <g transform="translate(76 240)"><g class="island-ferry" data-sailing-ferry><path d="M5 10Q-3 20-9 26M10 13Q3 24-3 29" fill="none" stroke="#e9fbff" stroke-width="1.2" opacity=".65"/><g transform="rotate(-36)"><path d="M-12 3Q0-7 12 3L8 8H-8Z" fill="#fefbf4"/><path d="M-7 3H7L5 7H-5Z" fill="#547ca7"/><path d="M-4-1H4V3H-4Z" fill="#e99365"/></g></g></g>
    <g transform="translate(970 146)"><g class="island-plane" data-flying-plane><g transform="rotate(180)"><path d="M-20 0-3-3 4-18 8-17 6-3 20 1 6 3 8 12 5 13-2 3-17 4Z" fill="#fffdf8" stroke="#75accc" stroke-width=".6"/><path d="M-20 1H17" stroke="#a3cfdf" stroke-width="1"/></g></g></g>
    <g class="island-seabirds" fill="none" stroke="#fffdf8" stroke-width="2" stroke-linecap="round">
      <g class="bird-wings"><path d="M925 167q7-4 12 3 3-9 10-8M947 184q5-3 9 2 2-6 7-6" /></g>
    </g>
  </g>
</template>

<style scoped>
.flyer-wheel { transform-box: fill-box; transform-origin: center; animation: flyer-turn 80s linear infinite; }
.flyer-cabin { transform-box: fill-box; transform-origin: center; animation: flyer-turn 80s linear infinite reverse; }
.island-sailing-boat { animation: island-sail 38s linear infinite; }
.island-ferry { animation: ferry-crossing 46s linear infinite; }
.island-plane { animation: plane-crossing 64s linear infinite; }
.bird-wings { transform-box: fill-box; transform-origin: center; animation: bird-glide 2.8s ease-in-out infinite; }
.boat-bob { animation: boat-bob 4s ease-in-out infinite alternate; transform-origin: center; }
.island-seabirds { animation: seabird-drift 14s ease-in-out infinite alternate; }
.island-artwork[data-motion-active=false] :is(.flyer-wheel,.flyer-cabin,.island-sailing-boat,.boat-bob,.island-seabirds,.island-ferry,.island-plane,.bird-wings) { animation-play-state: paused; }
@keyframes flyer-turn { to { transform: rotate(360deg); } }
@keyframes island-sail { 0% { opacity: 0; transform: translate(130px,70px); } 8% { opacity: 1; } 90% { opacity: 1; } 100% { opacity: 0; transform: translate(-35px,-20px); } }
@keyframes ferry-crossing { 0% { opacity: 0; transform: translate(-22px,52px); } 10%,85% { opacity: 1; } 100% { opacity: 0; transform: translate(30px,-48px); } }
@keyframes plane-crossing { 0% { opacity: 0; transform: translate(150px,18px) scale(.72); } 4%,25% { opacity: .85; } 30%,100% { opacity: 0; transform: translate(-520px,-64px) scale(.72); } }
@keyframes bird-glide { 0%,100% { transform: scaleY(.9); } 50% { transform: scaleY(1.06); } }
@keyframes boat-bob { from { transform: translateY(-.6px) rotate(-.5deg); } to { transform: translateY(.6px) rotate(.5deg); } }
@keyframes seabird-drift { to { transform: translate(30px,-9px); } }
@media(prefers-reduced-motion:reduce) { .island-artwork :is(.flyer-wheel,.flyer-cabin,.island-sailing-boat,.boat-bob,.island-seabirds,.island-ferry,.island-plane,.bird-wings) { animation: none; } }
</style>
