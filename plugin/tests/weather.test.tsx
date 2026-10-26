// Weather over the landscape: which hours it rains, snows or fogs, what each looks like, the party's light reaction,
// /pokemon-play previews, and that none of it costs the sleeping band a frame.
import { expect, test } from 'claude-code/testing'

import { backdrop, landscapeAt, LANDSCAPES, LIGHT } from '../hooks/backdrop'
import type { Landscape, Phase } from '../hooks/backdrop'
import { ALL_HELP, PLAY, suggest } from '../hooks/commands'
import { emptySave, level } from '../hooks/save'
import { frame, initialStatus, newScene, pose, SLEEP_TICKS, step } from '../hooks/scene'
import type { Status } from '../hooks/scene'
import { drawWeather, SHADES, SNOWY, stir, weatherAt, WEATHERS } from '../hooks/weather'
import type { Weather } from '../hooks/weather'
import { begin, cmd, KIT, LIST, member, mountBand } from './world'

const W = 90
const H = 28
// The landscape at tick `t`, then `weather` over it; with what each pixel is.
const paint = (phase: Phase, landscape: Landscape, weather: Weather, t = 0) => {
  const out = { pixels: Array<number>(W * H).fill(-1), width: W, height: H }
  const kind = backdrop(out, phase, landscape, t)
  drawWeather(out, kind, weather, phase, t)
  return { pixels: out.pixels, kind: [...kind] }
}
const changed = (a: number[], b: number[]) => a.filter((c, i) => c !== b[i]).length
const decode = (cells: string) => [...new Uint32Array(Uint8Array.from(atob(cells), c => c.charCodeAt(0)).buffer)]

test('the weather is picked per hour, the same all hour, mostly clear, snow only on cold ground', () => {
  const hours = Array.from({ length: 24_000 }, (_, h) => 400_000 + h)
  const share = (landscape: Landscape, w: Weather) =>
    hours.filter(h => weatherAt(h, landscape) === w).length / hours.length
  expect(weatherAt(412_345, 'hills')).toBe(weatherAt(412_345, 'hills'))
  expect(Math.abs(share('mountains', 'rain') - 0.15)).toBeLessThan(0.02)
  expect(Math.abs(share('mountains', 'fog') - 0.08)).toBeLessThan(0.02)
  expect(share('mountains', 'snow')).toBeGreaterThan(0.06)
  expect(share('mountains', 'snow')).toBeLessThan(0.11)
  expect(share('mountains', 'clear')).toBeGreaterThan(0.6)
  for (const landscape of LANDSCAPES)
    expect([landscape, share(landscape, 'snow') > 0]).toEqual([landscape, SNOWY.includes(landscape)])
  expect(share('meadow', 'clear')).toBeGreaterThan(0.7)
  // Snow is likelier in the night and dawn hours.
  const cold = hours.filter(h => h % 24 < 7)
  const warm = hours.filter(h => h % 24 >= 7 && h % 24 < 19)
  const snowy = (list: number[]) => list.filter(h => weatherAt(h, 'forest') === 'snow').length / list.length
  expect(snowy(cold)).toBeGreaterThan(snowy(warm))
})

test('rain falls in streaks that move, splashes on the grass, and never covers the sun', () => {
  const clear = paint('day', 'meadow', 'clear', 0)
  const rain = paint('day', 'meadow', 'rain', 0)
  expect(changed(clear.pixels, rain.pixels)).toBeGreaterThan(W * 5)
  expect(changed(paint('day', 'meadow', 'rain', 0).pixels, paint('day', 'meadow', 'rain', 4).pixels)).toBeGreaterThan(
    20,
  )
  // The same at the same tick: every window shows the same drops.
  expect(paint('day', 'meadow', 'rain', 9).pixels).toEqual(paint('day', 'meadow', 'rain', 9).pixels)
  const ground = rain.pixels.slice((H - 2) * W, (H - 1) * W)
  expect(ground.filter(c => c === SHADES.day.rain).length).toBeGreaterThan(1)
  for (let t = 0; t < 200; t += 7) {
    const { pixels, kind } = paint('day', 'meadow', 'rain', t)
    expect(kind.every((k, i) => k !== LIGHT || pixels[i] === clear.pixels[i])).toBe(true)
  }
  const sun = clear.kind.filter(k => k === LIGHT).length
  expect(sun).toBeGreaterThan(5)
})

