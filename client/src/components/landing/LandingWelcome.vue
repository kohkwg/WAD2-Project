<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { animate } from 'motion-v';
import LoginView from '../../views/LoginView.vue';
import LandingNextUp from './LandingNextUp.vue';
import { useLandingMotion } from '../../composables/useLandingMotion.js';
import { dinoById } from '../../lib/dinos.js';

const emit = defineEmits(['signed-in']);

const authMode = ref('signin');

const route = useRoute();

const welcome = ref(null);

const join = ref(null);

const accountForm = ref(null);
useLandingMotion(welcome);

/** Show the sign-in or sign-up form, scroll to it and move focus to its first field. */
async function openAccount(mode) {
  authMode.value = mode;
  await nextTick();
  accountForm.value?.setMode(mode);
  await nextTick();
  const card = join.value?.querySelector('.auth-card') || join.value;
  if (card) {
    const nav = document.querySelector('.welcome-nav');
    const topInset = (nav ? nav.getBoundingClientRect().bottom : 0) + 16;
    const room = window.innerHeight - topInset - 16;
    const rect = card.getBoundingClientRect();
    // Centre the whole card in the visible area below the sticky nav;
    // if it is taller than that, align its top just under the nav.
    const offset = rect.height < room ? (room - rect.height) / 2 : 0;
    window.scrollTo({
      top: window.scrollY + rect.top - topInset - offset,
      behavior: 'instant'
    });
  }
  join.value?.querySelector(mode === 'signup' ? '#name' : '#email')?.focus({
    preventScroll: true
  });
}

onMounted(() => {
  if (route.hash === '#join-dino') openAccount('signin');
});

watch(() => route.hash, hash => {
  if (hash === '#join-dino') openAccount('signin');
});

const features = [{
  number: '01',
  title: 'Find your kind of thing.',
  text: 'Workshops, music, art or a little adventure. Explore events across Singapore, browse the map and save the ones that catch your eye.',
  dino: 'wondering',
  tag: 'Discover',
  tone: 'peach'
}, {
  number: '02',
  title: 'Good plans. Great company.',
  text: 'Find friends by username, start a Go together group and make meeting up part of the fun.',
  dino: 'hearts',
  tag: 'Go together',
  tone: 'mint'
}, {
  number: '03',
  title: 'A little less organising.',
  text: 'Create an event, bring in co-organisers and keep RSVPs, tasks, budgets and check-in in one place.',
  dino: 'laptop',
  tag: 'Host an event',
  tone: 'yellow'
}];

const friends = [{
  dino: 'flower',
  side: 'friend-one'
}, {
  dino: 'hearts',
  side: 'friend-two'
}];

// the nav pill follows whichever section is in the middle of the screen

const sections = [{
  id: 'what-is-dino',
  label: 'Meet Dino'
}, {
  id: 'how-it-works',
  label: 'How it works'
}];

const activeSection = ref('');

const navLinks = new Map();

const pill = ref({
  x: 0,
  width: 0
});

function placePill() {
  const link = navLinks.get(activeSection.value);
  if (link?.offsetWidth) pill.value = {
    x: link.offsetLeft,
    width: link.offsetWidth
  };
}

watch(activeSection, () => nextTick(placePill));

let sectionObserver;

onMounted(() => {
  const inView = new Set();
  sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? inView.add(entry.target.id) : inView.delete(entry.target.id));
    activeSection.value = sections.map(section => section.id).filter(id => inView.has(id)).pop() || '';
  }, {
    // This margin leaves a thin band near the middle of the screen. A section in the band is active.
    rootMargin: '-40% 0px -55% 0px'
  });
  sections.forEach(section => {
    const element = document.getElementById(section.id);
    if (element) sectionObserver.observe(element);
  });
  addEventListener('resize', placePill);
});

onBeforeUnmount(() => {
  sectionObserver?.disconnect();
  removeEventListener('resize', placePill);
});

