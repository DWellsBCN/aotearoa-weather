import {
  abs,
  buffer,
  clamp,
  dot,
  exp,
  floor,
  fract,
  length,
  max,
  mix,
  picture,
  pow,
  range,
  shader,
  sin,
  size,
  smoothstep,
  step,
  time,
  values,
  vec2,
  vec3,
  vec4,
} from 'claude-code/shader'
import type { Buffer } from 'claude-code/shader'

// The weather, sent by the mod: each 0 to 1.
const v = values({
  cover: [0, 1],
  dark: [0, 1],
  rain: [0, 1],
  snow: [0, 1],
  fog: [0, 1],
  day: [0, 1],
  wind: [0, 1],
})

// y runs from 0 at the foot to 1 at the top.
const WATER = 0.285

function hash(p: vec2): number {
  let q = vec3(fract(vec3(p.x, p.y, p.x) * 0.1031))
  q = vec3(q + dot(q, vec3(q.y, q.z, q.x) + 33.33))

  return fract((q.x + q.y) * q.z)
}

function noise(p: vec2): number {
  const i = vec2(floor(p))
  const f = vec2(fract(p))
  const u = vec2(f * f * (3 - f * 2))
  const a = hash(i)
  const b = hash(vec2(i + vec2(1, 0)))
  const c = hash(vec2(i + vec2(0, 1)))
  const d = hash(vec2(i + vec2(1, 1)))

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y)
}

function fbm(p0: vec2): number {
  let p = p0
  let s = 0
  let a = 0.5
  for (const k of range(5)) {
    s += a * noise(vec2(p + k * 0.37))
    p = vec2(p * 2.03 + vec2(1.7, 9.2))
    a *= 0.5
  }

  return s
}

function fbm3(p0: vec2): number {
  let p = p0
  let s = 0
  let a = 0.5
  for (const k of range(3)) {
    s += a * noise(vec2(p + k * 0.37))
    p = vec2(p * 2.03 + vec2(1.7, 9.2))
    a *= 0.5
  }

  return s * 1.14
}

// Ridged noise: sharp crests, as alpine ridges have.
function ridge(x: number, seed: number): number {
  let s = 0
  let a = 0.5
  let f = 1
  for (const k of range(6)) {
    const n = noise(vec2(x * f, seed + k * 7.3))
    s += a * (1 - abs(n * 2 - 1))
    f *= 2.1
    a *= 0.48
  }

  return s
}

function farH(x: number): number {
  return 0.3 + 0.5 * pow(ridge(x * 0.85 + 3.1, 11), 2.3)
}

function nearH(x: number): number {
  return 0.287 + 0.3 * pow(ridge(x * 1.5 + 8.7, 23), 2.6)
}

// Ridged 2D noise for rock faces and their gullies.
function faces(p: vec2): number {
  let s = 0
  let a = 0.5
  let q = p
  for (const k of range(4)) {
    s += a * (1 - abs(noise(vec2(q + k * 3.1)) * 2 - 1))
    q = vec2(q * 2.1)
    a *= 0.5
  }

  return s
}

function shoreH(x: number): number {
  return 0.2 + 0.016 * noise(vec2(x * 3, 5)) + 0.008 * noise(vec2(x * 13, 2))
}

// Rock, snow and bush on one range, lit from the upper left.
function range3(x: number, y: number, h: number, hl: number, hr: number, far: number): vec3 {
  const ridgeSlope = (hr - hl) / 0.004
  const fp = vec2(x * 9 + far * 5, y * 16)
  const e = 0.02
  const gx = faces(vec2(fp + vec2(e, 0))) - faces(vec2(fp - vec2(e, 0)))
  const gy = faces(vec2(fp + vec2(0, e))) - faces(vec2(fp - vec2(0, e)))
  const n = vec3(-gx * 6 + ridgeSlope * 0.25, -gy * 3, 1)
  const sunDir = vec3(-0.62, 0.45, 0.65)
  const light = clamp(dot(n, sunDir) / length(n) * 1.25, 0.12, 1.2)
  const grit = noise(vec2(x * 220, y * 260))
  const rock = vec3(mix(vec3(0.33, 0.33, 0.35), vec3(0.47, 0.44, 0.41), noise(vec2(x * 30, y * 50))) * light * (0.85 + 0.3 * grit))
  // snow lies above a snowline and in the gullies a little below it
  const snowLine = 0.47 + 0.05 * noise(vec2(x * 6, 3)) - far * 0.03
  const gully = faces(vec2(x * 22, y * 40))
  const isSnow = smoothstep(snowLine - 0.004, snowLine + 0.004, y + 0.06 * (gully - 0.55) - 0.04 * gy)
  const snowCol = vec3(vec3(0.95, 0.97, 1.0) * (0.55 + 0.55 * light))
  // bush and tussock on the lower slopes
  const bushAmt = smoothstep(0.37, 0.32, y) * (1 - far * 0.7)
  const bush = vec3(vec3(0.13, 0.2, 0.1) * (0.55 + 0.9 * grit) * (0.5 + 0.6 * light))
  let c = vec3(mix(rock, bush, bushAmt))
  c = vec3(mix(c, snowCol, isSnow))
  // distance haze, thicker toward the valley floor
  const haze = far * 0.22 + 0.16 * smoothstep(0.36, WATER, y)

  return vec3(mix(c, vec3(0.66, 0.76, 0.88), haze))
}

