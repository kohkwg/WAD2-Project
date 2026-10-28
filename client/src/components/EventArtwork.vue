<script setup>
import { computed } from 'vue'

const props = defineProps({
  category: { type: String, default: '' },
})

const kind = computed(() => {
  const value = props.category.toLowerCase().replace(/[_-]/g, ' ')
  if (/sport|fitness|active|football|futsal/.test(value)) return 'sports'
  if (/music|concert|nightlife/.test(value)) return 'music'
  if (/food|dining|cook|culinary/.test(value)) return 'food'
  if (/art|culture|craft|photo|film|design/.test(value)) return 'arts'
  if (/tech|career|education|network|business|professional/.test(value)) return 'city'
  if (/outdoor|nature|wellness|community|social|volunteer/.test(value)) return 'garden'
  return 'festival'
})

const palette = computed(() => ({
  sports: { base: '#dceee3', deep: '#6eab83', light: '#fff9ef', accent: '#e9725c' },
  music: { base: '#fae1d8', deep: '#b85a46', light: '#fff9ef', accent: '#f3c65f' },
  food: { base: '#f6e8b8', deep: '#9d6745', light: '#fff9ef', accent: '#e9725c' },
  arts: { base: '#e6e2f2', deep: '#756d9c', light: '#fff9ef', accent: '#e9725c' },
  city: { base: '#dcebe8', deep: '#48756f', light: '#fff9ef', accent: '#efbb58' },
  garden: { base: '#dceee3', deep: '#628d65', light: '#fff9ef', accent: '#efbb58' },
  festival: { base: '#f8e6c0', deep: '#a66650', light: '#fff9ef', accent: '#7da78a' },
}[kind.value]))
</script>

