import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Weather } from '../types'
import { makeColors } from './make-colors.js'

const PLUGIN = 'aotearoa-weather'
const SCENE = 'aotearoa'
const REFRESH_MS = 15 * 60 * 1000

const CITIES: Record<string, [number, number]> = {
  Auckland: [-36.8485, 174.7633],
  Hamilton: [-37.787, 175.2793],
  Tauranga: [-37.6878, 176.1651],
  Rotorua: [-38.1368, 176.2497],
  Napier: [-39.4928, 176.912],
  Wellington: [-41.2865, 174.7762],
  Nelson: [-41.2706, 173.284],
  Christchurch: [-43.5321, 172.6362],
  Tekapo: [-44.0047, 170.4772],
  Queenstown: [-45.0312, 168.6626],
  Dunedin: [-45.8788, 170.5028],
}

const fallback = (city: string): Weather => ({
  city,
  code: 2,
  isDay: true,
  tempC: 16,
  windKmh: 15,
  isLive: false,
})

// Change the tag when Weather's fields change: it declines an older stored value.
const weather = atom({ plugin: 'aotearoa-weather', key: 'weather' } as const, fallback('Wellington'), {
  shape: 'weather-1',
})

// ---------------------------------------------------------------- colours

// Lake-turquoise, pōhutukawa red, fern green, kōwhai gold, lupin purple.
const { theme, problems } = makeColors({
  label: 'Aotearoa',
  roles: { accent: '#0f9bb0', danger: '#d7263d', success: '#3f8f29', warning: '#e8a400', pro: '#7b4fb0' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#e3eff3',
        'surface-1': '#ecf5f8',
        'surface-2': '#f5fafb',
        'text-primary': '#0f242c',
        'text-secondary': '#2d4852',
        'text-muted': '#4b6670',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0d191e',
        'surface-1': '#13222a',
        'surface-2': '#192a32',
        'surface-3': '#1e3139',
        'text-primary': '#e8f3f1',
        'text-secondary': '#c0d5d3',
        'text-muted': '#9ab2b0',
      },
    },
  },
})

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: SCENE },
}

// ---------------------------------------------------------------- weather

type Sky = 'clear' | 'partly' | 'overcast' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

const skyOf = (code: number): Sky => {
  if (code === 0) return 'clear'
  if (code <= 2) return 'partly'
  if (code === 3) return 'overcast'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'partly'
}

const WORDS: Record<Sky, string> = {
  clear: 'Fine',
  partly: 'Partly cloudy',
  overcast: 'Overcast',
  fog: 'Foggy',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  storm: 'Thunderstorms',
}

const describe = (w: Weather) =>
  `${w.city} ${Math.round(w.tempC)}° · ${WORDS[skyOf(w.code)]} · ${Math.round(w.windKmh)} km/h` +
  (w.isLive ? '' : ' (no live reading yet)')

