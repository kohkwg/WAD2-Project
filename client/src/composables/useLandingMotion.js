import { onMounted, onBeforeUnmount, toValue } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'

// Signed-out landing motion. GSAP (standard licence, all plugins free since 3.13):
// https://gsap.com/docs/v3/. Progressive enhancement: the page is complete without JS or
// with reduced motion, focus finishes any reveal it lands in, every loop is finite, and
// the sign-in form itself never animates. Placement uses CSS translate/rotate, so GSAP owns
// only `transform`: entrance uses x/y/rotation/scale, parallax yPercent, tilt rotationX/Y.
gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin)

export function useLandingMotion(target) {
  let dispose = () => {}
  onMounted(() => {
    const root = toValue(target)
    if (!root) return
    const reveal = parseFloat(getComputedStyle(root).getPropertyValue('--bookedz-motion-reveal')) / 1000 || .42
    const q = selector => root.querySelector(selector)
    const qa = selector => [...root.querySelectorAll(selector)]

    // The nav tightens once the page scrolls. A state, not motion, so it applies everywhere.
    const nav = q('.welcome-nav')
    const onScroll = () => nav?.classList.toggle('is-scrolled', scrollY > 48)
    addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    const media = gsap.matchMedia()
    media.add({
      motion: '(prefers-reduced-motion: no-preference)',
      fine: '(hover: hover) and (pointer: fine)',
      wide: '(min-width: 768px)',
    }, context => {
      const { motion, fine, wide } = context.conditions
      if (!motion) return
      const reveals = [] // [element, animation] pairs that focus can finish
      const cleanups = []
      const hero = q('.welcome-hero')
      const card = q('.scene-card')
      const friends = qa('.scene-friend')
      const notes = qa('.scene-note')

      // Hero: headline word by word, the squiggle draws itself, then the scene assembles.
      const title = hero.querySelector('h1')
      // Our own label keeps the space that the <br> stands for ("plan?” More"), unlike aria: 'auto'
      title.setAttribute('aria-label', title.innerText.replace(/\s+/g, ' ').trim())
      const split = SplitText.create(title, { type: 'words', aria: 'hidden', ignore: '.title-squiggle' })
      const restoreTitle = () => { split.revert(); title.removeAttribute('aria-label') }
      cleanups.push(restoreTitle)
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: restoreTitle })
      intro.from(hero.querySelector('.welcome-eyebrow'), { y: 12, opacity: 0, duration: reveal })
        .from(split.words, { yPercent: 70, opacity: 0, rotation: 5, duration: reveal * 1.6, stagger: .055 }, '-=.15')
        .from(hero.querySelector('.title-squiggle path'), { drawSVG: '0%', duration: .7, ease: 'power2.inOut' }, '-=.3')
        .from(qa('[data-landing-intro]'), { y: 14, opacity: 0, duration: reveal, stagger: .08 }, '<-.35')
        .from(card, { y: -70, rotation: -10, scale: .9, opacity: 0, duration: .85, ease: 'back.out(1.5)' }, '<')
        .from(friends, { y: 90, opacity: 0, duration: .7, stagger: .12, ease: 'back.out(1.8)' }, '-=.55')
        .from(notes, { scale: .5, opacity: 0, rotation: i => (i ? 14 : -14), duration: .5, stagger: .14, ease: 'back.out(2.2)' }, '-=.45')
        .from(q('.scene-orbit'), { scale: .6, opacity: 0, duration: 1, ease: 'power2.out' }, '<-.5')
        // A short, finite idle bob so the friends feel alive without looping forever
        .to(friends, { y: -10, duration: .9, ease: 'sine.inOut', yoyo: true, repeat: 3, stagger: .35 })
      reveals.push([hero, intro])

      if (wide) {
        // Gentle depth while scrolling away from the hero
        const scrub = { trigger: hero, start: 'top top', end: 'bottom top', scrub: .6 }
        gsap.to(card, { yPercent: 12, ease: 'none', scrollTrigger: scrub })
        friends.forEach((friend, i) => gsap.to(friend, { yPercent: i ? -34 : -20, ease: 'none', scrollTrigger: { ...scrub } }))
        notes.forEach((note, i) => gsap.to(note, { yPercent: i ? -150 : -110, ease: 'none', scrollTrigger: { ...scrub } }))
      }

      if (fine && card) {
        // The card leans toward the pointer
        const scene = q('.welcome-scene')
        gsap.set(card, { transformPerspective: 900 })
        const tiltX = gsap.quickTo(card, 'rotationX', { duration: .6, ease: 'power3' })
        const tiltY = gsap.quickTo(card, 'rotationY', { duration: .6, ease: 'power3' })
        const move = event => {
          const box = scene.getBoundingClientRect()
          tiltY(((event.clientX - box.left) / box.width - .5) * 16)
          tiltX(-((event.clientY - box.top) / box.height - .5) * 12)
        }
        const leave = () => { tiltX(0); tiltY(0) }
        scene.addEventListener('pointermove', move)
        scene.addEventListener('pointerleave', leave)
        cleanups.push(() => { scene.removeEventListener('pointermove', move); scene.removeEventListener('pointerleave', leave) })
      }

      const onEnter = (trigger, start = 'top 85%') => ({ trigger, start, once: true })

      // Section headings and single blocks fade up
      qa('[data-landing-reveal]').forEach(element => {
        reveals.push([element, gsap.from(element, { y: 26, opacity: 0, duration: reveal * 1.5, ease: 'power2.out', clearProps: 'opacity,transform', scrollTrigger: onEnter(element, 'top 90%') })])
      })

      // Feature cards arrive one after another
      const grid = q('.welcome-feature-grid')
      if (grid) reveals.push([grid, gsap.from(grid.children, { y: 40, opacity: 0, rotation: i => (i - 1) * 2, duration: reveal * 1.6, stagger: .12, ease: 'power3.out', clearProps: 'opacity,transform', scrollTrigger: onEnter(grid) })])

      // Steps slide in and their numbers stamp down
      const steps = q('.welcome-steps')
      if (steps) {
        const tl = gsap.timeline({ scrollTrigger: onEnter(steps) })
        steps.querySelectorAll('li').forEach((step, i) => {
          tl.from(step, { x: 28, opacity: 0, duration: reveal * 1.3, ease: 'power3.out', clearProps: 'opacity,transform' }, i * .16)
            .from(step.querySelector(':scope > span'), { scale: .2, rotation: -120, duration: .55, ease: 'back.out(2.4)', clearProps: 'transform' }, i * .16 + .08)
        })
        reveals.push([steps, tl])
      }

      // Host checklist ticks on, then the laptop dino types for a moment
      const host = q('.host-notes')
      if (host) {
        const tl = gsap.timeline({ scrollTrigger: onEnter(host, 'top 80%') })
        tl.from(host.querySelector('img'), { y: 30, opacity: 0, duration: reveal * 1.4, ease: 'back.out(1.6)' })
          .from(host.querySelectorAll(':scope > span'), { x: -18, opacity: 0, duration: reveal, stagger: .14, ease: 'power3.out', clearProps: 'opacity,transform' }, '-=.2')
          .from(host.querySelectorAll('.host-check'), { scale: 0, duration: .4, stagger: .14, ease: 'back.out(3)', clearProps: 'transform' }, '<.1')
          .to(host.querySelector('img'), { y: -7, rotation: 1.5, duration: .22, yoyo: true, repeat: 7, ease: 'sine.inOut' })
        reveals.push([host, tl])
      }

      // The join dinos pop up and wave
      const joinDinos = qa('.join-dinos img')
      if (joinDinos.length) {
        const tl = gsap.timeline({ scrollTrigger: onEnter(q('.join-dinos'), 'top 92%') })
        tl.from(joinDinos, { y: 50, opacity: 0, duration: .6, stagger: .12, ease: 'back.out(2)' })
          .to(joinDinos, { y: -16, rotation: i => (i % 2 ? -8 : 8), duration: .2, yoyo: true, repeat: 3, stagger: .1, ease: 'sine.inOut' })
        reveals.push([q('.join-copy'), tl])
      }

      // Keyboard users never wait for, or tab into, something still hidden
      const finish = event => reveals.forEach(([element, animation]) => {
        if (!element?.contains(event.target)) return
        animation.progress(1)
        animation.scrollTrigger?.kill()
      })
      root.addEventListener('focusin', finish)
      cleanups.push(() => root.removeEventListener('focusin', finish))
      return () => cleanups.forEach(cleanup => cleanup())
    })

    dispose = () => {
      removeEventListener('scroll', onScroll)
      media.revert()
    }
  })
  onBeforeUnmount(() => dispose())
}
