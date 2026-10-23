// Manual evolution: a Pokémon that can evolve waits, marked ready, until /pokemon evolve; /pokemon evolve auto brings
// back evolving by itself.
import { expect, test } from 'claude-code/testing'

import { SCREEN_MS } from '../hooks/evolution-screen'
import { emptySave, xpForLevel } from '../hooks/save'
import { CHAIN_OF, CHAINS as REAL_CHAINS, LIST as REAL_LIST } from './fixtures/evolutions'
import {
  answerTools,
  ART,
  bash,
  begin,
  CHAINS,
  cmd,
  end,
  fire,
  hourAt,
  LIST,
  lv,
  member,
  mountBand,
  until,
} from './world'

// Eevee with two branches that both come at Lv 30, so the person picks.
const eevees = {
  species: { name: 'eevee' },
  evolves_to: [end('vaporeon', [{ min_level: 30 }]), end('espeon', [{ min_level: 30 }])],
}
const branching = { isOnline: true, list: JSON.stringify(LIST), chains: { ...CHAINS, eevee: eevees } }

test('a Pokémon that can evolve waits, is announced once, and evolves when asked', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, { ...emptySave(), party: [member('charmander', { xp: xpForLevel(16) - 5 })] })
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.toasts.length > 0)
  expect(w.toasts).toEqual(['Charmander is ready to evolve! /pokemon evolve charmander'])
  expect(w.saveNow().party[0]).toMatchObject({ species: 'charmander', isAnnounced: true })
  const party = await cmd($, 'pokemon', 'party')
  expect(party).toContain('· ready to evolve')
  expect(party).toContain("/pokemon evolve <name> evolves a Pokémon that's ready.")
  await $.tool.call(bash('git commit -m y') as never)
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.toasts.length).toBe(1)
  expect(w.saveNow().party[0]?.species).toBe('charmander')
  expect(await cmd($, 'pokemon', 'evolve charmander')).toBe('Charmander evolved into Charmeleon!')
  expect(w.toasts.at(-1)).toBe('What? Charmander evolved into Charmeleon!')
  expect(w.saveNow().party[0]).toMatchObject({ species: 'charmeleon', evolutions: 1 })
  expect(w.saveNow().dex.charmeleon).toMatchObject({ seen: 1, caught: 1 })
  expect(w.saveNow().party[0]?.isAnnounced).toBeUndefined()
  expect(await cmd($, 'pokemon', 'party')).not.toContain('ready to evolve')
})

test('/pokemon evolve asks which way a branching Pokémon goes, and takes the one named', async ($, on) => {
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee', { xp: xpForLevel(30) })] },
    undefined,
    undefined,
    branching,
  )
  await until($, () => w.toasts.length > 0)
  expect(await cmd($, 'pokemon', 'evolve eevee')).toBe(
    'Eevee can evolve into Vaporeon or Espeon.\nPick one: /pokemon evolve eevee <name>',
  )
  expect(await cmd($, 'pokemon', 'evolve eevee pikachu')).toBe(
    "Eevee can't evolve into Pikachu. It can evolve into Vaporeon or Espeon.",
  )
  expect(w.saveNow().party[0]?.species).toBe('eevee')
  expect(await cmd($, 'pokemon', 'evolve eevee espeon')).toBe('Eevee evolved into Espeon!')
  expect(w.saveNow().party[0]?.species).toBe('espeon')
})

test('/pokemon evolve tells twins apart by number', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('charmander', { id: 'a', xp: xpForLevel(5) }),
      member('charmander', { id: 'b', xp: xpForLevel(16) }),
    ],
  })
  expect(await cmd($, 'pokemon', 'evolve charmander')).toContain('Which Charmander?')
  expect(await cmd($, 'pokemon', 'evolve charmander 2')).toBe('Charmander evolved into Charmeleon!')
  expect(w.saveNow().party.map(m => [m.id, m.species])).toEqual([
    ['a', 'charmander'],
    ['b', 'charmeleon'],
  ])
})

