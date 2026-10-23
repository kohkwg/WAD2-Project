import { onMounted, onBeforeUnmount, toValue } from 'vue'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// GSAP/ScrollTrigger: https://gsap.com/docs/v3/Plugins/ScrollTrigger/.
// Scoped progressive enhancement: readable without JS; clean up on navigation.
gsap.registerPlugin(ScrollTrigger)
export function useDiscoveryMotion(target) {
  let dispose = () => {}
  onMounted(() => {
    const root = toValue(target)
    if (!root) return
    const revealDuration = parseFloat(getComputedStyle(root).getPropertyValue('--bookedz-motion-reveal')) / 1000 || .65
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', context => {
      const seen = new WeakSet()
      const reveals = new WeakMap()
      let frame
      function scan() {
        context.add(() => {
          const intro = root.querySelectorAll('[data-hero-reveal]:not([data-motion-ready])')
          intro.forEach(element => element.setAttribute('data-motion-ready', ''))
          if (intro.length) gsap.fromTo(intro, { opacity: .1, y: 18 }, { opacity: 1, y: 0, duration: revealDuration, stagger: .09, ease: 'power2.out', clearProps: 'opacity,transform' })
          const art = root.querySelector('.hero-illustration')
          if (art && !seen.has(art)) {
            seen.add(art)
            gsap.fromTo(art, { opacity: .2, scale: .96 }, { opacity: 1, scale: 1, duration: revealDuration * 1.7, ease: 'power2.out', clearProps: 'opacity' })
            if (matchMedia('(min-width: 768px)').matches) gsap.to(art, { yPercent: 7, ease: 'none', scrollTrigger: { trigger: art.closest('.discovery-hero'), start: 'top top', end: 'bottom top', scrub: .7 } })
          }
          root.querySelectorAll('[data-scroll-reveal],.event-card,.recommendation-card').forEach((element, i) => {
            if (seen.has(element)) return
            seen.add(element)
            const tween = gsap.fromTo(element, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: revealDuration * .8, delay: (i % 3) * .055, ease: 'power2.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: element, start: 'top 96%', once: true } })
            reveals.set(element, tween)
          })
          ScrollTrigger.refresh()
        })
      }
      function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(scan) }
      const observer = new MutationObserver(schedule)
      observer.observe(root, { childList: true, subtree: true })
      const onFocus = event => {
        const card = event.target.closest('.event-card,.recommendation-card,[data-scroll-reveal]')
        const tween = card && reveals.get(card)
        tween?.progress(1)
        tween?.scrollTrigger?.kill()
      }
      root.addEventListener('focusin', onFocus)
      schedule()
      return () => {
        observer.disconnect()
        cancelAnimationFrame(frame)
        root.removeEventListener('focusin', onFocus)
        root.querySelectorAll('[data-motion-ready]').forEach(el => el.removeAttribute('data-motion-ready'))
      }
    })
    let observedHero
    let heroVisible = false
    const applyAmbient = () => { root.dataset.ambientActive = String(heroVisible && !document.hidden) }
    const visibility = new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; applyAmbient() })
    const observeHero = () => {
      const hero = root.querySelector('.discovery-hero')
      if (hero === observedHero) return
      observedHero = hero
      visibility.disconnect()
      heroVisible = false
      applyAmbient()
      if (hero) visibility.observe(hero)
    }
    const branches = new MutationObserver(observeHero)
    branches.observe(root, { childList: true })
    observeHero()
    document.addEventListener('visibilitychange', applyAmbient)
    dispose = () => { media.revert(); branches.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', applyAmbient) }
  })
  onBeforeUnmount(() => dispose())
}
