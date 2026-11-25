import { expect, test } from 'claude-code/testing'

import { buildScene } from '../hooks/register'

const BACKDROP = {
  plugin: 'aotearoa-weather',
  component: 'Backdrop',
  requestId: 'backdrop',
  props: { scene: 'aotearoa', plugin: 'aotearoa-weather', glass: false },
} as const

const reading = (code: number, isDay: number) =>
  JSON.stringify({ current: { temperature_2m: 13.4, weather_code: code, is_day: isDay, wind_speed_10m: 31 } })

test('every sky fits the Svg limit', () => {
  for (const code of [0, 2, 3, 45, 53, 63, 73, 95]) {
    for (const isDay of [true, false]) {
      const svg = buildScene({ city: 'Wellington', code, isDay, tempC: 12, windKmh: 20, isLive: true })
      expect(svg.length < 131072).toBe(true)
      expect(svg.includes('href')).toBe(false)
    }
  }
})

for (const [label, code, isDay] of [['rain by day', 63, 1], ['clear night', 0, 0], ['snow', 73, 1]] as const) {
  test(`the backdrop draws ${label} from the live reading`, async ($, on) => {
    let status = ''
    on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: reading(code, isDay) } }))
    on('theme.set', () => ({ value: { isDrawn: true, requestId: 'test' } }))
    on('command.register', () => ({ value: { command: 'nz-weather' } }))
    on('ui.status', (_, e) => {
      status = String(e.text ?? '')
      return { value: undefined }
    })
    on('session.start', (_, e) => ({ cwd: e.cwd }))

    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const ran = await $.command.run({ command: 'nz-weather', args: '' } as Parameters<typeof $.command.run>[0])
    expect(JSON.stringify(ran)).toContain('Wellington 13°')
    expect(status).toContain('km/h')

    for (const surface of ['desktop', 'mobile'] as const) {
      const ui = await $.ui.mount({ ...BACKDROP, surface })
      const svg = await ui.find({ type: 'Svg' })
      expect(svg).toBeDefined()
      await ui.unmount()
    }
  })
}
