import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TempleLoader } from '../components/TempleLoader'
import '../App.css'

const TEMPLE_IMAGE = '/temple.png'
const LOGO = '/logo.png'

const HOURS = [
  {
    day: 'Monday – Friday',
    morning: '9:00 AM – 12:30 PM',
    evening: '5:30 PM – 8:30 PM',
  },
  {
    day: 'Saturday & Sunday',
    morning: '9:00 AM – 2:00 PM',
    evening: '5:30 PM – 8:30 PM',
  },
]

function useScrollReveal(enabled) {
  const rootRef = useRef(null)

  useEffect(() => {
    if (!enabled || !rootRef.current) return undefined

    const nodes = rootRef.current.querySelectorAll('[data-reveal]')
    if (!nodes.length) return undefined

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      nodes.forEach((node) => node.classList.add('is-revealed'))
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [enabled])

  return rootRef
}

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [loaderGone, setLoaderGone] = useState(false)
  const pageRef = useScrollReveal(!loading)
  const mediaRef = useRef(null)

  useEffect(() => {
    const img = new Image()
    img.src = TEMPLE_IMAGE

    const finish = () => setLoading(false)
    const minTime = new Promise((resolve) => setTimeout(resolve, 1600))
    const imageReady = new Promise((resolve) => {
      if (img.complete) resolve()
      else {
        img.onload = resolve
        img.onerror = resolve
      }
    })

    Promise.all([minTime, imageReady]).then(finish)

    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [])

  useEffect(() => {
    if (loading) return undefined
    const t = setTimeout(() => setLoaderGone(true), 700)
    return () => clearTimeout(t)
  }, [loading])

  useEffect(() => {
    if (loading) return undefined
    const media = mediaRef.current
    if (!media) return undefined

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) return undefined

    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, window.innerHeight)
        media.style.transform = `translate3d(0, ${y * 0.22}px, 0) scale(${1 + y * 0.00008})`
        ticking = false
      })
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [loading])

  return (
    <>
      {!loaderGone && (
        <div className={`loader-shell ${loading ? '' : 'loader-shell--exit'}`}>
          <TempleLoader />
        </div>
      )}

      <div
        ref={pageRef}
        className={`page ${loading ? 'page--loading' : 'page--ready'}`}
      >
        <section className="welcome">
          <div className="welcome__media" ref={mediaRef} aria-hidden="true">
            <img
              className="welcome__image"
              src={TEMPLE_IMAGE}
              alt=""
              width={2400}
              height={1600}
            />
            <div className="welcome__veil" />
            <div className="welcome__rays" />
            <div className="welcome__incense">
              <span className="welcome__plume" />
              <span className="welcome__plume" />
              <span className="welcome__plume" />
            </div>
          </div>

          <div className="welcome__content">
            <img
              className="welcome__logo"
              src={LOGO}
              alt="Hindu Temple Omaha, NE"
              width={480}
              height={160}
            />
            <div className="welcome__rule" aria-hidden="true" />
            <p className="welcome__headline">Where stillness finds you</p>
            <p className="welcome__lede">
              Step into quiet stone, incense mist, and morning light.
            </p>
            <div className="welcome__actions">
              <Link className="welcome__cta" to="/pujas">
                Explore Puja
              </Link>
              <a
                className="welcome__ghost"
                href="http://www.htom.org"
                target="_blank"
                rel="noreferrer"
              >
                Official site
              </a>
            </div>
            <a className="welcome__scroll" href="#visit" aria-label="Scroll to visit details">
              <span className="welcome__scroll-line" />
            </a>
          </div>
        </section>

        <section className="visit" id="visit">
          <div className="visit__inner">
            <header className="visit__header" data-reveal>
              <p className="visit__eyebrow">Plan your visit</p>
              <h2 className="visit__title">Temple hours &amp; directions</h2>
            </header>

            <div className="visit__panels">
              <div className="visit__panel" data-reveal data-reveal-delay="1">
                <h3 className="visit__subtitle">Temple hours</h3>
                <ul className="schedule">
                  {HOURS.map((row) => (
                    <li className="schedule__row" key={row.day}>
                      <p className="schedule__day">{row.day}</p>
                      <div className="schedule__times">
                        <p>
                          <span className="schedule__label">Morning</span>
                          {row.morning}
                        </p>
                        <p>
                          <span className="schedule__label">Evening</span>
                          {row.evening}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="visit__panel" data-reveal data-reveal-delay="2">
                <h3 className="visit__subtitle">Temple cafeteria timing</h3>
                <div className="cafeteria">
                  <p className="cafeteria__when">Every Saturday &amp; Sunday</p>
                  <p className="cafeteria__time">10:30 AM – 1:30 PM</p>
                </div>
              </div>
            </div>

            <div className="visit__directions" data-reveal data-reveal-delay="3">
              <h3 className="visit__subtitle">Directions to the temple</h3>
              <address className="visit__address">
                <span className="visit__name">Hindu Temple Omaha</span>
                <span>13010 Arbor St, Omaha, NE 68144</span>
                <a href="http://www.htom.org" target="_blank" rel="noreferrer">
                  www.htom.org
                </a>
                <a href="tel:+14026978546">Tel: (402) 697-8546</a>
              </address>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