test("/pokemon evolve says why when it can't", async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('charmander', { xp: xpForLevel(10) }),
      member('charizard'),
      member('pikachu', { xp: xpForLevel(30), heldItem: 'everstone' }),
    ],
  })
  expect(await cmd($, 'pokemon', 'evolve')).toMatch(/^Evolution is manual\. .*\/pokemon evolve <name>/)
  expect(await cmd($, 'pokemon', 'evolve charmander')).toBe('Charmander evolves at Lv 16.')
  expect(await cmd($, 'pokemon', 'evolve charmander pikachu')).toBe(
    "Charmander can't evolve into Pikachu. It can evolve into Charmeleon.",
  )
  expect(await cmd($, 'pokemon', 'evolve charizard')).toBe("Charizard doesn't evolve any further.")
  expect(await cmd($, 'pokemon', 'evolve charizard pikachu')).toBe("Charizard doesn't evolve any further.")
  expect(await cmd($, 'pokemon', 'evolve pikachu')).toBe("Pikachu holds an everstone: it won't evolve.")
  expect(await cmd($, 'pokemon', 'evolve vaporeon')).toContain('No vaporeon in your party.')
  await cmd($, 'pokemon', 'off')
  expect(await cmd($, 'pokemon', 'evolve charmander')).toBe('Your Pokémon are resting. /pokemon on brings them back.')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['charmander', 'charizard', 'pikachu'])
  expect(w.toasts).toEqual([])
})

test('evolution is manual by default; /pokemon evolve auto evolves anyone waiting, and manual switches back', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('charmander', { xp: xpForLevel(16) })] })
  expect(await cmd($, 'pokemon', 'evolve')).toContain('Evolution is manual.')
  await until($, () => w.toasts.length > 0)
  expect(w.saveNow().party[0]?.species).toBe('charmander')
  // /pokemon evolution is the screen's style, not the mode.
  expect(await cmd($, 'pokemon', 'evolution white')).toContain('Evolution screen: white')
  expect(w.saveNow()).toMatchObject({ evolution: 'manual', evolutionStyle: 'white' })
  expect(await cmd($, 'pokemon', 'evolve auto')).toBe(
    'Evolution: auto. Your Pokémon evolve by themselves as soon as they can.',
  )
  await until($, () => w.saveNow().party[0]?.species === 'charmeleon')
  expect(w.saveNow().evolution).toBe('auto')
  expect(w.saveNow().dex.charmeleon?.caught).toBe(1)
  expect(await cmd($, 'pokemon', 'evolve MANUAL')).toContain('Evolution: manual.')
  expect(w.saveNow()).toMatchObject({ evolution: 'manual', evolutionStyle: 'white' })
})

test('switching to manual while an automatic evolution downloads stops it', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    evolution: 'auto',
    party: [member('charmander', { xp: xpForLevel(16) - 5 })],
  })
  await cmd($, 'pokemon', 'party')
  let open = () => {}
  w.net.stall = new Promise<void>(resolve => (open = resolve))
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.fetched.some(url => url.endsWith('/regular/charmeleon')))
  expect(await cmd($, 'pokemon', 'evolve manual')).toContain('Evolution: manual.')
  w.net.stall = undefined
  open()
  for (let i = 0; i < 30; i++) await cmd($, 'pokemon', 'party')
  expect(w.saveNow().evolution).toBe('manual')
  expect(w.saveNow().party[0]?.species).toBe('charmander')
  expect(await cmd($, 'pokemon', 'party')).toContain('· ready to evolve')
})

test('switching to manual during one automatic evolution stops the next', async ($, on) => {
  answerTools(on)
  const w = await begin($, on, {
    ...emptySave(),
    evolution: 'auto',
    party: [
      member('charmander', { xp: xpForLevel(16) - 5 }),
      member('pikachu', { xp: xpForLevel(30) - 5, gender: 'male' }),
    ],
  })
  await cmd($, 'pokemon', 'party')
  await mountBand($)
  await $.tool.call(bash('git commit -m x') as never)
  await until($, () => w.toasts.includes('What? Charmander evolved into Charmeleon!'))
  await cmd($, 'pokemon', 'evolve manual')
  for (let i = 0; i < 20; i++) await w.clock.advance(500)
  expect(w.saveNow().party.map(m => m.species)).toEqual(['charmeleon', 'pikachu'])
})