// a pointer-only easter egg: tap a hero dino and it hops and says hi (motion for vue)

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function hop(event) {
  const dino = event.currentTarget.querySelector('img');
  const bubble = event.currentTarget.querySelector('.dino-hi');
  animate(bubble, {
    opacity: [0, 1, 1, 0],
    scale: reducedMotion.matches ? 1 : [.6, 1.08, 1, .9]
  }, {
    duration: 1.3,
    times: [0, .15, .8, 1]
  });
  if (reducedMotion.matches) return;
  animate(dino, {
    y: [0, -44, 0, -12, 0],
    scaleX: [1, .9, 1.12, .96, 1],
    scaleY: [1, 1.12, .84, 1.04, 1]
  }, {
    duration: .75,
    ease: 'easeOut'
  });
}
</script>

<template>
  <div ref="welcome" class="welcome">
    <nav class="welcome-nav" aria-label="About Dino">
      <span
      class="nav-pill"
      :class="{ 'is-visible': activeSection && pill.width }"
      :style="{ translate: `${pill.x}px 0`, width: `${pill.width}px` }"
      aria-hidden="true"></span>
      <a
      v-for="section in sections"
      :key="section.id"
      :ref="element => navLinks.set(section.id, element)"
      :href="`#${section.id}`"
      :class="{ 'is-active': activeSection === section.id }"
      :aria-current="activeSection === section.id ? 'location' : undefined">{{ section.label }}</a>
      <div class="welcome-account-actions">
      <button type="button" class="welcome-login" @click="openAccount('signin')">Log in</button>
      <button
        type="button"
        class="btn btn-primary"
        @click="openAccount('signup')">Sign up <span aria-hidden="true">↗</span></button></div>
    </nav>

    <section class="welcome-hero" aria-labelledby="welcome-title">
      <p class="welcome-eyebrow">
      <span aria-hidden="true">✳</span> A little island. A lot to discover.</p>
      <h1 id="welcome-title">Less “what’s the plan?”<br>More <span class="title-accent">“see you there.”<svg
          class="title-squiggle"
          viewBox="0 0 300 24"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false">
          <path d="M6 15C52 5 88 21 136 12S226 4 294 14" /></svg></span></h1>
      <p class="welcome-intro" data-landing-intro>Meet Dino, your home for finding things to do, finding your people, and bringing good plans to life in Singapore.</p>
      <div class="welcome-hero-actions" data-landing-intro>
      <RouterLink to="/discover" class="btn btn-primary">Explore events <span aria-hidden="true">↗</span></RouterLink>
      <button
        type="button"
        class="welcome-text-button"
        @click="openAccount('signup')">Make yourself at home <span aria-hidden="true">→</span></button></div>
      <p class="welcome-small" data-landing-intro>Take a look around. You can browse events without an account.</p>
      <div class="welcome-scene" aria-label="An illustration of making plans with Dino">
        <div class="scene-note note-one">
        <span aria-hidden="true">✦</span> A plan worth leaving home for</div>
        <LandingNextUp />
        <div
        v-for="friend in friends"
        :key="friend.dino"
        class="scene-friend"
        :class="friend.side"
        aria-hidden="true">
          <div class="dino-hop" @click="hop">
          <img :src="dinoById(friend.dino).src" alt="">
          <span class="dino-hi">hi!</span></div>
        </div>
        <div class="scene-note note-two">
        <span class="scene-dot" aria-hidden="true"></span> Better with your people</div>
        <span class="scene-orbit" aria-hidden="true"></span>
      </div>
    </section>

    <section id="what-is-dino" class="welcome-features" aria-labelledby="welcome-features-title">
      <div class="welcome-section-head" data-landing-reveal>
      <p class="welcome-eyebrow">A PLACE FOR YOUR PLANS</p>
      <h2 id="welcome-features-title">Your next good day<br>starts with a little curiosity.</h2>
      <p>From “that looks fun” to “let’s go together,” Dino keeps the good bits in one place.</p></div>
      <div class="welcome-feature-grid">
      <article
        v-for="feature in features"
        :key="feature.number"
        class="welcome-feature"
        :class="`feature-${feature.tone}`">
        <div class="feature-top">
          <span>{{ feature.number }} / {{ feature.tag }}</span>
          <span class="feature-arrow" aria-hidden="true">↗</span></div>
        <img :src="dinoById(feature.dino).src" alt="" aria-hidden="true">
        <h3>{{ feature.title }}</h3>
        <p>{{ feature.text }}</p></article></div>
    </section>

    <section id="how-it-works" class="welcome-how" aria-labelledby="welcome-how-title">
      <div class="welcome-how-intro" data-landing-reveal>
      <p class="welcome-eyebrow">FROM MAYBE TO MEMORIES</p>
      <h2 id="welcome-how-title">A plan in three<br>little steps.</h2>
      <img :src="dinoById('scarf').src" alt="" aria-hidden="true"></div>
      <ol class="welcome-steps">
      <li>
        <span>01</span>
        <div>
          <h3>Find your spark.</h3>
          <p>Browse by interest or explore the map. Save an event for later if you’re still deciding.</p></div></li>
      <li>
        <span>02</span>
        <div>
          <h3>Make it a plan.</h3>
          <p>Create an account to RSVP, keep track of your tickets and see your upcoming plans.</p></div></li>
      <li>
        <span>03</span>
        <div>
          <h3>Bring your people.</h3>
          <p>Add friends and start a group heading to the event. A first time feels better together.</p></div></li></ol>
    </section>

    <section class="welcome-host" aria-labelledby="welcome-host-title">
    <div data-landing-reveal>
      <p class="welcome-eyebrow">GOT SOMETHING IN MIND?</p>
      <h2 id="welcome-host-title">Big idea.<br>Small gathering.<br>Make it happen.</h2>
      <p>Run a workshop, organise a meetup or share something you love. Invite your co-organisers and give every detail a home.</p>
      <button
        type="button"
        class="btn btn-primary"
        @click="openAccount('signup')">Start your next chapter <span aria-hidden="true">↗</span></button></div>
    <div class="host-notes" aria-label="Event planning tools">
      <img :src="dinoById('laptop').src" alt="A dino with a laptop">
      <span>
        <span class="host-check" aria-hidden="true">✓</span> RSVPs &amp; waitlists</span>
      <span>
        <span class="host-check" aria-hidden="true">✓</span> Your organising team</span>
      <span>
        <span class="host-check" aria-hidden="true">✓</span> Tasks &amp; budgets</span>
      <span>
        <span class="host-check" aria-hidden="true">✓</span> Floor plans &amp; check-in</span></div></section>

    <section
    id="join-dino"
    ref="join"
    class="welcome-join"
    aria-labelledby="welcome-join-title">
    <div class="join-copy" data-landing-reveal>
      <p class="welcome-eyebrow">THERE’S ROOM FOR YOU HERE</p>
      <h2 id="welcome-join-title">New plans.<br>New people.<br>
        <span>Your kind of Dino.</span></h2>
      <p>Pick your interests, choose your dino and make a little room for something new.</p>
      <div class="join-dinos" aria-hidden="true">
        <img :src="dinoById('donut').src" alt="">
        <img :src="dinoById('gift').src" alt="">
        <img :src="dinoById('berry').src" alt=""></div></div>
    <LoginView ref="accountForm" embedded :initial-mode="authMode" @signed-in="emit('signed-in')" /></section>
  </div>
