<script setup>
// detailed boat hulls are painted into the background at these fixed positions.
// only the surrounding wake travels: no translating, bobbing or fading hulls.

const boats = [{
  name: 'cargo',
  x: 98,
  y: 603,
  angle: 25,
  stern: 61,
  length: 54,
  scale: 1
}, {
  name: 'ferry',
  x: 81,
  y: 104,
  angle: -22,
  stern: 25,
  length: 45,
  scale: .8
}, {
  name: 'coastal',
  x: 1040,
  y: 728,
  angle: -28,
  stern: 27,
  length: 57,
  scale: 1
}, {
  name: 'bay',
  x: 847,
  y: 648,
  angle: -8,
  stern: 21,
  length: 35,
  scale: .65
}];
</script>

<template>
  <g class="island-boat-wakes" data-boat-wakes>
    <g v-for="(boat, index) in boats" :key="boat.name" data-boat-anchor
      :data-boat="boat.name" :transform="`translate(${boat.x} ${boat.y}) rotate(${boat.angle})`">
      <g :transform="`translate(${-boat.stern} 0) scale(${boat.scale})`">
        <g class="wake-stream" :style="{ animationDelay: `${-index * .45}s` }">
          <path :d="`M0-4Q${-boat.length / 2}-8 ${-boat.length}-15`" />
          <path :d="`M0 4Q${-boat.length / 2} 8 ${-boat.length} 15`" />
          <path :d="`M-3 0Q${-boat.length / 2} 2 ${-boat.length + 9} 0`" />
        </g>
        <g class="wake-ripples" fill="none" stroke="#ecffff" stroke-width="1.1">
          <ellipse v-for="ripple in 3" :key="ripple" class="stern-ripple"
            rx="5" ry="3" :style="{ animationDelay: `${-ripple * 1.2 - index * .5}s` }" />
        </g>
      </g>
    </g>
  </g>
</template>

<style scoped>
.wake-stream {
  fill: none;
  stroke: #edffff;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-dasharray: 11 8 3 8;
  opacity: .65;
  animation: wake-flow 2.2s linear infinite;
  animation-play-state: var(--island-play-state, running);
}

.stern-ripple {
  opacity: 0;
  animation: stern-ripple 3.6s linear infinite;
  animation-play-state: var(--island-play-state, running);
}

@keyframes wake-flow {
  to {
    stroke-dashoffset: -60;
  }
}

@keyframes stern-ripple {
  0% {
    transform: translate(-3px, 0) scale(.4);
    opacity: 0;
  }
  15% {
    opacity: .55;
  }
  100% {
    transform: translate(-39px, 0) scale(2.4, 1.8);
    opacity: 0;
  }
}

@media(prefers-reduced-motion:reduce) {
  .wake-stream,.stern-ripple {
    animation: none;
  }
}
</style>