test('putting the party to rest while /pokemon evolve downloads stops the evolution', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('charmander', { xp: xpForLevel(16) })] })
  await cmd($, 'pokemon', 'party')
  let open = () => {}
  w.net.stall = new Promise<void>(resolve => (open = resolve))
  const evolving = cmd($, 'pokemon', 'evolve charmander')
  await until($, () => w.fetched.some(url => url.endsWith('/regular/charmeleon')))
  await cmd($, 'pokemon', 'off')
  w.net.stall = undefined
  open()
  expect(await evolving).toBe('Your Pokémon are resting. /pokemon on brings them back.')
  expect(w.saveNow().isOff).toBe(true)
  expect(w.saveNow().party[0]?.species).toBe('charmander')
})

test('resting clears the ready label, here and after a minute', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('charmander', { xp: xpForLevel(16) })] })
  await until($, () => w.toasts.length > 0)
  expect(await cmd($, 'pokemon', 'party')).toContain('ready to evolve')
  await cmd($, 'pokemon', 'off')
  await w.clock.advance(61_000)
  expect(await cmd($, 'pokemon', 'party')).not.toContain('ready to evolve')
  expect(await cmd($, 'pokedex')).not.toContain('ready to evolve')
})

test('the branch hint for a twin names that twin, and works as suggested', async ($, on) => {
  const eevee = {
    species: { name: 'eevee' },
    evolves_to: [end('vaporeon', [{ min_level: 30 }]), end('espeon', [{ min_level: 30 }])],
  }
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [member('eevee', { id: 'a', xp: xpForLevel(30) }), member('eevee', { id: 'b', xp: xpForLevel(30) })],
    },
    undefined,
    undefined,
    { isOnline: true, list: JSON.stringify(LIST), chains: { ...CHAINS, eevee } },
  )
  const answer = await cmd($, 'pokemon', 'evolve eevee 2')
  expect(answer).toContain('Pick one:')
  const suggested = answer.split('Pick one: /pokemon ')[1]!.replace('<name>', 'espeon')
  expect(await cmd($, 'pokemon', suggested)).toBe('Eevee evolved into Espeon!')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['eevee', 'espeon'])
})

test('a stone still evolves at once with evolution manual', async ($, on) => {
  const pikachu = {
    species: { name: 'pikachu' },
    evolves_to: [end('raichu', [{ trigger: { name: 'use-item' }, item: { name: 'thunder-stone' } }])],
  }
  const w = await begin(
    $,
    on,
    { ...emptySave(), bag: { 'thunder-stone': 1 }, party: [member('pikachu')] },
    undefined,
    undefined,
    { isOnline: true, list: JSON.stringify(LIST), chains: { ...CHAINS, pikachu } },
  )
  expect(await cmd($, 'pokemon', 'give thunder stone pikachu')).toBe('Pikachu evolved into Raichu!')
  expect(w.saveNow().party[0]?.species).toBe('raichu')
  expect(w.saveNow().dex.raichu).toMatchObject({ seen: 1, caught: 1 })
  expect(w.saveNow().bag?.['thunder-stone'] ?? 0).toBe(0)
})

test('depositing a required party member clears readiness within a minute', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('mantyke'), member('remoraid')] })
  await until($, () => w.toasts.some(t => t.includes('Mantyke is ready')))
  expect(await cmd($, 'pokemon', 'party')).toContain('ready to evolve')
  await cmd($, 'pokemon', 'deposit remoraid')
  await w.clock.advance(61_000)
  expect(await cmd($, 'pokemon', 'party')).not.toContain('ready to evolve')
  expect(w.saveNow().party[0]?.species).toBe('mantyke')
})

// `/pokemon party` once the checks a change set off have run (no minute passes).
async function partyAfter($: Parameters<typeof cmd>[0], isDone: (text: string) => boolean) {
  let text = ''
  for (let i = 0; i < 20 && !isDone((text = await cmd($, 'pokemon', 'party'))); i++);
  return text
}

test('a Pokémon that stops being ready, here or in another session, loses its ready mark at once', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('mantyke'), member('remoraid')] })
  await until($, () => w.toasts.some(t => t.includes('Mantyke is ready')))
  await cmd($, 'pokemon', 'deposit remoraid')
  expect(await partyAfter($, text => !text.includes('ready to evolve'))).not.toContain('ready to evolve')
  await cmd($, 'pokemon', 'add remoraid')
  expect(await partyAfter($, text => text.includes('ready to evolve'))).toContain('ready to evolve')
  // Another session sets evolution to auto: nobody waits here any more, and Mantyke evolves.
  w.store.set('save', { ...w.saveNow(), evolution: 'auto' })
  expect(await cmd($, 'pokemon', 'party')).not.toContain('ready to evolve')
  await until($, () => w.saveNow().party[0]?.species === 'mantine')
})

