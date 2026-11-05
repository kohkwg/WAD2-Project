<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import LoginView from '../../views/LoginView.vue'
import { dinoById } from '../../lib/dinos.js'
const emit = defineEmits(['signed-in'])
const authMode = ref('signin')
const route = useRoute()
const join = ref(null)
const accountForm = ref(null)
async function openAccount(mode) {
  authMode.value = mode
  await nextTick()
  accountForm.value?.setMode(mode)
  await nextTick()
  join.value?.scrollIntoView({ behavior: 'instant', block: 'start' })
  join.value?.querySelector(mode === 'signup' ? '#name' : '#email')?.focus({ preventScroll: true })
}
onMounted(() => { if (route.hash === '#join-dino') openAccount('signin') })
watch(() => route.hash, hash => { if (hash === '#join-dino') openAccount('signin') })
const features = [
  { number: '01', title: 'Find your kind of thing.', text: 'Workshops, music, art or a little adventure. Explore events across Singapore, browse the map and save the ones that catch your eye.', dino: 'wondering', tag: 'Discover', tone: 'peach' },
  { number: '02', title: 'Good plans. Great company.', text: 'Find friends by username, start a Go together group and make meeting up part of the fun.', dino: 'hearts', tag: 'Go together', tone: 'mint' },
  { number: '03', title: 'A little less organising.', text: 'Create an event, bring in co-organisers and keep RSVPs, tasks, budgets and check-in in one place.', dino: 'laptop', tag: 'Host an event', tone: 'yellow' },
]
</script>