</template>

<style scoped>
.welcome {
  max-width: 1360px;
  margin: 0 auto;
  color: var(--dino-ink);
}

.welcome-nav {
  position: sticky;
  top: calc(var(--topbar-h, 0px) + .75rem);
  z-index: 1010;
  display: flex;
  align-items: center;
  gap: 1.75rem;
  margin-top: .75rem;
  padding: .45rem .6rem .45rem 1.5rem;
  border: 1px solid var(--dino-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dino-surface) 82%, transparent);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  box-shadow: 0 6px 22px rgba(0,0,0,.06);
  transition: padding var(--dino-motion-normal) var(--dino-ease), box-shadow var(--dino-motion-normal) var(--dino-ease), background-color var(--dino-motion-normal) var(--dino-ease);
}

.welcome-nav.is-scrolled {
  padding-top: .3rem;
  padding-bottom: .3rem;
  background: color-mix(in srgb, var(--dino-surface) 92%, transparent);
  box-shadow: 0 12px 32px rgba(0,0,0,.13);
}

.nav-pill {
  position: absolute;
  left: 0;
  top: 50%;
  height: 36px;
  margin: -18px 0 0 -14px;
  padding: 0 14px;
  box-sizing: content-box;
  border-radius: 999px;
  background: var(--dino-orange-soft);
  opacity: 0;
  pointer-events: none;
  transition: translate var(--dino-motion-reveal) var(--dino-ease-stamp), width var(--dino-motion-reveal) var(--dino-ease-stamp), opacity var(--dino-motion-normal) var(--dino-ease);
}