test("one evolved in another session isn't ready in its new form, and is told about when it is", async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('charmander', { xp: xpForLevel(16) })] })
  await until($, () => w.toasts.length > 0)
  const [was] = w.saveNow().party
  const { next: _, isAnnounced: __, ...kept } = was!
  w.store.set('save', { ...w.saveNow(), party: [{ ...kept, species: 'charmeleon', evolutions: 1 }] })
  expect(await partyAfter($, text => text.includes('evolves at Lv 36'))).not.toContain('ready to evolve')
  w.store.set('save', { ...w.saveNow(), party: w.saveNow().party.map(m => ({ ...m, xp: xpForLevel(36) })) })
  await cmd($, 'pokemon', 'party')
  await until($, () => w.toasts.length > 1)
  expect(w.toasts).toEqual([
    'Charmander is ready to evolve! /pokemon evolve charmander',
    'Charmeleon is ready to evolve! /pokemon evolve charmeleon',
  ])
})

test('a request waiting its turn for one another session evolved meanwhile takes it no further', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('pikachu', { xp: xpForLevel(30), gender: 'male' }),
      member('charmander', { xp: xpForLevel(36), gender: 'male' }),
    ],
  })
  await until($, () => w.toasts.length === 2)
  let open = () => {}
  w.net.stall = new Promise<void>(resolve => (open = resolve))
  const first = cmd($, 'pokemon', 'evolve pikachu')
  await until($, () => w.fetched.some(url => url.endsWith('/regular/raichu')))
  const second = cmd($, 'pokemon', 'evolve charmander')
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  const s = w.saveNow()
  w.store.set('save', {
    ...s,
    party: s.party.map(m => {
      if (m.species !== 'charmander') return m
      const { next: _, isAnnounced: __, ...kept } = m
      return { ...kept, species: 'charmeleon', evolutions: 1 }
    }),
  })
  w.net.stall = undefined
  open()
  expect(await first).toBe('Pikachu evolved into Raichu!')
  expect(await second).toBe('Charmander already evolved.')
  expect(w.saveNow().party[1]).toMatchObject({ species: 'charmeleon', evolutions: 1 })
  // Each counted once: the one evolved here, and the other session's, whose save didn't count it.
  expect([w.saveNow().dex.raichu?.caught, w.saveNow().dex.charmeleon?.caught]).toEqual([1, 1])
})

test('losing what it evolves by while the sprite downloads stops the evolution', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('mantyke'), member('remoraid')] })
  await until($, () => w.toasts.some(t => t.includes('Mantyke is ready')))
  let open = () => {}
  w.net.stall = new Promise<void>(resolve => (open = resolve))
  const evolving = cmd($, 'pokemon', 'evolve mantyke')
  await until($, () => w.fetched.some(url => url.endsWith('/regular/mantine')))
  await cmd($, 'pokemon', 'deposit remoraid')
  w.net.stall = undefined
  open()
  expect(await evolving).toBe('Mantyke evolves with Remoraid in the party.')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['mantyke'])
})

test('a partner of the needed type put away in another session while the sprite downloads stops the evolution', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('pancham', { id: 'p', xp: xpForLevel(32) }), member('umbreon', { id: 'u' })],
  })
  await until($, () => w.toasts.some(t => t.includes('Pancham is ready')))
  let open = () => {}
  w.net.stall = new Promise<void>(resolve => (open = resolve))
  const evolving = cmd($, 'pokemon', 'evolve pancham')
  await until($, () => w.fetched.some(url => url.endsWith('/regular/pangoro')))
  const s = w.saveNow()
  w.store.set('save', { ...s, party: s.party.filter(m => m.id !== 'u'), box: s.party.filter(m => m.id === 'u') })
  w.net.stall = undefined
  open()
  expect(await evolving).toBe('Pancham evolves at Lv 32 with a Dark-type in the party.')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['pancham'])
})