<template>
  <div class="welcome">
    <nav class="welcome-nav" aria-label="About Dino">
      <a href="#what-is-dino">Meet Dino</a>
      <a href="#how-it-works">How it works</a>
      <div class="welcome-account-actions"><button type="button" class="welcome-login" @click="openAccount('signin')">Log in</button><button type="button" class="btn btn-primary" @click="openAccount('signup')">Sign up <span aria-hidden="true">↗</span></button></div>
    </nav>

    <section class="welcome-hero" aria-labelledby="welcome-title">
      <p class="welcome-eyebrow"><span aria-hidden="true">✳</span> A little island. A lot to discover.</p>
      <h1 id="welcome-title">Less “what’s the plan?”<br>More <span>“see you there.”</span></h1>
      <p class="welcome-intro">Meet Dino, your home for finding things to do, finding your people, and bringing good plans to life in Singapore.</p>
      <div class="welcome-hero-actions"><RouterLink to="/discover" class="btn btn-primary">Explore events <span aria-hidden="true">↗</span></RouterLink><button type="button" class="welcome-text-button" @click="openAccount('signup')">Make yourself at home <span aria-hidden="true">→</span></button></div>
      <p class="welcome-small">Take a look around. You can browse events without an account.</p>
      <div class="welcome-scene" aria-label="An illustration of making plans with Dino">
        <div class="scene-note note-one"><span aria-hidden="true">✦</span> A plan worth leaving home for</div>
        <div class="scene-card"><p class="scene-card-label">YOUR NEXT GOOD DAY</p><div class="scene-card-art"><img :src="dinoById('cheer').src" alt="A cheerful dino ready for a day out"><span class="scene-spark" aria-hidden="true">✳</span></div><div class="scene-card-bottom"><strong>A little something new.</strong><span>New places. Familiar faces.</span></div></div>
        <img class="scene-friend friend-one" :src="dinoById('flower').src" alt="" aria-hidden="true">
        <img class="scene-friend friend-two" :src="dinoById('hearts').src" alt="" aria-hidden="true">
        <div class="scene-note note-two"><span class="scene-dot" aria-hidden="true"></span> Better with your people</div>
        <span class="scene-orbit" aria-hidden="true"></span>
      </div>
    </section>

    <section id="what-is-dino" class="welcome-features" aria-labelledby="welcome-features-title">
      <div class="welcome-section-head"><p class="welcome-eyebrow">A PLACE FOR YOUR PLANS</p><h2 id="welcome-features-title">Your next good day<br>starts with a little curiosity.</h2><p>From “that looks fun” to “let’s go together,” Dino keeps the good bits in one place.</p></div>
      <div class="welcome-feature-grid"><article v-for="feature in features" :key="feature.number" class="welcome-feature" :class="`feature-${feature.tone}`"><div class="feature-top"><span>{{ feature.number }} / {{ feature.tag }}</span><span aria-hidden="true">↗</span></div><img :src="dinoById(feature.dino).src" alt="" aria-hidden="true"><h3>{{ feature.title }}</h3><p>{{ feature.text }}</p></article></div>
    </section>

    <section id="how-it-works" class="welcome-how" aria-labelledby="welcome-how-title">
      <div class="welcome-how-intro"><p class="welcome-eyebrow">FROM MAYBE TO MEMORIES</p><h2 id="welcome-how-title">A plan in three<br>little steps.</h2><img :src="dinoById('scarf').src" alt="" aria-hidden="true"></div>
      <ol class="welcome-steps"><li><span>01</span><div><h3>Find your spark.</h3><p>Browse by interest or explore the map. Save an event for later if you’re still deciding.</p></div></li><li><span>02</span><div><h3>Make it a plan.</h3><p>Create an account to RSVP, keep track of your tickets and see your upcoming plans.</p></div></li><li><span>03</span><div><h3>Bring your people.</h3><p>Add friends and start a group heading to the event. A first time feels better together.</p></div></li></ol>
    </section>

    <section class="welcome-host" aria-labelledby="welcome-host-title"><div><p class="welcome-eyebrow">GOT SOMETHING IN MIND?</p><h2 id="welcome-host-title">Big idea.<br>Small gathering.<br>Make it happen.</h2><p>Run a workshop, organise a meetup or share something you love. Invite your co-organisers and give every detail a home.</p><button type="button" class="btn btn-primary" @click="openAccount('signup')">Start your next chapter <span aria-hidden="true">↗</span></button></div><div class="host-notes" aria-label="Event planning tools"><img :src="dinoById('laptop').src" alt="A dino with a laptop"><span>✓ RSVPs &amp; waitlists</span><span>✓ Your organising team</span><span>✓ Tasks &amp; budgets</span><span>✓ Floor plans &amp; check-in</span></div></section>

    <section id="join-dino" ref="join" class="welcome-join" aria-labelledby="welcome-join-title"><div class="join-copy"><p class="welcome-eyebrow">THERE’S ROOM FOR YOU HERE</p><h2 id="welcome-join-title">New plans.<br>New people.<br><span>Your kind of Dino.</span></h2><p>Pick your interests, choose your dino and make a little room for something new.</p><div class="join-dinos" aria-hidden="true"><img :src="dinoById('donut').src" alt=""><img :src="dinoById('gift').src" alt=""><img :src="dinoById('berry').src" alt=""></div></div><LoginView ref="accountForm" embedded :initial-mode="authMode" @signed-in="emit('signed-in')" /></section>
  </div>
</template>