const fetchWeather = async ($: EngineInterface, city: string): Promise<Weather | undefined> => {
  const [lat, lon] = CITIES[city] ?? [-41.2865, 174.7762]
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=Pacific%2FAuckland'
  try {
    const res = await $.http.fetch(url)
    if (!res.ok) return undefined
    const cur = JSON.parse(res.text)?.current
    if (cur === undefined || typeof cur.weather_code !== 'number') return undefined

    return {
      city,
      code: cur.weather_code,
      isDay: cur.is_day === 1,
      tempC: Number(cur.temperature_2m ?? 0),
      windKmh: Number(cur.wind_speed_10m ?? 0),
      isLive: true,
    }
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------- scene

// A steady pseudo-random series, so the scene draws the same way each time.
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

const SKIES: Record<Sky, [string, string, string, string]> = {
  // day top, day bottom, night top, night bottom
  clear: ['#2f9cf0', '#bde9ff', '#081634', '#24407a'],
  partly: ['#4aa6e8', '#cdeaf8', '#0b1a38', '#2b4170'],
  overcast: ['#8aa7bb', '#d6e2ea', '#171f2c', '#384456'],
  fog: ['#b4c3cc', '#e6ecef', '#1e2630', '#46505c'],
  drizzle: ['#7c97ab', '#c7d5de', '#141c28', '#333f50'],
  rain: ['#5f7b90', '#a9bccb', '#0f1621', '#2b3646'],
  snow: ['#a5b9c9', '#eef3f7', '#1a2233', '#4a5568'],
  storm: ['#3b4a5a', '#7f8f9c', '#0a0f17', '#242d3a'],
}

const cloudShape = (x: number, y: number, s: number, fill: string, opacity: number) =>
  `<g opacity="${opacity}" fill="${fill}">` +
  `<ellipse cx="${x}" cy="${y}" rx="${170 * s}" ry="${34 * s}"/>` +
  `<ellipse cx="${x - 70 * s}" cy="${y - 18 * s}" rx="${70 * s}" ry="${36 * s}"/>` +
  `<ellipse cx="${x + 10 * s}" cy="${y - 34 * s}" rx="${80 * s}" ry="${48 * s}"/>` +
  `<ellipse cx="${x + 90 * s}" cy="${y - 16 * s}" rx="${66 * s}" ry="${32 * s}"/>` +
  `</g>`

export const buildScene = (w: Weather): string => {
  const sky = skyOf(w.code)
  const day = w.isDay
  const [dt, db, nt, nb] = SKIES[sky]
  const top = day ? dt : nt
  const bottom = day ? db : nb
  const rand = seeded(7)
  const gloomy = sky === 'overcast' || sky === 'rain' || sky === 'storm' || sky === 'drizzle' || sky === 'fog' || sky === 'snow'
  // Stronger wind, faster clouds.
  const drift = Math.max(70, 260 - w.windKmh * 4)

  const cloudCount = { clear: 1, partly: 4, overcast: 8, fog: 5, drizzle: 7, rain: 8, snow: 7, storm: 9 }[sky]
  const cloudFill = sky === 'storm' ? '#5a6573' : sky === 'rain' ? '#9aa8b4' : day ? '#ffffff' : '#c9d3e0'
  const cloudOpacity = day ? 0.92 : 0.55

  const parts: string[] = []

  // sky
  parts.push(
    `<defs>` +
      `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>` +
      `<linearGradient id="lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${day ? '#3fd0d4' : '#1b5a6b'}"/><stop offset="1" stop-color="${day ? '#0f8fa8' : '#0c3442'}"/></linearGradient>` +
      `<linearGradient id="hill1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${day ? '#6cc24a' : '#1f4a2a'}"/><stop offset="1" stop-color="${day ? '#3d8f2f' : '#12301b'}"/></linearGradient>` +
      `<linearGradient id="hill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${day ? '#3f9e3a' : '#173a22'}"/><stop offset="1" stop-color="${day ? '#2b7330' : '#0d2415'}"/></linearGradient>` +
      `<radialGradient id="sun"><stop offset="0" stop-color="#fff6c2"/><stop offset="0.5" stop-color="#ffd94a"/><stop offset="1" stop-color="#ffd94a" stop-opacity="0"/></radialGradient>` +
      `</defs>`,
  )
  parts.push(`<rect width="1600" height="1000" fill="url(#sky)"/>`)

  // sun or moon and stars
  if (day) {
    const dim = gloomy ? 0.35 : 1
    parts.push(
      `<g class="sun" opacity="${dim}"><circle cx="1260" cy="170" r="150" fill="url(#sun)"/><circle cx="1260" cy="170" r="62" fill="#ffe36b"/></g>`,
    )
  } else {
    if (!gloomy) {
      for (let i = 0; i < 70; i++) {
        const x = Math.round(rand() * 1600)
        const y = Math.round(rand() * 420)
        const r = (rand() * 1.6 + 0.6).toFixed(1)
        parts.push(`<circle class="star s${i % 3}" cx="${x}" cy="${y}" r="${r}" fill="#fdf8e1"/>`)
      }
      // a few of the Southern Cross
      parts.push(
        `<g fill="#ffffff"><circle cx="300" cy="120" r="3.4"/><circle cx="330" cy="190" r="3"/><circle cx="270" cy="170" r="2.6"/><circle cx="355" cy="150" r="2.4"/><circle cx="318" cy="168" r="1.6"/></g>`,
      )
    }
    parts.push(
      `<g opacity="${gloomy ? 0.35 : 1}"><circle cx="1260" cy="160" r="54" fill="#f4f1de"/><circle cx="1282" cy="146" r="50" fill="${top}" opacity="0.9"/></g>`,
    )
  }

  // the Southern Alps: far range, then near peaks with snow
  const far = day ? (gloomy ? '#8796a6' : '#7d93b8') : '#25324a'
  const near = day ? (gloomy ? '#6b7b8c' : '#5a73a0') : '#1b263a'
  const snowCap = day ? '#ffffff' : '#c9d3e6'
  parts.push(
    `<path d="M0 640 L120 560 L210 600 L330 470 L430 560 L540 430 L650 540 L760 450 L880 560 L1000 420 L1110 520 L1230 440 L1360 560 L1470 480 L1600 560 L1600 700 L0 700Z" fill="${far}"/>`,
    `<path d="M0 690 L150 590 L260 650 L400 500 L520 640 L650 560 L800 470 L940 620 L1080 520 L1220 640 L1380 540 L1600 660 L1600 740 L0 740Z" fill="${near}"/>`,
    `<g fill="${snowCap}">` +
      `<path d="M400 500 L440 548 L420 540 L400 556 L378 540 L362 546Z"/>` +
      `<path d="M800 470 L846 524 L822 516 L800 534 L780 516 L756 522Z"/>` +
      `<path d="M1080 520 L1116 562 L1098 556 L1080 570 L1062 556 L1046 562Z"/>` +
      `<path d="M1380 540 L1414 578 L1396 572 L1380 586 L1364 572 L1348 578Z"/>` +
      `<path d="M540 430 L568 466 L552 460 L540 472 L528 460 L514 466Z" opacity="0.9"/>` +
      `<path d="M1000 420 L1030 458 L1014 452 L1000 466 L986 452 L970 458Z" opacity="0.9"/>` +
      `</g>`,
  )

  // the lake, with a slow shimmer
  parts.push(`<rect y="728" width="1600" height="80" fill="url(#lake)"/>`)
  for (let i = 0; i < 14; i++) {
    const x = Math.round(rand() * 1500)
    const y = 740 + Math.round(rand() * 56)
    parts.push(
      `<rect class="glint g${i % 3}" x="${x}" y="${y}" width="${40 + Math.round(rand() * 80)}" height="2" rx="1" fill="#ffffff" opacity="0.35"/>`,
    )
  }

  // rolling hills
  parts.push(
    `<path d="M0 800 C200 760 380 790 560 780 C760 768 900 800 1100 786 C1300 772 1460 800 1600 784 L1600 1000 L0 1000Z" fill="url(#hill1)"/>`,
    `<path d="M0 880 C240 830 460 870 700 860 C940 850 1150 890 1400 856 C1500 844 1560 850 1600 858 L1600 1000 L0 1000Z" fill="url(#hill2)"/>`,
  )

  // lupins along the lake edge: purple, pink, gold
  const lupinColours = ['#8e4fc7', '#d65aa6', '#f2b705', '#5a6ee0', '#e8789a']
  for (let i = 0; i < 46; i++) {
    const x = 40 + Math.round(rand() * 1520)
    if (x > 520 && x < 1080) continue // keep the middle calm
    const base = 800 + Math.round(rand() * 26)
    const h = 34 + Math.round(rand() * 30)
    const c = lupinColours[i % lupinColours.length]
    parts.push(
      `<g class="lupin l${i % 2}"><rect x="${x - 1}" y="${base - h}" width="2" height="${h + 6}" fill="${day ? '#2f6b2a' : '#173a22'}"/>` +
        `<rect x="${x - 5}" y="${base - h - 6}" width="10" height="${h - 4}" rx="5" fill="${c}" opacity="${day ? 0.95 : 0.55}"/></g>`,
    )
  }

  // a pōhutukawa in the right corner, red in bloom
  const leaf = day ? '#2c6a33' : '#15351c'
  const bloom = day ? '#e0202e' : '#8c1a26'
  parts.push(
    `<g class="tree">` +
      `<path d="M1450 1000 C1452 930 1440 880 1400 840 M1452 960 C1480 900 1520 870 1580 850" stroke="${day ? '#5b3a22' : '#2a1b10'}" stroke-width="18" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="1400" cy="820" rx="120" ry="70" fill="${leaf}"/>` +
      `<ellipse cx="1520" cy="800" rx="130" ry="80" fill="${leaf}"/>` +
      `<ellipse cx="1590" cy="860" rx="90" ry="60" fill="${leaf}"/>`,
  )
  for (let i = 0; i < 60; i++) {
    const cx = 1300 + Math.round(rand() * 300)
    const cy = 750 + Math.round(rand() * 140)
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${(rand() * 5 + 4).toFixed(1)}" fill="${bloom}"/>`)
  }
  parts.push(`</g>`)

  // a koru fern unfurling in the left corner
  const fern = day ? '#2f8a3a' : '#16401f'
  parts.push(
    `<g class="fern" fill="none" stroke="${fern}" stroke-linecap="round">` +
      `<path d="M60 1000 C70 900 110 840 170 820 C220 805 250 840 230 870 C215 892 185 885 186 862 C187 848 202 845 208 856" stroke-width="12"/>` +
      `<path d="M10 1000 C0 920 20 860 60 830" stroke-width="8"/>` +
      `<path d="M120 1000 C150 940 200 920 250 930" stroke-width="7"/>` +
      `</g>`,
  )

  // clouds, the long white cloud first
  parts.push(
    `<g class="cloud c0" style="animation-duration:${drift * 1.4}s;animation-delay:-${drift * 0.5}s">` +
      `<g opacity="${day ? 0.95 : 0.6}" fill="${sky === 'storm' ? '#6b7684' : day ? '#ffffff' : '#d5dde8'}">` +
      `<ellipse cx="800" cy="300" rx="520" ry="26"/><ellipse cx="620" cy="288" rx="160" ry="30"/><ellipse cx="860" cy="280" rx="200" ry="36"/><ellipse cx="1080" cy="292" rx="150" ry="26"/>` +
      `</g></g>`,
  )
  for (let i = 1; i < cloudCount; i++) {
    const x = Math.round(rand() * 1600)
    const y = 80 + Math.round(rand() * 360)
    const s = 0.6 + rand() * 0.9
    const dur = Math.round(drift * (0.8 + rand() * 0.8))
    const delay = Math.round(rand() * dur)
    parts.push(
      `<g class="cloud" style="animation-duration:${dur}s;animation-delay:-${delay}s">${cloudShape(x, y, s, cloudFill, cloudOpacity)}</g>`,
    )
  }

  // fog over the lake
  if (sky === 'fog') {
    parts.push(
      `<g class="mist"><rect y="600" width="1600" height="260" fill="${day ? '#ffffff' : '#9aa6b2'}" opacity="0.45"/>` +
        `<ellipse cx="500" cy="720" rx="700" ry="60" fill="#ffffff" opacity="0.35"/><ellipse cx="1200" cy="660" rx="600" ry="50" fill="#ffffff" opacity="0.3"/></g>`,
    )
  }

  // rain or drizzle: thin faint streaks, two copies stacked so the loop is seamless
  if (sky === 'rain' || sky === 'drizzle' || sky === 'storm') {
    const count = sky === 'drizzle' ? 60 : 120
    const len = sky === 'drizzle' ? 14 : 26
    const streaks: string[] = []
    for (let i = 0; i < count; i++) {
      const x = Math.round(rand() * 1700) - 50
      const y = Math.round(rand() * 1000)
      streaks.push(`M${x} ${y} l-6 ${len}`)
      streaks.push(`M${x} ${y - 1000} l-6 ${len}`)
    }
    parts.push(
      `<g class="rain"><path d="${streaks.join(' ')}" stroke="${day ? '#e8f2fa' : '#9fb3c8'}" stroke-width="1.6" stroke-linecap="round" opacity="0.45"/></g>`,
    )
  }

  // snow: soft flakes drifting
  if (sky === 'snow') {
    const flakes: string[] = []
    for (let i = 0; i < 110; i++) {
      const x = Math.round(rand() * 1600)
      const y = Math.round(rand() * 1000)
      const r = (rand() * 3 + 2).toFixed(1)
      flakes.push(`<circle cx="${x}" cy="${y}" r="${r}"/><circle cx="${x}" cy="${y - 1000}" r="${r}"/>`)
    }
    parts.push(`<g class="snow" fill="#ffffff" opacity="0.85">${flakes.join('')}</g>`)
  }

  const style =
    `<style>` +
    `.cloud{animation-name:drift;animation-timing-function:linear;animation-iteration-count:infinite}` +
    `@keyframes drift{from{transform:translateX(-1900px)}to{transform:translateX(1900px)}}` +
    `.rain{animation:fall 2.6s linear infinite}` +
    `@keyframes fall{from{transform:translate(0,0)}to{transform:translate(-60px,1000px)}}` +
    `.snow{animation:fall 30s linear infinite}` +
    `.star{animation:twinkle 7s ease-in-out infinite}` +
    `.s1{animation-delay:-2.3s}.s2{animation-delay:-4.6s}` +
    `@keyframes twinkle{0%,100%{opacity:0.9}50%{opacity:0.45}}` +
    `.glint{animation:shimmer 9s ease-in-out infinite}` +
    `.g1{animation-delay:-3s}.g2{animation-delay:-6s}` +
    `@keyframes shimmer{0%,100%{opacity:0.15}50%{opacity:0.45}}` +
    `.sun{animation:glow 14s ease-in-out infinite}` +
    `@keyframes glow{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}` +
    `.sun{transform-origin:1260px 170px}` +
    `.lupin{transform-box:fill-box;transform-origin:50% 100%;animation:sway 8s ease-in-out infinite}` +
    `.l1{animation-delay:-4s}` +
    `@keyframes sway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}` +
    `.mist{animation:breathe 20s ease-in-out infinite}` +
    `@keyframes breathe{0%,100%{transform:translateX(-40px)}50%{transform:translateX(40px)}}` +
    `</style>`

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">` +
    style +
    parts.join('') +
    `</svg>`
  )
}

// ---------------------------------------------------------------- hooks

async function refresh($: EngineInterface, city: string): Promise<Weather> {
  const live = await fetchWeather($, city)
  const now = live ?? { ...(await read($, weather)), city }
  await update($, weather, () => now)
  $.ui.status(describe(now))

  return now
}

export const register: Register = (on, options) => {
  const city = typeof options.city === 'string' && options.city in CITIES ? options.city : 'Wellington'

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) $.ui.toast(unpainted)

    await $.command.register({
      name: 'nz-weather',
      description: 'Show the weather for your NZ city, or switch city: /nz-weather auckland',
      argumentHint: '[city]',
    })

    const set = await $.theme.set(LOOK)
    if (!set.isDrawn) $.ui.status(set.reason)

    void refresh($, city)
    $.clock.every(REFRESH_MS, () => refresh($, city))

    return next(e)
  })

  on('command.run', { command: 'nz-weather' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    let place = city
    if (asked !== '') {
      const match = Object.keys(CITIES).find(name => name.toLowerCase() === asked)
      if (match === undefined) {
        return { text: `I don't know "${e.args.trim()}". Try one of: ${Object.keys(CITIES).join(', ')}.` }
      }
      place = match
      // Saved as the mod's city setting, so it sticks for later sessions too.
      const saved = await $.config.set({ key: `${PLUGIN}.city`, value: place })
      if ('deny' in saved && saved.deny !== undefined) {
        return { text: `Couldn't save ${place} as your city: ${saved.deny}` }
      }
    }
    const now = await refresh($, place)

    return {
      text: now.isLive
        ? `Kia ora! ${describe(now)}. The sky is updated.`
        : `Couldn't reach Open-Meteo just now, so the sky shows a fine-ish default for ${place}.`,
    }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.props.scene !== SCENE || e.props.plugin !== PLUGIN) return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)

    const { Shader, Svg } = $.ui.resolve(e)
    const w = await read($, weather)
    const still = (
      <Svg
        source={buildScene(w)}
        alt={`Aotearoa landscape under ${WORDS[skyOf(w.code)].toLowerCase()} skies in ${w.city}`}
      />
    )
    // Desktop plays the photographic scene on the GPU; the Svg stands in where it can't.
    if (e.surface !== 'desktop') return still

    return (
      <Shader module="./sky.ts" values={shaderValues(w)}>
        {still}
      </Shader>
    )
  })
}

// The weather as the shader reads it, each 0 to 1.
const LOOKS: Record<Sky, { cover: number; dark: number; rain: number; snow: number; fog: number }> = {
  clear: { cover: 0.05, dark: 0, rain: 0, snow: 0, fog: 0 },
  partly: { cover: 0.4, dark: 0.1, rain: 0, snow: 0, fog: 0 },
  overcast: { cover: 0.85, dark: 0.45, rain: 0, snow: 0, fog: 0.1 },
  fog: { cover: 0.6, dark: 0.3, rain: 0, snow: 0, fog: 0.85 },
  drizzle: { cover: 0.8, dark: 0.45, rain: 0.35, snow: 0, fog: 0.2 },
  rain: { cover: 0.9, dark: 0.6, rain: 0.85, snow: 0, fog: 0.15 },
  snow: { cover: 0.85, dark: 0.35, rain: 0, snow: 0.9, fog: 0.2 },
  storm: { cover: 0.97, dark: 0.9, rain: 1, snow: 0, fog: 0.1 },
}

function shaderValues(w: Weather) {
  return {
    ...LOOKS[skyOf(w.code)],
    day: w.isDay ? 1 : 0,
    wind: Math.min(1, w.windKmh / 60),
  }
}