.nav-pill.is-visible {
  opacity: 1;
}

.welcome-nav>a,.welcome-login {
  color: var(--dino-ink);
  font-size: .9rem;
  font-weight: 600;
  text-decoration: none;
}

.welcome-nav>a {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 44px;
  transition: color var(--dino-motion-fast) var(--dino-ease);
}

.welcome-nav>a.is-active {
  color: var(--dino-primary-dark);
}

.welcome-account-actions {
  margin-left: auto;
  display: flex;
  gap: 1.25rem;
  align-items: center;
}

.welcome button {
  cursor: pointer;
}

.welcome-login,.welcome-text-button {
  background: none;
  border: 0;
  min-height: 44px;
}

.welcome .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 48px;
  padding: .8rem 1.4rem;
  border-radius: 999px;
  font-weight: 650;
}

.welcome-hero {
  text-align: center;
  padding: clamp(3rem,6vw,6rem) 0 1rem;
  overflow: hidden;
}

.welcome-eyebrow {
  font-size: .76rem;
  letter-spacing: .1em;
  font-weight: 750;
  margin-bottom: 1.25rem;
}

.welcome-eyebrow>span {
  display: inline-block;
  color: var(--dino-primary);
  margin-right: .5rem;
}

.welcome h1 {
  font: 750 clamp(2.6rem,5.8vw,5.5rem)/1.06 var(--dino-heading);
  letter-spacing: -.055em;
  margin: 0;
}

.welcome h1 span,.join-copy h2 span {
  color: var(--dino-primary-dark);
}

.title-accent {
  position: relative;
  white-space: nowrap;
}

.title-squiggle {
  position: absolute;
  left: .1em;
  right: .1em;
  bottom: -.16em;
  width: calc(100% - .2em);
  height: .26em;
  overflow: visible;
  pointer-events: none;
}

.title-squiggle path {
  fill: none;
  stroke: var(--dino-primary);
  stroke-width: 5;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.welcome-intro {
  max-width: 54ch;
  margin: 1.5rem auto;
  color: var(--dino-muted);
  font-size: 1.12rem;
  line-height: 1.7;
}

.welcome-hero-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
}

.welcome-text-button {
  color: var(--dino-ink);
  font-weight: 650;
}

.welcome-text-button span {
  display: inline-block;
  transition: translate var(--dino-motion-normal) var(--dino-ease-stamp);
}

.welcome-text-button:hover span {
  translate: 4px 0;
}

.welcome-small {
  color: var(--dino-muted);
  font-size: .82rem;
  margin-top: 1rem;
}

.welcome-scene {
  position: relative;
  isolation: isolate;
  width: min(100%,900px);
  height: 430px;
  margin: 2rem auto 0;
}

.scene-orbit {
  position: absolute;
  z-index: -1;
  width: 90%;
  height: 60%;
  border-radius: 50%;
  bottom: 1rem;
  left: 5%;
  background: radial-gradient(ellipse,var(--dino-mint),transparent 68%);
  opacity: .55;
}

.next-up {
  position: absolute;
  left: 50%;
  top: 30px;
  width: 290px;
  translate: -50% 0;
}

.scene-friend {
  position: absolute;
  width: 190px;
  height: 220px;
  bottom: 20px;
}

.dino-hop {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.dino-hop img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: 50% 100%;
  user-select: none;
  -webkit-user-drag: none;
}

.dino-hi {
  position: absolute;
  top: 6%;
  left: 50%;
  translate: -50% 0;
  padding: .25rem .65rem;
  border: 2px solid var(--dino-ink);
  border-radius: 14px 14px 14px 4px;
  background: var(--dino-surface);
  color: var(--dino-ink);
  font: 750 .85rem var(--dino-heading);
  opacity: 0;
  pointer-events: none;
}

.friend-one {
  left: 7%;
  rotate: -10deg;
}

.friend-two {
  right: 7%;
  rotate: 12deg;
}

.scene-note {
  position: absolute;
  z-index: 2;
  padding: .8rem 1rem;
  border: 1px solid var(--dino-border);
  border-radius: 12px;
  background: var(--dino-surface);
  font-size: .85rem;
  box-shadow: 0 6px 18px #00000009;
}