// The still land, worked out once: rgb lit by day, alpha says what it is.
// 0 sky, 0.2 far range, 0.4 near range, 0.6 lake, 0.8 the near ground.
const land: Buffer = buffer({ once: true, scale: 1 }, p => {
  const asp = size.x / size.y
  const x = (p.uv.x - 0.5) * asp
  const y = p.uv.y
  const shore = shoreH(x)
  const right = asp * 0.5

  // pōhutukawa leaning in from the right
  const tc = vec2(right - 0.1, 0.215)
  const tq = vec2((vec2(x, y) - tc) / vec2(0.22, 0.11))
  const leaves = fbm(vec2(x * 22, y * 22))
  if (length(tq) < 0.62 + 0.6 * leaves) {
    const fine = noise(vec2(x * 260, y * 260))
    const clump = fbm3(vec2(x * 38 + 3, y * 38))
    const bloom = smoothstep(0.6, 0.68, clump) * smoothstep(0.35, 0.6, fine)
    const top = smoothstep(-0.6, 0.6, tq.y)
    const green = vec3(mix(vec3(0.05, 0.12, 0.06), vec3(0.2, 0.32, 0.17), top * 0.6 + fine * 0.4) * (0.6 + 0.6 * leaves))
    const red = vec3(mix(vec3(0.55, 0.04, 0.07), vec3(0.92, 0.12, 0.14), fine) * (0.7 + 0.4 * top))

    return vec4(mix(green, red, bloom * 0.9), 0.8)
  }
  const bend = 0.03 * sin(y * 18)
  if (abs(x - (right - 0.06) - bend) < 0.014 && y < 0.17) {
    return vec4(vec3(0.24, 0.16, 0.1) * (0.7 + 0.5 * noise(vec2(x * 300, y * 40))), 0.8)
  }

  // harakeke (flax) on the left: sword leaves fanning up, two flower stalks
  const bx = -asp * 0.5 + 0.1
  for (const k of range(11)) {
    const lean = (k / 10 - 0.5) * 1.5
    const tall = 0.13 + 0.09 * hash(vec2(k, 4))
    const up = y / tall
    const cx = bx + lean * y * 0.7 + lean * up * up * 0.05
    const half = 0.007 * (1 - up)
    if (up > 0 && up < 1 && abs(x - cx) < half) {
      const edge = abs(x - cx) / max(half, 0.0001)
      const leaf = vec3(mix(vec3(0.12, 0.27, 0.1), vec3(0.3, 0.36, 0.16), edge) * (0.6 + 0.6 * hash(vec2(k, 8))))

      return vec4(leaf, 0.8)
    }
  }
  for (const k of range(2)) {
    const sx = bx + (k - 0.5) * 0.03 + 0.008 * sin(y * 30)
    if (abs(x - sx) < 0.0015 && y < 0.3 + k * 0.03) {
      return vec4(vec3(0.2, 0.13, 0.08), 0.8)
    }
    const fl = fract(y * 70)
    if (y > 0.22 && y < 0.3 + k * 0.03 && abs(x - sx - 0.006) < 0.004 && fl < 0.35) {
      return vec4(vec3(0.6, 0.12, 0.08), 0.8)
    }
  }

  // lupins along the shore
  const w = 0.0085
  const cell = floor(x / w)
  const hr = hash(vec2(cell, 3))
  const mid = smoothstep(0.12 * asp, 0.3 * asp, abs(x))
  if (hr > 0.62 - mid * 0.25) {
    const cx = (cell + 0.5) * w + (hash(vec2(cell, 9)) - 0.5) * w * 0.4
    const base = shore - 0.004 - 0.045 * hash(vec2(cell, 7))
    const tall = 0.03 + 0.035 * hash(vec2(cell, 5))
    const up = (y - base) / tall
    const dx = abs(x - cx)
    if (up > 0 && up < 1 && dx < 0.0034 * (1 - up * 0.75)) {
      const pick = hash(vec2(cell, 11))
      let hue = vec3(0.52, 0.27, 0.78)
      if (pick > 0.4) hue = vec3(0.86, 0.35, 0.62)
      if (pick > 0.65) hue = vec3(0.95, 0.75, 0.15)
      if (pick > 0.85) hue = vec3(0.35, 0.42, 0.88)
      const floret = 0.6 + 0.4 * sin(y * 2600) * (1 - dx / 0.0034)

      return vec4(hue * floret * (0.75 + up * 0.35), 0.8)
    }
    if (dx < 0.0007 && y < base + 0.002 && y > base - 0.03) {
      return vec4(vec3(0.16, 0.32, 0.12), 0.8)
    }
  }

  // tussock and pasture in front
  if (y < shore) {
    const band = fbm3(vec2(x * 7, y * 46))
    const blade = noise(vec2(x * 160, y * 70))
    let g = vec3(mix(vec3(0.24, 0.46, 0.15), vec3(0.62, 0.53, 0.24), smoothstep(0.5, 0.72, fbm3(vec2(x * 2.5, y * 9)))))
    g = vec3(g * (0.6 + 0.55 * band) * (0.82 + 0.3 * blade) * (0.55 + 2.2 * y))

    return vec4(g, 0.8)
  }

  if (y < WATER) return vec4(vec3(0.05, 0.42, 0.47), 0.6)

  const nh = nearH(x)
  if (y < nh) return vec4(range3(x, y, nh, nearH(x - 0.002), nearH(x + 0.002), 0), 0.4)

  const fh = farH(x)
  if (y < fh) return vec4(range3(x, y, fh, farH(x - 0.002), farH(x + 0.002), 1), 0.2)

  return vec4(0, 0, 0, 0)
})