test("a twin's ready toast names it by number, and the command it gives works", async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [
      member('charmander', { id: 'a', xp: xpForLevel(5) }),
      member('charmander', { id: 'b', xp: xpForLevel(16) }),
    ],
  })
  await until($, () => w.toasts.length > 0)
  expect(w.toasts).toEqual(['Charmander is ready to evolve! /pokemon evolve charmander 2'])
  const told = w.toasts[0]!.split('/pokemon ')[1]!
  expect(await cmd($, 'pokemon', told)).toBe('Charmander evolved into Charmeleon!')
  expect(w.saveNow().party.map(m => m.species)).toEqual(['charmander', 'charmeleon'])
})

test('a branch into two forms of one species is the person’s to pick', async ($, on) => {
  const owls = {
    species: { name: 'dartrix' },
    evolves_to: [
      end('decidueye', [
        { trigger: { name: 'level-up' }, min_level: 34 },
        { trigger: { name: 'level-up' }, min_level: 36, evolved_pokemon_form: { name: 'decidueye-hisui' } },
      ]),
    ],
  }
  const list = [...LIST, { name: 'dartrix', forms: ['regular'] }, { name: 'decidueye', forms: ['regular', 'hisui'] }]
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [member('dartrix', { id: 'a', xp: xpForLevel(34) }), member('dartrix', { id: 'b', xp: xpForLevel(34) })],
    },
    undefined,
    undefined,
    { isOnline: true, list: JSON.stringify(list), chains: { ...CHAINS, dartrix: owls, decidueye: owls } },
  )
  await until($, () => w.toasts.length === 2)
  expect(await cmd($, 'pokemon', 'evolve dartrix 1')).toBe(
    'Dartrix can evolve into Decidueye or Decidueye (Hisui).\nPick one: /pokemon evolve dartrix 1 <name>',
  )
  expect(await cmd($, 'pokemon', 'evolve dartrix 1 hisuian decidueye')).toBe('Dartrix evolved into Decidueye (Hisui)!')
  expect(await cmd($, 'pokemon', 'evolve dartrix decidueye')).toBe('Dartrix evolved into Decidueye!')
  expect(w.saveNow().party.map(m => [m.species, m.form])).toEqual([
    ['decidueye', 'hisui'],
    ['decidueye', 'regular'],
  ])
})

test('one with many looks to evolve into takes its own unasked, or the one named', async ($, on) => {
  const patterns = ['fancy', 'garden', 'ocean', 'sun', 'jungle']
  const wings = {
    species: { name: 'spewpa' },
    evolves_to: [
      end(
        'vivillon',
        patterns.map(p => ({ min_level: 12, evolved_pokemon_form: { name: `vivillon-${p}` } })),
      ),
    ],
  }
  const list = [...LIST, { name: 'spewpa', forms: ['regular'] }, { name: 'vivillon', forms: ['regular', ...patterns] }]
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [member('spewpa', { id: 'a', xp: xpForLevel(12) }), member('spewpa', { id: 'b', xp: xpForLevel(12) })],
    },
    undefined,
    undefined,
    { isOnline: true, list: JSON.stringify(list), chains: { ...CHAINS, spewpa: wings, vivillon: wings } },
  )
  await until($, () => w.toasts.length === 2)
  expect(await cmd($, 'pokemon', 'evolve spewpa 1')).toMatch(
    /^Spewpa evolved into Vivillon \((Fancy|Garden|Ocean|Sun|Jungle)\)!$/,
  )
  expect(await cmd($, 'pokemon', 'evolve spewpa vivillon jungle')).toBe('Spewpa evolved into Vivillon (Jungle)!')
  expect(w.saveNow().party[1]).toMatchObject({ species: 'vivillon', form: 'jungle' })
})