.note-one {
  left: 3%;
  top: 55px;
  rotate: -6deg;
}

.note-one>span {
  color: var(--dino-primary-dark);
  margin-right: .4rem;
}

.note-two {
  right: 1%;
  top: 110px;
  rotate: 6deg;
}

.scene-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dino-success);
  margin-right: .4rem;
}

.welcome-features,.welcome-how,.welcome-host,.welcome-join {
  margin-top: clamp(3rem,7vw,7rem);
  scroll-margin-top: calc(var(--topbar-h, 0px) + 110px);
}

.welcome-section-head {
  text-align: center;
  max-width: 680px;
  margin: 0 auto 2.5rem;
}

.welcome h2 {
  font: 700 clamp(2rem,3.6vw,3.3rem)/1.12 var(--dino-heading);
  letter-spacing: -.04em;
  margin: 0 0 1.2rem;
}

.welcome-section-head>p:last-child,.welcome-feature>p,.welcome-steps p,.welcome-host p:not(.welcome-eyebrow),.join-copy>p:last-of-type {
  color: var(--dino-muted);
  line-height: 1.7;
}

.welcome-feature-grid {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: 1.25rem;
}

.welcome-feature {
  border: 1px solid var(--dino-border);
  border-radius: 24px;
  padding: 1.7rem;
  background: var(--dino-surface);
  min-width: 0;
}

.feature-peach {
  background: color-mix(in srgb,var(--dino-peach) 40%,var(--dino-surface));
}

.feature-mint {
  background: color-mix(in srgb,var(--dino-mint) 30%,var(--dino-surface));
}

.feature-yellow {
  background: color-mix(in srgb,var(--dino-yellow) 30%,var(--dino-surface));
}

.feature-top {
  display: flex;
  justify-content: space-between;
  font-size: .73rem;
  font-weight: 650;
}

.feature-arrow {
  display: inline-block;
}

.welcome-feature img {
  display: block;
  height: 150px;
  width: 100%;
  object-fit: contain;
  margin: 1.5rem 0;
}

.welcome h3 {
  font: 650 1.3rem/1.25 var(--dino-heading);
  letter-spacing: -.025em;
}

.welcome-feature>p {
  font-size: .94rem;
  margin: 1rem 0 0;
}

@media (hover:hover) and (pointer:fine) {
  .welcome-feature {
    transition: translate var(--dino-motion-normal) var(--dino-ease), rotate var(--dino-motion-normal) var(--dino-ease), box-shadow var(--dino-motion-normal) var(--dino-ease);
  }
  .welcome-feature img,.feature-arrow {
    transition: translate var(--dino-motion-reveal) var(--dino-ease-stamp), scale var(--dino-motion-reveal) var(--dino-ease-stamp), rotate var(--dino-motion-reveal) var(--dino-ease-stamp);
  }
  .welcome-feature:hover {
    translate: 0 -6px;
    rotate: -.5deg;
    box-shadow: 0 18px 36px rgba(0,0,0,.1);
  }
  .welcome-feature:hover img {
    translate: 0 -10px;
    scale: 1.07;
    rotate: -4deg;
  }
  .welcome-feature:hover .feature-arrow {
    translate: 3px -3px;
  }
}

.welcome-how {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 3rem;
  padding: 2rem;
  border-top: 1px solid var(--dino-border);
}

.welcome-how-intro>img {
  width: 150px;
  height: 150px;
  object-fit: contain;
  rotate: -8deg;
}

.welcome-steps {
  padding: 0;
  margin: 0;
  list-style: none;
}

.welcome-steps li {
  display: flex;
  gap: 1.3rem;
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--dino-border);
}

.welcome-steps li>span {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--dino-peach);
  font-size: .85rem;
  font-weight: 700;
}

.welcome-steps p {
  font-size: .95rem;
  margin: .5rem 0 0;
}

.welcome-host {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 3rem;
  padding: clamp(1.5rem,4vw,4rem);
  border: 2px solid var(--dino-ink);
  border-radius: 30px;
  background: linear-gradient(120deg,var(--dino-peach),var(--dino-yellow));
  box-shadow: 7px 7px 0 var(--dino-ink);
}