test('rain rings the lake, snow drifts down and settles, fog washes out the far landscape', () => {
  const lake = paint('day', 'lake', 'rain', 0)
  const water = (t: number) => {
    const { pixels, kind } = paint('day', 'lake', 'rain', t)
    return pixels.filter((c, i) => kind[i] === 1 && c === SHADES.day.rain).length
  }
  expect(lake.kind.includes(1)).toBe(true)
  expect([0, 10, 20, 30, 40].some(t => water(t) > 0)).toBe(true)
  const snow = paint('night', 'mountains', 'snow', 0)
  const moon = paint('night', 'mountains', 'clear', 0)
  expect(snow.pixels.filter(c => c === SHADES.night.flake).length).toBeGreaterThan(20)
  expect(snow.kind.every((k, i) => k !== LIGHT || snow.pixels[i] === moon.pixels[i])).toBe(true)
  expect(paint('night', 'mountains', 'snow', 40).pixels).not.toEqual(snow.pixels)
  // Fog changes the far rows, not the grass at the bottom.
  const fog = paint('day', 'hills', 'fog', 0)
  const plain = paint('day', 'hills', 'clear', 0)
  const rows = (px: number[], from: number, to: number) => px.slice(from * W, to * W)
  expect(changed(rows(fog.pixels, 8, 24), rows(plain.pixels, 8, 24))).toBeGreaterThan(W * 10)
  expect(rows(fog.pixels, H - 1, H)).toEqual(rows(plain.pixels, H - 1, H))
})

test('the band draws the weather it is given behind the party', () => {
  const sprite = { pixels: Array<number>(64).fill(0xabcdef), width: 8, height: 8 }
  const s: Status = { ...initialStatus(), actors: [{ ...newScene(30), roam: { kind: 'idle', left: 1e9, age: 0 } }] }
  const dry = frame(s, [sprite], W, 14, { phase: 'day', landscape: 'meadow' })
  const wet = frame(s, [sprite], W, 14, { phase: 'day', landscape: 'meadow', weather: 'rain' })
  expect(changed(dry.pixels, wet.pixels)).toBeGreaterThan(W * 5)
  expect(wet.pixels.filter(c => c === 0xabcdef).length).toBe(64)
})

test('a Water type hops alone in the rain now and then; nobody stirs asleep, nor for fog', () => {
  const party = [member('pikachu'), member('vaporeon')]
  const idle = (x: number) => ({ ...newScene(x), roam: { kind: 'idle' as const, left: 1e9, age: 0 } })
  const awake: Status = { ...initialStatus(), actors: [idle(10), idle(40)] }
  const hop = stir(awake, 'rain', party, false, () => 0)
  expect(hop.mood).toEqual({ kind: 'hop', t: 0, actor: 1 })
  let s = hop
  for (let i = 0; i < 8; i++) s = step(s, W, [8, 8])
  expect(pose(s, 8, 1).lift).toBeGreaterThan(0)
  expect(pose(s, 8, 0).lift).toBe(0)
  expect(stir(awake, 'rain', party, true, () => 0)).toBe(awake)
  expect(stir(awake, 'fog', party, false, () => 0)).toBe(awake)
  expect(stir(awake, 'rain', [member('pikachu'), member('eevee')], false, () => 0)).toBe(awake)
  // Rare: about once in 40 seconds of ticks.
  let seed = 3
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  let hops = 0
  for (let i = 0; i < 8000; i++) if (stir(awake, 'rain', party, false, rand) !== awake) hops++
  expect(hops).toBeGreaterThan(3)
  expect(hops).toBeLessThan(25)
  // Its idle time runs on, so the rain never keeps them awake.
  const late: Status = { ...awake, idleTicks: SLEEP_TICKS - 5 }
  expect(stir(late, 'rain', party, false, () => 0).idleTicks).toBe(SLEEP_TICKS - 5)
})