test('/pokemon evolve reads what people type: "into", a typo, a branch for later, a twin that isn\'t there', async ($, on) => {
  const eevees = {
    species: { name: 'eevee' },
    evolves_to: [
      end('vaporeon', [{ trigger: { name: 'use-item' }, item: { name: 'water-stone' } }]),
      end('espeon', [{ min_level: 30 }]),
    ],
  }
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('eevee', { xp: xpForLevel(30) }), member('charmander')] },
    undefined,
    undefined,
    { isOnline: true, list: JSON.stringify(LIST), chains: { ...CHAINS, eevee: eevees } },
  )
  await until($, () => w.toasts.length > 0)
  expect(await cmd($, 'pokemon', 'evolve eeve espeon')).toContain('Did you mean Eevee?')
  expect(await cmd($, 'pokemon', 'evolve eevee vaporeon')).toBe('Eevee evolves into Vaporeon with a Water Stone.')
  expect(await cmd($, 'pokemon', 'evolve charmander 2')).toContain('Which Charmander?')
  expect(await cmd($, 'pokemon', 'evolve eevee lv 50 espeon')).toMatch(/^No eevee lv 50 in your party\./)
  expect(w.saveNow().party.map(m => m.species)).toEqual(['eevee', 'charmander'])
  expect(await cmd($, 'pokemon', 'evolve eevee lv 30 into espeon')).toBe('Eevee evolved into Espeon!')
})

test("offline, one member that can't be looked up doesn't hide another that is ready", async ($, on) => {
  const dir = '/home/ash/.cache/claude-code-pokemon'
  const files = new Map([
    [`${dir}/pokemon.json`, JSON.stringify(LIST)],
    [`${dir}/sprites/regular/pikachu`, ART],
    [`${dir}/sprites/regular/charmander`, ART],
    [`${dir}/sprites/regular/charmeleon`, ART],
    [
      `${dir}/pokeapi/species-charmander.json`,
      JSON.stringify({ evolution_chain: { url: 'https://pokeapi.co/chain/charmander' } }),
    ],
    [`${dir}/pokeapi/chain-charmander.json`, JSON.stringify({ chain: fire })],
  ])
  const w = await begin(
    $,
    on,
    {
      ...emptySave(),
      party: [
        member('pikachu'),
        member('charmander', { xp: xpForLevel(40), gender: 'male', next: [lv('charmeleon', 16)] }),
      ],
    },
    ART,
    files,
    { isOnline: false, list: JSON.stringify(LIST) },
  )
  await until($, () => w.toasts.some(t => t.includes('Charmander is ready')))
  expect(await cmd($, 'pokemon', 'party')).toContain('ready to evolve')
})

test('the next stage is told about once the evolution has played', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('charmander', { xp: xpForLevel(40) })] })
  await until($, () => w.toasts.length > 0)
  await mountBand($)
  expect(await cmd($, 'pokemon', 'evolve charmander')).toBe('Charmander evolved into Charmeleon!')
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.toasts.at(-1)).toBe('What? Charmander evolved into Charmeleon!')
  for (let i = 0; i < 20 && w.toasts.length < 3; i++) await w.clock.advance(500)
  expect(w.toasts.at(-1)).toBe('Charmeleon is ready to evolve! /pokemon evolve charmeleon')
})

// Sprites 12 pixels tall: a band of 9 rows, room for the evolution screen.
const tall = (rgb: string) =>
  Array.from({ length: 6 }, () => `\x1b[38;2;${rgb}m\x1b[48;2;${rgb}m▀\x1b[0m`.repeat(6)).join('\n')
const screened = {
  isOnline: true,
  list: JSON.stringify(LIST),
  now: hourAt(12),
  sprites: { charmander: tall('1;2;3'), charmeleon: tall('7;8;9'), charizard: tall('4;5;6') },
}

test(
  '/pokemon evolve plays the evolution screen, keeping the surprise: the new form is told ready once it has ended',
  { timeoutMs: 60_000 },
  async ($, on) => {
    const w = await begin(
      $,
      on,
      { ...emptySave(), party: [member('charmander', { xp: xpForLevel(40), gender: 'male' })] },
      undefined,
      undefined,
      screened,
    )
    await until($, () => w.toasts.length > 0)
    await cmd($, 'pokemon', 'party')
    await mountBand($)
    await w.clock.advance(500)
    expect(await cmd($, 'pokemon', 'evolve charmander')).toBe('What? Charmander is evolving!')
    expect(w.saveNow().party[0]?.species).toBe('charmeleon')
    // Nothing more while the screen plays, Charmeleon's readiness least of all.
    for (let t = 0; t < SCREEN_MS - 1000; t += 500) await w.clock.advance(500)
    expect(w.toasts).toEqual(['Charmander is ready to evolve! /pokemon evolve charmander'])
    expect(await cmd($, 'pokemon', 'party')).not.toContain('ready to evolve')
    for (let i = 0; i < 20 && w.toasts.length < 3; i++) await w.clock.advance(500)
    expect(w.toasts).toEqual([
      'Charmander is ready to evolve! /pokemon evolve charmander',
      'What? Charmander evolved into Charmeleon!',
      'Charmeleon is ready to evolve! /pokemon evolve charmeleon',
    ])
    expect(await cmd($, 'pokemon', 'party')).toContain('ready to evolve')
  },
)