.welcome-host p:not(.welcome-eyebrow) {
  max-width: 42ch;
}

.host-notes {
  display: flex;
  flex-wrap: wrap;
  gap: .7rem;
  justify-content: center;
  align-content: center;
}

.host-notes img {
  width: 100%;
  height: 230px;
  object-fit: contain;
}

.host-notes>span {
  background: var(--dino-surface);
  border: 1px solid var(--dino-border);
  border-radius: 999px;
  padding: .6rem .9rem;
  font-size: .84rem;
}

.host-check {
  display: inline-block;
  color: var(--dino-success);
  font-weight: 800;
}

.welcome-join {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
  align-items: center;
  padding: 2rem 1rem;
}

.join-copy>p {
  max-width: 38ch;
}

.join-dinos {
  display: flex;
  align-items: end;
  margin-top: 2rem;
}

.join-dinos img {
  width: 30%;
  max-width: 135px;
  height: 140px;
  object-fit: contain;
}

.join-dinos img:nth-child(2) {
  translate: 0 -20px;
  rotate: 8deg;
}

.welcome :is(a,button):focus-visible {
  outline: 3px solid var(--dino-primary-dark);
  outline-offset: 4px;
}

@media(max-width:991px) {
  .welcome-nav {
    top: 84px;
  }
  .welcome-features,.welcome-how,.welcome-host,.welcome-join {
    scroll-margin-top: 180px;
  }
  .welcome-feature {
    padding: 1.2rem;
  }
  .welcome-how,.welcome-join {
    gap: 2rem;
    padding-left: 0;
    padding-right: 0;
  }
  .welcome-host {
    gap: 1rem;
  }
  .scene-note {
    font-size: .75rem;
  }
  .note-one {
    left: 1%;
    max-width: 11.5rem;
  }
  .scene-friend {
    width: 145px;
  }
}

@media(max-width:767px) {
  .welcome-nav {
    gap: 1rem;
    flex-wrap: wrap;
    border-radius: 1.5rem;
    padding: .35rem .6rem .35rem 1.1rem;
  }
  .welcome-nav>a {
    font-size: .8rem;
  }
  .welcome-account-actions {
    gap: .6rem;
  }
  .welcome-nav .btn {
    padding: .6rem 1rem;
  }
  .welcome-feature-grid,.welcome-how,.welcome-host,.welcome-join {
    grid-template-columns: 1fr;
  }
  .welcome-how-intro>img {
    display: none;
  }
  .welcome-feature {
    display: grid;
    grid-template-columns: 1fr 90px;
    column-gap: 1rem;
  }
  .feature-top,.welcome-feature>p {
    grid-column: 1 / -1;
  }
  .welcome-feature img {
    grid-column: 2;
    grid-row: 2;
    height: 95px;
    margin: .75rem 0;
  }
  .welcome-feature h3 {
    grid-column: 1;
    grid-row: 2;
    align-self: center;
    margin: 0;
  }
  .welcome-scene {
    height: 390px;
    margin-top: 1rem;
  }
  .next-up {
    z-index: 3;
    width: 230px;
    top: 20px;
  }
  .scene-note {
    z-index: 4;
  }
  .scene-friend {
    width: 110px;
    height: 130px;
    bottom: 45px;
    z-index: 1;
  }
  .friend-one {
    left: 0;
  }
  .friend-two {
    right: 0;
  }
  .note-one {
    left: 0;
    top: 7px;
    padding: .5rem;
  }
  .note-two {
    right: 0;
    top: auto;
    bottom: 0;
    padding: .5rem;
  }
  .welcome-host {
    margin-right: 7px;
  }
  .host-notes img {
    height: 160px;
  }
  .join-dinos {
    display: none;
  }
  .welcome h1 {
    font-size: clamp(2.4rem,8vw,3.8rem);
  }
}

@media(max-width:420px) {
  .welcome-nav>a {
    display: none;
  }
  .welcome-account-actions {
    width: 100%;
    justify-content: flex-end;
  }
  .scene-friend {
    width: 90px;
  }
  .welcome-intro {
    font-size: 1rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-nav,.nav-pill,.welcome-text-button span {
    transition: none;
  }
  .welcome-text-button:hover span {
    translate: none;
  }
}
</style>
