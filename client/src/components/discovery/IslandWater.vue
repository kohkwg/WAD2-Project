<script setup>
// Small authored patches of open water, never an animated filter on the terrain.
// Each local wave travels only a few artwork pixels within its water patch.
const patches = [
  { x: 70, y: 585, sx: 1.1, sy: .6 },
  { x: 95, y: 640, sx: 1.2, sy: .65 },
  { x: 75, y: 117, sx: .7, sy: .5 },
  { x: 790, y: 650, sx: 1.4, sy: .36 },
  { x: 910, y: 635, sx: .8, sy: .4 },
  { x: 1110, y: 660, sx: .8, sy: .7 },
  { x: 1010, y: 745, sx: .9, sy: .7 },
  { x: 1000, y: 800, sx: 1.4, sy: .7 },
  { x: 910, y: 850, sx: 1.1, sy: .6 },
  { x: 505, y: 872, sx: 1.3, sy: .35 },
]
</script>

<template>
  <g class="island-water" data-water-motion fill="none" stroke-linecap="round">
    <g v-for="(patch, index) in patches" :key="index"
      :transform="`translate(${patch.x} ${patch.y}) scale(${patch.sx} ${patch.sy})`">
      <g class="water-current" :style="{ animationDelay: `${-index * 1.3}s` }">
        <path d="M-31-12q9-4 18 0t18 0M-15 2q10-4 20 0t20 0M-37 17q8-3 16 0t16 0"
          stroke="#e5ffff" stroke-width="1.6" />
        <path class="water-glint" d="M-21-5h9m17 16h12m-42 13h8"
          stroke="#f6ffff" stroke-width="2" :style="{ animationDelay: `${-index * .7}s` }" />
      </g>
    </g>
    <g class="shore-wash">
      <path d="M654 653q76 20 151 8t145-19" />
      <path d="M350 839q64 31 140 36t136-3" />
      <path d="M1012 747q35-4 59-24t30-49" />
    </g>
  </g>
</template>

<style scoped>
.water-current {
  opacity: .45; animation: water-drift 5s ease-in-out infinite;
  animation-play-state: var(--island-play-state, running);
}
.water-glint {
  opacity: .4; animation: water-sparkle 3.6s ease-in-out infinite;
  animation-play-state: var(--island-play-state, running);
}
.shore-wash {
  stroke: #e3ffff; stroke-width: 1.8; stroke-dasharray: 15 12 5 15;
  opacity: .5; animation: shoreline-flow 7s linear infinite;
  animation-play-state: var(--island-play-state, running);
}
@keyframes water-drift {
  0% { transform: translate(-9px, -2px); opacity: .12; }
  45% { opacity: .62; }
  100% { transform: translate(10px, 3px); opacity: .12; }
}
@keyframes water-sparkle { 0%,100% { opacity: .15; } 50% { opacity: .7; } }
@keyframes shoreline-flow { to { stroke-dashoffset: -94; } }
@media(prefers-reduced-motion:reduce) {
  .water-current,.water-glint,.shore-wash { animation: none; }
}
</style>