test(
  'a screen waiting for a visitor to leave keeps the new form from being told ready until it has played',
  { timeoutMs: 60_000 },
  async ($, on) => {
    const w = await begin(
      $,
      on,
      { ...emptySave(), party: [member('charmander', { xp: xpForLevel(40), gender: 'male' })] },
      undefined,
      undefined,
      { ...screened, sprites: { ...screened.sprites, caterpie: tall('0;255;255') } },
    )
    await until($, () => w.toasts.length > 0)
    await cmd($, 'pokemon', 'party')
    await mountBand($)
    await w.clock.advance(500)
    expect(await cmd($, 'pokemon-play', 'wild caterpie')).toBe('A wild Caterpie wanders by.')
    expect(await cmd($, 'pokemon', 'evolve charmander')).toBe('What? Charmander is evolving!')
    // The visitor stays a while; Charmeleon is looked up and due all along, but not told about.
    for (let i = 0; i < 10; i++) await w.clock.advance(500)
    expect(w.saveNow().party[0]?.next).toBeDefined()
    const evolving = () => w.toasts.filter(t => t.includes(' evolve'))
    expect(evolving()).toEqual(['Charmander is ready to evolve! /pokemon evolve charmander'])
    expect(await cmd($, 'pokemon', 'party')).not.toContain('ready to evolve')
    for (let i = 0; i < 300 && evolving().length < 3; i++) await w.clock.advance(500)
    expect(evolving().slice(1)).toEqual([
      'What? Charmander evolved into Charmeleon!',
      'Charmeleon is ready to evolve! /pokemon evolve charmeleon',
    ])
  },
)

test('/pokemon evolve answers within a second when its download stalls, and tells what came of it once', async ($, on) => {
  const w = await begin($, on, { ...emptySave(), party: [member('charmander', { xp: xpForLevel(16) })] })
  await until($, () => w.toasts.length > 0)
  let open = () => {}
  w.net.stall = new Promise<void>(resolve => (open = resolve))
  const evolving = cmd($, 'pokemon', 'evolve charmander')
  await until($, () => w.fetched.some(url => url.endsWith('/regular/charmeleon')))
  await w.clock.advance(1000)
  expect(await evolving).toBe('Evolving Charmander: what it comes to shows in a moment.')
  w.net.stall = undefined
  open()
  await until($, () => w.saveNow().party[0]?.species === 'charmeleon')
  for (let i = 0; i < 5; i++) await cmd($, 'pokemon', 'party')
  expect(w.toasts.filter(t => t.includes('Charmander'))).toEqual([
    'Charmander is ready to evolve! /pokemon evolve charmander',
    'What? Charmander evolved into Charmeleon!',
  ])
})

test(
  'a partner put away while another screen plays: no ready toast once it ends',
  { timeoutMs: 60_000 },
  async ($, on) => {
    const w = await begin(
      $,
      on,
      {
        ...emptySave(),
        bag: { 'rare-candy': 1 },
        party: [
          member('charmander', { xp: xpForLevel(16), gender: 'male' }),
          member('pancham', { xp: xpForLevel(31), gender: 'male' }),
          member('umbreon', { gender: 'male' }),
        ],
      },
      tall('1;2;3'),
      undefined,
      { isOnline: true, list: JSON.stringify(LIST), now: hourAt(12) },
    )
    await until($, () => w.toasts.some(t => t.includes('Charmander is ready')))
    await mountBand($)
    await w.clock.advance(500)
    expect(await cmd($, 'pokemon', 'evolve charmander')).toBe('What? Charmander is evolving!')
    // Pancham reaches Lv 32 with its Dark-type partner, then the partner goes, all while the screen plays.
    expect(await cmd($, 'pokemon', 'give rare candy pancham')).toContain('Lv 32')
    expect(await cmd($, 'pokemon', 'deposit umbreon')).toContain('PC box')
    for (let i = 0; i < 30; i++) await w.clock.advance(500)
    expect(w.toasts.some(t => t.includes('Pancham is ready'))).toBe(false)
    expect(w.saveNow().party.find(m => m.species === 'pancham')?.isAnnounced).toBeUndefined()
  },
)