function skyGrad(y: number): vec3 {
  const gloom = v.cover * (0.4 + 0.6 * v.dark)
  const up = smoothstep(0.3, 1.0, y)
  const blue = vec3(mix(vec3(0.66, 0.8, 0.93), vec3(0.13, 0.36, 0.74), up))
  const grey = vec3(mix(vec3(0.74, 0.77, 0.8), vec3(0.5, 0.54, 0.59), up) * (1 - 0.35 * v.dark))
  const dayCol = vec3(mix(blue, grey, clamp(gloom * 1.2, 0, 1)))
  const nightCol = vec3(mix(vec3(0.05, 0.08, 0.15), vec3(0.004, 0.01, 0.035), up))

  return vec3(mix(nightCol, dayCol, v.day))
}

export default shader({
  fps: 30,
  passes: [
    land,
    picture(p => {
      const asp = size.x / size.y
      const x = (p.uv.x - 0.5) * asp
      const y = p.uv.y
      const t = land.sample(p.uv)
      const kind = t.a
      const gloom = v.cover * (0.4 + 0.6 * v.dark)
      const lightC = vec3(mix(vec3(0.17, 0.21, 0.33), vec3(1 - 0.45 * gloom), v.day))
      const sun = vec2(-0.32 * asp, 0.82)
      let col = vec3(0)

      if (kind < 0.1) {
        col = skyGrad(y)
        const ds = length(vec2(x, y) - sun)
        const clearness = 1 - v.cover * 0.9
        // sun by day
        const glow = exp(-ds * 5) * 0.3 + exp(-ds * 35) * 0.55 + smoothstep(0.032, 0.028, ds) * 0.8
        col = vec3(col + vec3(1.0, 0.92, 0.75) * glow * clearness * v.day)
        // moon, stars and the Milky Way by night
        const night = (1 - v.day) * clearness
        const dm = length(vec2(x, y) - vec2(0.3 * asp, 0.8))
        const moon = smoothstep(0.03, 0.027, dm) * (0.8 + 0.2 * noise(vec2(x * 90, y * 90)))
        col = vec3(col + vec3(0.9, 0.9, 0.82) * (moon + exp(-dm * 14) * 0.12) * (1 - v.day) * (1 - v.cover * 0.6))
        const sc = vec2(floor(p.point / 2.5))
        const sh = hash(sc)
        const twinkle = 0.75 + 0.25 * sin(time * 0.9 + sh * 80)
        col = vec3(col + vec3(step(0.9965, sh) * twinkle * night))
        const band = exp(-pow((y - 0.62 - x * 0.35) * 5, 2))
        col = vec3(col + vec3(0.12, 0.13, 0.18) * band * fbm3(vec2(x * 7, y * 7)) * night)

        // clouds on a plane overhead, nearer ones bigger, lit from the sun's side
        const hgt = max(y - 0.3, 0) + 0.12
        const drift = time * (0.006 + 0.03 * v.wind)
        const cp = vec2(x * 0.5 / hgt + drift, 0.9 / hgt)
        const warp = fbm3(vec2(cp * 0.6 + 4.1))
        const d = fbm(vec2(cp + warp * 0.6))
        const lo = 0.77 - v.cover * 0.5
        const cov = smoothstep(lo, lo + 0.1, d)
        const lit = fbm3(vec2(cp + warp * 0.6 + vec2(-0.12, 0.09)))
        const belly = smoothstep(lo, lo + 0.32, d)
        const shade = clamp(1.0 + (d - lit) * 2.4, 0.6, 1.15) * mix(1, 0.86 - 0.22 * v.dark, belly)
        const dayCloud = vec3(mix(vec3(1.0, 0.98, 0.95), vec3(0.34, 0.37, 0.42), v.dark) * shade)
        const nightCloud = vec3(vec3(0.1, 0.12, 0.18) * shade)
        const cloud = vec3(mix(nightCloud, dayCloud, v.day))
        col = vec3(mix(col, cloud, cov * smoothstep(0.3, 0.4, y)))
        // the long white cloud
        const lw = exp(-pow((y - 0.6 - 0.02 * sin(x * 2)) / 0.028, 2))
        const ln = smoothstep(0.42, 0.66, fbm3(vec2(x * 1.6 + time * 0.004, y * 14)))
        col = vec3(mix(col, cloud, lw * ln * 0.85))
      } else if (kind > 0.5 && kind < 0.7) {
        // the lake mirrors what is above it, broken up by the wind
        const ripple = (noise(vec2(x * 9, y * 260 + time * 0.7)) - 0.5) * (0.003 + 0.012 * v.wind)
        const my = WATER * 2 - y
        const ruv = vec2(p.uv.x + ripple / asp, my)
        const r = land.sample(ruv)
        let mirror = vec3(skyGrad(my) * 0.92)
        if (r.a > 0.1) mirror = vec3(r.rgb * lightC)
        const depth = smoothstep(WATER, 0.2, y)
        const water = vec3(vec3(0.03, 0.36, 0.42) * lightC)
        col = vec3(mix(mirror, water, 0.25 + 0.45 * depth + 0.25 * v.wind))
        // a sun path on the water
        const glint = step(0.8, noise(vec2(x * 60, y * 500 + time * 0.5))) * exp(-abs(x - sun.x) * 9)
        col = vec3(col + vec3(glint * 0.5 * v.day * (1 - v.cover)))
      } else {
        col = vec3(t.rgb * lightC)
        // grey days flatten colour
        const g = dot(col, vec3(0.3, 0.55, 0.15))
        col = vec3(mix(col, vec3(g), gloom * 0.35))
      }

      // fog settles in the valley
      const fogCol = vec3(mix(vec3(0.07, 0.08, 0.1), vec3(0.84, 0.86, 0.87), v.day))
      const fogAmt = v.fog * smoothstep(0.6, 0.16, y) * (0.5 + 0.5 * fbm3(vec2(x * 1.4 + time * 0.012, y * 5)))
      col = vec3(mix(col, fogCol, clamp(fogAmt, 0, 0.92)))

      // rain: thin slanted streaks and a grey veil
      const q = vec2(x * 130 + y * 16, y * 2.5 + time * 1.4)
      const lane = floor(q.x)
      const lh = hash(vec2(lane, 1))
      const fall = fract(q.y + lh * 13)
      const streak = step(0.9, lh) * smoothstep(0, 0.04, fall) * smoothstep(0.3, 0.06, fall) * smoothstep(0.5, 0.15, abs(fract(q.x) - 0.5))
      col = vec3(mix(col, vec3(0.6, 0.65, 0.7) * (0.3 + 0.7 * v.day), 0.22 * v.rain))
      col = vec3(col + vec3(0.7, 0.75, 0.8) * streak * 0.22 * v.rain * (0.4 + 0.6 * v.day))

      // snow: two depths of soft flakes
      for (const k of range(2)) {
        const s = 34 + k * 26
        const sq = vec2(x * s + sin(time * 0.4 + y * 5 + k) * 0.5, y * s + time * (1.1 - k * 0.4))
        const sc2 = vec2(floor(sq))
        const sh2 = hash(vec2(sc2 + k * 17))
        const centre = vec2(sc2 + 0.5 + (vec2(hash(vec2(sc2 + 3)), hash(vec2(sc2 + 7))) - 0.5) * 0.6)
        const flake = step(0.8, sh2) * smoothstep(0.2, 0.05, length(sq - centre))
        col = vec3(mix(col, vec3(0.97, 0.98, 1.0) * (0.4 + 0.6 * v.day), flake * v.snow * (0.9 - k * 0.3)))
      }

      return vec4(clamp(col, 0, 1), 1)
    }),
  ],
})