<style scoped>
.welcome { max-width:1360px; margin:0 auto; color:var(--bookedz-ink); }
.welcome-nav { display:flex; align-items:center; gap:1.75rem; padding:0 0 1.5rem; border-bottom:1px solid var(--bookedz-border); }
.welcome-nav>a,.welcome-login { color:var(--bookedz-ink); font-size:.9rem; font-weight:600; text-decoration:none; }
.welcome-nav>a { display:flex; align-items:center; min-height:44px; }
.welcome-account-actions { margin-left:auto; display:flex; gap:1.25rem; align-items:center; }
.welcome button { cursor:pointer; }
.welcome-login,.welcome-text-button { background:none; border:0; min-height:44px; }
.welcome .btn { display:inline-flex; align-items:center; justify-content:center; gap:1rem; min-height:48px; padding:.8rem 1.4rem; border-radius:999px; font-weight:650; }
.welcome-hero { text-align:center; padding:clamp(3rem,6vw,6rem) 0 1rem; overflow:hidden; }
.welcome-eyebrow { font-size:.76rem; letter-spacing:.1em; font-weight:750; margin-bottom:1.25rem; }
.welcome-eyebrow>span { color:var(--bookedz-primary); margin-right:.5rem; }
.welcome h1 { font:750 clamp(2.6rem,5.8vw,5.5rem)/1.06 var(--bookedz-heading); letter-spacing:-.055em; margin:0; }
.welcome h1 span,.join-copy h2 span { color:var(--bookedz-primary-dark); }
.welcome-intro { max-width:54ch; margin:1.5rem auto; color:var(--bookedz-muted); font-size:1.12rem; line-height:1.7; }
.welcome-hero-actions { display:flex; justify-content:center; flex-wrap:wrap; align-items:center; gap:1rem; }
.welcome-text-button { color:var(--bookedz-ink); font-weight:650; }
.welcome-small { color:var(--bookedz-muted); font-size:.82rem; margin-top:1rem; }
.welcome-scene { position:relative; isolation:isolate; width:min(100%,900px); height:430px; margin:2rem auto 0; }
.scene-orbit { position:absolute; z-index:-1; width:90%; height:60%; border-radius:50%; bottom:1rem; left:5%; background:radial-gradient(ellipse,var(--bookedz-mint),transparent 68%); opacity:.55; }
.scene-card { position:absolute; width:290px; left:50%; top:30px; transform:translateX(-50%) rotate(-4deg); border:2px solid var(--bookedz-ink); border-radius:24px; background:var(--bookedz-surface); box-shadow:8px 8px 0 var(--bookedz-ink); overflow:hidden; }
.scene-card-label { text-align:left; font-size:.65rem; letter-spacing:.14em; font-weight:750; padding:1rem; margin:0; }
.scene-card-art { height:200px; position:relative; background:var(--bookedz-yellow); }
.scene-card-art img { height:100%; width:100%; object-fit:contain; padding:10px; }
.scene-spark { position:absolute; right:18px; top:15px; font-size:2.8rem; color:var(--bookedz-primary-dark); }
.scene-card-bottom { display:grid; gap:.3rem; padding:1rem; text-align:left; }
.scene-card-bottom strong { font-size:1.1rem; }
.scene-card-bottom>span { color:var(--bookedz-muted); font-size:.8rem; }
.scene-friend { position:absolute; width:190px; height:220px; object-fit:contain; bottom:20px; }
.friend-one { left:7%; transform:rotate(-10deg); }
.friend-two { right:7%; transform:rotate(12deg); }
.scene-note { position:absolute; z-index:2; padding:.8rem 1rem; border:1px solid var(--bookedz-border); border-radius:12px; background:var(--bookedz-surface); font-size:.85rem; box-shadow:0 6px 18px #00000009; }
.note-one { left:3%; top:55px; transform:rotate(-6deg); }
.note-one>span { color:var(--bookedz-primary-dark); margin-right:.4rem; }
.note-two { right:1%; top:110px; transform:rotate(6deg); }
.scene-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--bookedz-success); margin-right:.4rem; }
.welcome-features,.welcome-how,.welcome-host,.welcome-join { margin-top:clamp(3rem,7vw,7rem); scroll-margin-top:2rem; }
.welcome-section-head { text-align:center; max-width:680px; margin:0 auto 2.5rem; }
.welcome h2 { font:700 clamp(2rem,3.6vw,3.3rem)/1.12 var(--bookedz-heading); letter-spacing:-.04em; margin:0 0 1.2rem; }
.welcome-section-head>p:last-child,.welcome-feature>p,.welcome-steps p,.welcome-host p:not(.welcome-eyebrow),.join-copy>p:last-of-type { color:var(--bookedz-muted); line-height:1.7; }
.welcome-feature-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1.25rem; }
.welcome-feature { border:1px solid var(--bookedz-border); border-radius:24px; padding:1.7rem; background:var(--bookedz-surface); min-width:0; }
.feature-peach { background:color-mix(in srgb,var(--bookedz-peach) 40%,var(--bookedz-surface)); }
.feature-mint { background:color-mix(in srgb,var(--bookedz-mint) 30%,var(--bookedz-surface)); }
.feature-yellow { background:color-mix(in srgb,var(--bookedz-yellow) 30%,var(--bookedz-surface)); }
.feature-top { display:flex; justify-content:space-between; font-size:.73rem; font-weight:650; }
.welcome-feature img { display:block; height:150px; width:100%; object-fit:contain; margin:1.5rem 0; }
.welcome h3 { font:650 1.3rem/1.25 var(--bookedz-heading); letter-spacing:-.025em; }
.welcome-feature>p { font-size:.94rem; margin:1rem 0 0; }
.welcome-how { display:grid; grid-template-columns:1fr 1.3fr; gap:3rem; padding:2rem; border-top:1px solid var(--bookedz-border); }
.welcome-how-intro>img { width:150px; height:150px; object-fit:contain; transform:rotate(-8deg); }
.welcome-steps { padding:0; margin:0; list-style:none; }
.welcome-steps li { display:flex; gap:1.3rem; padding:1.5rem 0; border-bottom:1px solid var(--bookedz-border); }
.welcome-steps li>span { flex:none; display:grid; place-items:center; width:40px; height:40px; border-radius:50%; background:var(--bookedz-peach); font-size:.85rem; font-weight:700; }
.welcome-steps p { font-size:.95rem; margin:.5rem 0 0; }
.welcome-host { display:grid; grid-template-columns:1.1fr 1fr; gap:3rem; padding:clamp(1.5rem,4vw,4rem); border:2px solid var(--bookedz-ink); border-radius:30px; background:linear-gradient(120deg,var(--bookedz-peach),var(--bookedz-yellow)); box-shadow:7px 7px 0 var(--bookedz-ink); }
.welcome-host p:not(.welcome-eyebrow) { max-width:42ch; }
.host-notes { display:flex; flex-wrap:wrap; gap:.7rem; justify-content:center; align-content:center; }
.host-notes img { width:100%; height:230px; object-fit:contain; }
.host-notes>span { background:var(--bookedz-surface); border:1px solid var(--bookedz-border); border-radius:999px; padding:.6rem .9rem; font-size:.84rem; }
.welcome-join { display:grid; grid-template-columns:1fr 1fr; gap:3rem; align-items:center; padding:2rem 1rem; }
.join-copy>p { max-width:38ch; }
.join-dinos { display:flex; align-items:end; margin-top:2rem; }
.join-dinos img { width:30%; max-width:135px; height:140px; object-fit:contain; }
.join-dinos img:nth-child(2) { transform:translateY(-20px) rotate(8deg); }
.welcome :is(a,button):focus-visible { outline:3px solid var(--bookedz-primary-dark); outline-offset:4px; }
@media(max-width:991px) { .welcome-feature { padding:1.2rem; } .welcome-how,.welcome-join { gap:2rem; padding-left:0; padding-right:0; } .welcome-host { gap:1rem; } .scene-note { font-size:.75rem; } .scene-friend { width:145px; } }
@media(max-width:767px) { .welcome-nav { gap:1rem; flex-wrap:wrap; } .welcome-nav>a { font-size:.8rem; } .welcome-account-actions { gap:.6rem; } .welcome-nav .btn { padding:.6rem 1rem; } .welcome-feature-grid,.welcome-how,.welcome-host,.welcome-join { grid-template-columns:1fr; } .welcome-how-intro>img { display:none; } .welcome-feature { display:grid; grid-template-columns:1fr 90px; column-gap:1rem; } .feature-top,.welcome-feature>p { grid-column:1 / -1; } .welcome-feature img { grid-column:2; grid-row:2; height:95px; margin:.75rem 0; } .welcome-feature h3 { grid-column:1; grid-row:2; align-self:center; margin:0; } .welcome-scene { height:390px; margin-top:1rem; } .scene-card { width:230px; top:20px; } .scene-card-art { height:155px; } .scene-friend { width:110px; height:130px; bottom:45px; z-index:3; } .friend-one { left:0; } .friend-two { right:0; } .note-one { left:0; top:7px; padding:.5rem; } .note-two { right:0; top:auto; bottom:0; padding:.5rem; } .welcome-host { margin-right:7px; } .host-notes img { height:160px; } .join-dinos { display:none; } .welcome h1 { font-size:clamp(2.4rem,8vw,3.8rem); } }
@media(max-width:420px) { .welcome-nav>a { display:none; } .welcome-account-actions { width:100%; justify-content:flex-end; } .scene-friend { width:90px; } .welcome-intro { font-size:1rem; } }
</style>