test('a partner another window puts away just before the ready write: no ready toast', async ($, on) => {
  const w = await begin($, on, {
    ...emptySave(),
    party: [member('mantyke', { gender: 'male' })],
    // Looked up already: nothing about it is written before the ready check.
    box: [member('remoraid', { gender: 'male', next: [] })],
  })
  await until($, () => w.saveNow().party[0]?.next !== undefined)
  // Remoraid joins; as the check goes to save its announcement, another window has put it back in the PC box.
  let isArmed = false
  w.net.beforeGet = key => {
    if (!isArmed || key !== 'save') return
    isArmed = false
    const s = w.saveNow()
    w.store.set('save', { ...s, party: s.party.filter(m => m.species !== 'remoraid'), box: s.party.slice(1) })
  }
  const s = w.saveNow()
  w.store.set('save', { ...s, party: [...s.party, ...(s.box ?? [])], box: [] })
  await cmd($, 'pokemon', 'party')
  isArmed = true
  for (let i = 0; i < 20; i++) await w.clock.settle()
  expect(w.toasts.some(t => t.includes('Mantyke is ready'))).toBe(false)
  expect(w.saveNow().party.map(m => [m.species, m.isAnnounced])).toEqual([['mantyke', undefined]])
})

test(
  "another window's evolution waiting on its sprite: the new form isn't told ready before its screen",
  { timeoutMs: 60_000 },
  async ($, on) => {
    const w = await begin(
      $,
      on,
      { ...emptySave(), party: [member('charmander', { xp: xpForLevel(40), gender: 'male' })] },
      tall('1;2;3'),
      undefined,
      { isOnline: true, list: JSON.stringify(LIST), now: hourAt(12) },
    )
    await until($, () => w.toasts.length === 1)
    await mountBand($)
    await w.clock.advance(500)
    // Another window evolves it; Charmeleon's sprite is slow to come here.
    const s = w.saveNow()
    const { next: _, isAnnounced: __, ...kept } = s.party[0]!
    w.store.set('save', {
      ...s,
      party: [{ ...kept, species: 'charmeleon', evolutions: 1, evolvedAt: await w.clock.now() }],
    })
    let open = () => {}
    const held = new Promise<void>(resolve => (open = resolve))
    w.net.artStall = file => (file === 'charmeleon' ? held : undefined)
    await cmd($, 'pokemon', 'size normal')
    for (let i = 0; i < 20; i++) await w.clock.settle()
    expect(w.toasts.some(t => t.includes('Charmeleon is ready'))).toBe(false)
    open()
    for (let i = 0; i < 300 && !w.toasts.some(t => t.includes('Charmeleon is ready')); i++) await w.clock.advance(500)
    expect(w.toasts.filter(t => t.includes('Charmeleon is ready'))).toEqual([
      'Charmeleon is ready to evolve! /pokemon evolve charmeleon',
    ])
  },
)

test('a look named that comes only at night waits by day, and no other look takes its place', async ($, on) => {
  const chain = REAL_CHAINS[CHAIN_OF.milcery!]
  const w = await begin(
    $,
    on,
    { ...emptySave(), party: [member('milcery', { heldItem: 'strawberry-sweet', gender: 'female' })] },
    undefined,
    undefined,
    { isOnline: true, list: JSON.stringify(REAL_LIST), now: hourAt(12), chains: { milcery: chain, alcremie: chain } },
  )
  await until($, () => w.toasts.some(t => t.includes('Milcery is ready')))
  expect(await cmd($, 'pokemon', 'evolve milcery into alcremie matcha cream strawberry')).toMatch(
    /^Milcery evolves into Alcremie \(Matcha Cream Strawberry\) .*night/,
  )
  expect(w.saveNow().party[0]).toMatchObject({ species: 'milcery', heldItem: 'strawberry-sweet' })
})