test('/pokemon-help and the typeahead offer the weather words', () => {
  for (const w of WEATHERS) {
    expect([w, ALL_HELP.includes(w)]).toEqual([w, true])
    expect(PLAY.some(s => s.word === w)).toBe(true)
  }
  const owned = { party: [], box: [], bag: {}, levelOf: (m: { xp: number }) => level(m.xp) }
  const texts = (text: string) => {
    const start = /\S*$/.exec(text)?.index ?? text.length
    return suggest(text, text.length, text.slice(start), start, owned as never).map(r => r.text)
  }
  expect(texts('/pokemon-play r')).toEqual(['rain '])
  expect(texts('/pokemon-play s')).toContain('snow ')
  expect(texts('/pokemon-play f')).toEqual(['faint', 'forest ', 'fog '])
  expect(texts('/pokemon-play rain ')).toEqual(LANDSCAPES)
})

test('/pokemon-play rain shows rain for 15 seconds, with a time and a place too', KIT, async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('vaporeon')] })
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
  await band.drawn()
  expect(await cmd($, 'pokemon-play', 'day rain meadow')).toBe('Showing day rain meadow for 15 seconds.')
  await w.clock.advance(500)
  expect(decode(w.band.cells).includes(SHADES.day.rain)).toBe(true)
  expect(await cmd($, 'pokemon-play', 'night snow mountains')).toBe('Showing night snow mountains for 15 seconds.')
  await w.clock.advance(500)
  expect(decode(w.band.cells).includes(SHADES.night.flake)).toBe(true)
  expect(await cmd($, 'pokemon-play', 'fog')).toBe('Showing fog for 15 seconds.')
  expect(await cmd($, 'pokemon-play', 'day clear meadow')).toBe('Showing day clear meadow for 15 seconds.')
  await w.clock.advance(500)
  expect(decode(w.band.cells).includes(SHADES.day.rain)).toBe(false)
  expect(await cmd($, 'pokemon-play', 'dance')).toContain('rain, snow, fog')
})

// The plugin's hour at clock 0, as world.tsx works it out.
const offsetHours = (-new Date().getTimezoneOffset() || 480) / 60

test('asleep in the rain, the band still draws at most five frames a second', KIT, async ($, on) => {
  // An hour of rain from its start, with the landscape it falls on.
  const hour = Array.from({ length: 24 * 60 }, (_, h) => offsetHours + h).find(
    h => weatherAt(h, landscapeAt(h)) === 'rain',
  )
  expect(hour).toBeDefined()
  const now = ((hour ?? 0) - offsetHours) * 3_600_000
  const net = { isOnline: true, list: JSON.stringify(LIST), now }
  const w = await begin($, on, { ...emptySave(), party: [member('vaporeon', { next: [] })] }, undefined, undefined, net)
  await cmd($, 'pokemon', 'party')
  const band = (await mountBand($)) as { drawn: () => Promise<unknown> }
  await band.drawn()
  // Dozing at once, as after five idle minutes (the minutes themselves are idle.test.tsx's).
  expect(await cmd($, 'pokemon-play', 'sleep')).toBe('Playing sleep.')
  await w.clock.advance(2000)
  const before = w.band.frames
  for (let i = 0; i < 20; i++) await w.clock.advance(1000)
  const asleep = (w.band.frames - before) / 20
  expect(asleep > 2 && asleep <= 5).toBe(true)
  // The rain is still falling on the sleeping band.
  const cells = decode(w.band.cells)
  expect(Object.values(SHADES).some(s => cells.includes(s.rain))).toBe(true)
})