<template>
  <svg class="event-artwork" viewBox="0 0 480 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <rect width="480" height="320" :fill="palette.base" />
    <circle cx="398" cy="56" r="83" :fill="palette.light" opacity=".72" />
    <path d="M0 252Q102 210 200 252T480 238V320H0Z" :fill="palette.deep" opacity=".18" />

    <g v-if="kind === 'sports'" fill="none" stroke-linecap="round">
      <path d="M0 80H480M0 240H480M145 0V320M335 0V320" stroke="white" stroke-width="5" opacity=".72" />
      <circle cx="240" cy="160" r="76" :stroke="palette.deep" stroke-width="5" opacity=".7" />
      <circle cx="240" cy="160" r="52" :fill="palette.light" :stroke="palette.deep" stroke-width="5" />
      <path d="m240 125 31 22-12 37h-38l-12-37Zm-31 22-28 8m90-8 28 8m-40 29 12 31m-50-31-12 31" :stroke="palette.deep" stroke-width="5" />
      <path d="M76 94 122 48l34 34-46 46Z" :fill="palette.accent" stroke="white" stroke-width="6" />
    </g>

    <g v-else-if="kind === 'music'">
      <path d="M0 236 78 183l57 28 65-86 68 58 65-98 74 71 73-50v214H0Z" :fill="palette.deep" opacity=".14" />
      <rect x="87" y="104" width="110" height="142" rx="14" :fill="palette.deep" />
      <circle cx="142" cy="176" r="34" :fill="palette.light" opacity=".94" />
      <circle cx="142" cy="176" r="12" :fill="palette.accent" />
      <circle cx="142" cy="224" r="8" :fill="palette.accent" />
      <path d="M276 98v112a29 29 0 1 1-17-27V122l94-22v87a29 29 0 1 1-17-27v-72Z" :fill="palette.accent" stroke="white" stroke-width="6" stroke-linejoin="round" />
      <path d="M55 86q-26 31 0 62m-24-75q-38 45 0 90" fill="none" :stroke="palette.deep" stroke-width="7" stroke-linecap="round" opacity=".55" />
    </g>

    <g v-else-if="kind === 'food'">
      <ellipse cx="244" cy="234" rx="145" ry="35" :fill="palette.deep" opacity=".17" />
      <path d="M104 142q7 121 136 121t136-121Z" :fill="palette.light" :stroke="palette.deep" stroke-width="8" />
      <ellipse cx="240" cy="143" rx="137" ry="49" :fill="palette.accent" :stroke="palette.deep" stroke-width="8" />
      <ellipse cx="240" cy="139" rx="94" ry="27" :fill="palette.light" opacity=".84" />
      <path d="M191 142q20-24 42 0t42 0m-18-41q-14-24 5-42m24 48q1-27 27-34" fill="none" :stroke="palette.deep" stroke-width="8" stroke-linecap="round" />
      <circle cx="198" cy="135" r="8" :fill="palette.deep" /><circle cx="277" cy="148" r="7" :fill="palette.deep" />
    </g>

    <g v-else-if="kind === 'arts'">
      <path d="M238 69c-81 0-143 53-143 121 0 47 32 76 76 76 23 0 35-18 35-35 0-14-14-21-14-36 0-17 17-28 39-28 46 0 69 27 91 27 35 0 55-30 55-60 0-37-56-65-139-65Z" :fill="palette.deep" />
      <circle cx="161" cy="151" r="15" :fill="palette.light" /><circle cx="208" cy="115" r="13" :fill="palette.accent" />
      <circle cx="270" cy="116" r="15" fill="#a8ddce" /><circle cx="321" cy="156" r="14" fill="#ffd976" />
      <path d="m286 206 88-82 25 25-82 89-37-32Z" :fill="palette.accent" stroke="white" stroke-width="7" stroke-linejoin="round" />
      <path d="m370 124 17-16q11-10 22 1l1 1q10 11 0 22l-16 17Z" :fill="palette.deep" />
    </g>

    <g v-else-if="kind === 'city'">
      <path d="M70 254V141l64-30v143Zm92 0V79l77 29v146Zm108 0V129l67-40v165Zm97 0V154l54-23v123Z" :fill="palette.deep" />
      <path d="M93 162h18m0 27H93m88-61h22m0 28h-22m0 28h22m0 28h-22m88-47h18m0 28h-18m89 4h18" stroke="white" stroke-width="8" stroke-linecap="round" opacity=".7" />
      <rect x="140" y="198" width="207" height="91" rx="15" :fill="palette.light" :stroke="palette.accent" stroke-width="8" />
      <path d="M184 229h92m-92 19h55" :stroke="palette.deep" stroke-width="8" stroke-linecap="round" opacity=".7" />
      <circle cx="318" cy="246" r="17" :fill="palette.accent" />
    </g>

    <g v-else-if="kind === 'garden'">
      <path d="M0 223q103-95 201-21t279-5v123H0Z" :fill="palette.deep" opacity=".34" />
      <path d="M65 239v-79m0-57-39 72h78Zm315 59V79m0-40-45 76h90Z" :fill="palette.deep" />
      <path d="M164 222q76-95 152 0" fill="none" :stroke="palette.accent" stroke-width="13" stroke-linecap="round" />
      <path d="m215 202 25 20 25-20" fill="none" :stroke="palette.deep" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="163" cy="113" r="28" :fill="palette.light" opacity=".8" />
      <path d="m147 113 12 12 22-27" fill="none" :stroke="palette.accent" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
    </g>

    <g v-else>
      <path d="M0 221 87 172l63 30 83-105 72 91 58-60 117 72v120H0Z" :fill="palette.deep" opacity=".42" />
      <path d="M35 246V133l49-29 49 29v113Zm284 0V124l57-34 57 34v122Z" :fill="palette.light" :stroke="palette.deep" stroke-width="7" />
      <path d="M52 151h18m28 0h18m-64 28h18m28 0h18m213-30h20m31 0h20m-71 29h20m31 0h20" :stroke="palette.accent" stroke-width="9" stroke-linecap="round" />
      <path d="m241 51 11 30 32 1-25 19 9 31-27-18-27 18 9-31-25-19 32-1Z" :fill="palette.accent" stroke="white" stroke-width="5" stroke-linejoin="round" />
    </g>
  </svg>
</template>

<style scoped>
.event-artwork { display: block; width: 100%; height: 100%; }
</style>
