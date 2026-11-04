# Canal Rush — Kayak Racing at Dawn

A real-time 3D dawn-on-the-canals Venice experience in the browser, with two
single-player games on top: a passenger ferry route, and a point-to-point
regatta against three local AI boatmen. Fully static — no server, no network
requests beyond the three.js CDN import map.

Every crew member is a real low-poly human character (see `src/scene/person.js`
and `src/scene/pilot.js`): the player's gondolier, the three rival boatmen
(MIRA, BEPPE, NICO — their shirt stripes, neckerchiefs and hat bands carry
their team colours), and a rotating cast of passengers who board at the docks.

## Kayak edition

- **Name & look** — renamed to *Canal Rush* (change it in `src/ui/brand.js`
  and the loader in `index.html`). Bold condensed-italic UI: loading screen
  with tips, card-style login and main menu with a career panel.
- **HUD** — race timer, position + live leaderboard with gaps, a course strip
  (rapids, bridges, finish flag, racer dots) and a heading-up **minimap**
  (`src/ui/minimap.js`) showing walls, rocks, docks, ? boxes and rivals.
- **? boxes** — power-ups float as spinning question-mark boxes; grabbing one
  spins a roulette in the item slot before revealing the prize.

- **Login** — the game opens on a paddler register: type a name, pick a vest
  colour, or tap a returning paddler. Profiles (coins, upgrades, paint) are
  saved in this browser's `localStorage` only (`src/game/profile.js`).
- **Kayaks** — every boat is now a tandem sea kayak (`src/scene/kayak.js`):
  the paddler sits in the aft cockpit and twists through alternating strokes
  with a double-bladed paddle; fares ride seated in the front cockpit.
- **Rapids** — five whitewater stretches (`src/game/rapids.js`) sweep you
  downstream, shove you sideways and hide rocks. Hitting a rock hard costs a
  fare (Morning Route) or a scrape (Regatta). The AI picks the open channel.
- **Shop** — coins from fares and race places buy upgrades (Carbon Paddle,
  Stable Hull, Skeg & Rudder, Polished Keel — 3 levels each) and hull paints.

## Run

Serve this directory with any static file server and open `index.html`
(ES modules need `http://`; `file://` won't work):

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## The two modes

**Morning Route — ferry passengers.** Pole a gondola along a route that keeps
getting harder: the canal narrows from 12.5 m to 8.7 m, five bridges ride
progressively lower, docks shrink to a single boat-length, wakes from passing
NPC boats rebound off the walls, mist thickens under the bridges, and the tide
turns halfway (s=300). Ferry five passengers between six docks: dock gently
(<1 m/s), parallel and head-on, holding the kiss for 0.7 s before they step
aboard or ashore. Scraping a wall, striking a bridge pier, or ramming another
boat above 0.95 m/s sends your passenger ashore — lose three and the morning
ends; deliver all five for a "Perfect morning".

**Regatta — the race.** A point-to-point sprint against three local AI
gondolas (MIRA, BEPPE, NICO — see `src/game/ai.js`): everyone poles from the
first dock to ZATTERE ALBA (s=585); first hull across wins. Fares and docking
are off, crashes just bounce. Lantern crates drift at nine spots along the
canal (8 s respawn, weighted random draw); press **E** to use what you hold:

- **WAVE** — a surge that shoves and spins every boat within 40 m ahead of you.
- **WHIRL** — drops a 35 s whirlpool trap behind you (spin + oar lockout).
- **ANCHOR** — hooks the current leader: 90% slow + 2.2 s input lockout.
- **SPLASH** — a burst ring of water around you.
- **SHIELD** — an 8 s bubble that blocks one hit.
- **SWAP** — trade places (and headings) with the boat ahead of you.

## Controls

| Input | Action |
|---|---|
| **W** | Pole forward — thrust |
| **S** | Back-pole — reverse & brake |
| **A / D** | Swing the oar — steer |
| **Mouse** | Sweep — analog thrust & steering |
| **Space** | Shove off a wall |
| **E** | Use held item (regatta) |
| **Esc** | Pause |

On touch devices an on-screen oar pad appears (steer / pole / shove / item /
pause), and dragging a finger across the water rows the boat like a mouse
sweep.

## Key techniques

- three.js 0.169 (WebGL2) via CDN import map, no build step. HDR pipeline:
  `EffectComposer` with half-float buffers → UnrealBloom → custom film-grain
  + vignette `ShaderPass` → ACES tone mapping (`src/main.js`). Quality tiers
  scale pixel ratio, bloom, reflection resolution and mist density.
- Planar-reflection water shader with oblique near-plane clipping, analytic
  multi-octave ripple normals, and a spreading wake-ring buffer fed by boats,
  wall shoves and items (`src/scene/water.js`).
- Procedural dawn sky dome baked to a PMREM environment map; exponential fog,
  billboard mist, and instanced pigeons with a perch→startle→circle→land
  state loop flapping in the vertex shader (`src/scene/sky.js`, `mist.js`,
  `birds.js`).
- A fully procedural city: every texture is canvas-painted at startup; merged
  into a handful of draw calls (`src/scene/city.js`, `textures.js`).
- One Catmull-Rom centerline sampled every 1.5 m drives rendering, collision,
  AI and objective checks alike (`src/scene/canal.js`).
- 2D rigid-body boat physics: thrust/yaw-coupled oar, speed-scaled rudder,
  linear+quadratic drag, weathervaning, tide, hull probes vs wall polylines
  and bridge piers, capsule collisions vs other boats, wall shoves
  (`src/game/game.js`). The AI boatmen reuse the exact same constants
  (`src/game/ai.js`).
- Human characters are parametric low-poly figures with a tiny procedural rig
  (pole / idle / sit poses) — no external assets (`src/scene/person.js`).
- Debug hooks: `window.__ready`, `window.__errors`, `window.__app`
  (`startRun()`, `startRegatta()`, `quitToMenu()`, `seek(sec)`, `fps`,
  `regBoats()`, `applyQuality(q)`…) for scripted driving and verification.
