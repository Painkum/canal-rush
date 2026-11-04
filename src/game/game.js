// CANAL RUSH — game: tandem-kayak paddle physics, tide, wakes, rapids,
// collisions, fares. Upgrades bought in the shop scale the physics (profile.js).
import * as THREE from 'three';
import { BOAT_SCALE } from '../scene/gondola.js';
import { makeKayak, COCKPIT_AFT, COCKPIT_FWD, SEAT_Y } from '../scene/kayak.js';
import { makePerson } from '../scene/person.js';
import { makeKayakPaddler } from '../scene/pilot.js';
import { makeRegattaItems } from './items.js';
import { DOCKS, BRIDGES, ROUTE_END } from '../scene/canal.js';
import { makeAIFleet } from './ai.js';

export const LEG_NAMES = ['CA\' D\'ORO PIER', 'CAMPO S. MARIA', 'PONTE STORTO', 'RIO TERRÀ', 'SQUERO VECCHIO', 'ZATTERE ALBA'];
const ME = { name: 'YOU', color: 0x2e7bf6 }; // the local entry, first slot on the grid
const MAX_FARES_LOST = 3;
const KISS_SPEED = 1.0;        // m/s max for a clean docking
const KISS_LATERAL = 0.7;
const KISS_ANGLE = Math.PI * 0.28;
const KISS_HOLD = 0.7;         // seconds of gentle contact to dock
const CRASH_SPEED = 0.95;      // m/s normal impact that costs a fare

export function makeGame(app) {
  const { world, camera, scene } = app;
  const profiles = app.profiles;
  let stats = profiles?.stats() ?? { thrust: 1, turn: 1, resist: 0, toughness: 1, drag: 1 };
  const canal = world.canal;

  // ---------- player boat ----------
  const boat = makeKayak({ physical: true });
  boat.visible = false;
  scene.add(boat);

  // ---------- crew: the paddler seated aft + a passenger in the front cockpit ----------
  // counter-scaled so they keep real-world size on the scaled-down boat
  const gondolier = makeKayakPaddler('player', { vest: ME.color });
  gondolier.root.position.set(0, SEAT_Y, COCKPIT_AFT); // seated in the aft cockpit, facing the bow
  gondolier.root.scale.setScalar(1 / BOAT_SCALE);
  boat.add(gondolier.root);
  // my bubble-shield visual
  const myBubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.16, depthWrite: false }),
  );
  myBubble.visible = false;
  myBubble.scale.setScalar(1 / BOAT_SCALE);
  boat.add(myBubble);

  // a small cast of human fares — a different one boards at every dock
  const passengers = ['tourist', 'local1', 'local2'].map((k) => {
    const p = makePerson(k, { vest: 0xf2c94c });
    p.root.position.set(0, SEAT_Y, COCKPIT_FWD);
    p.root.scale.setScalar(1 / BOAT_SCALE);
    p.root.visible = false;
    boat.add(p.root);
    return p;
  });
  let passengerIdx = 0;
  let passenger = passengers[0];
  const charsReady = Promise.resolve();

  // ---------- physics state ----------
  const S = {
    x: 0, z: 0, vx: 0, vz: 0, heading: 0, omega: 0,
    blockT: 0, shieldT: 0,   // item effects: input lockout / bubble shield
    mouseX: 0, mouseY: 0, sweepVel: 0, sweepRate: 0, stroking: false,
    w: false, a: false, s: false, d: false,
    polePhase: 0,
    speed: 0,
    rapidK: 0, inRapids: false,
  };

  // ---------- run state ----------
  const R = {
    state: 'idle',        // idle | countdown | playing | gameover | complete
    leg: 0,               // current leg index 0..4 (dock i -> i+1)
    carrying: false,
    faresLost: 0,
    faresDelivered: 0,
    bumps: 0,
    startTime: 0,
    elapsed: 0,
    countdown: 0,
    kissTimer: 0,
    crashCooldown: 0,
    tideDir: 1,
    notice: null,         // {text, t, kind}
  };

  const camPos = new THREE.Vector3(0, 2, -8);
  const camLook = new THREE.Vector3();
  let camShake = 0;
  const listeners = {};
  function on(ev, fn) { (listeners[ev] ||= []).push(fn); }
  function emit(ev, data) { (listeners[ev] || []).forEach((f) => f(data)); }

  function boardPassenger() {
    R.carrying = true;
    for (const p of passengers) p.root.visible = false;
    passenger = passengers[passengerIdx % passengers.length];
    passengerIdx++;
    passenger.root.visible = true;
  }

  function reset() {
    const sm = canal.atS(DOCKS[0].s + 6);
    S.x = sm.x; S.z = sm.z; S.vx = S.vz = 0;
    S.heading = sm.ang; S.omega = 0;
    S.sweepRate = 0; S.stroking = false; S.polePhase = 0;
    S.rapidK = 0; S.inRapids = false;
    R.leg = 0; R.carrying = true; R.faresLost = 0; R.faresDelivered = 0;
    R.bumps = 0; R.elapsed = 0; R.kissTimer = 0; R.crashCooldown = 0;
    R.tideDir = 1; R.notice = null;
    passengerIdx = 0;
    boardPassenger();
  }

  // apply the signed-in paddler: name on the start list, paint, vest, upgrades
  function setProfile(p) {
    if (p) {
      ME.name = p.name.toUpperCase();
      ME.color = p.vest;
    } else {
      ME.name = 'YOU';
      ME.color = 0x2e7bf6;
    }
    refreshLoadout();
  }
  function refreshLoadout() {
    stats = profiles?.stats() ?? stats;
    const paint = profiles?.paint();
    if (paint) boat.userData.setPaint(paint.hull, paint.deck);
    gondolier.setColors({ vest: ME.color, blade: paint?.blade });
  }

  function startRun() {
    refreshLoadout();
    mode = 'fares';
    setRegattaChrome(false);
    reset();
    boat.visible = true;
    R.state = 'countdown';
    R.countdown = 3.2;
    emit('countdown', 3);
    emit('state', R.state);
  }

  function endRun(kind) {
    R.state = kind; // 'gameover' | 'complete'
    emit('results', {
      kind,
      time: R.elapsed,
      fares: R.faresDelivered,
      lost: R.faresLost,
      bumps: R.bumps,
      legs: 5,
    });
    emit('state', R.state);
  }

  function notice(text, kind = 'info') {
    R.notice = { text, kind, t: 0 };
    emit('notice', R.notice);
  }

  // ---------- regatta: point-to-point race against three local AI gondolas ----------
  // Everyone poles from the first pier to ZATTERE ALBA; first hull across
  // wins. Fares/docking are off, crashes just bounce. The bots drive the same
  // boat physics as the player (src/game/ai.js) — no network anywhere.
  const FINISH_S = DOCKS[DOCKS.length - 1].s;
  const NPCS = [
    { name: 'MIRA', color: 0xf2c94c },
    { name: 'BEPPE', color: 0xeb5757 },
    { name: 'NICO', color: 0x27ae60 },
  ];
  const RG = { prof: null, fleet: null, bots: [], items: null, myTime: null, teleport: null };
  let mode = 'fares'; // 'fares' | 'regatta'

  function useItem() { if (mode === 'regatta') RG.items?.use(); }

  function regOrder() {
    const meProg = canal.nearestS(S.x, S.z).s;
    const me = { id: 'me', name: RG.prof.name, finished: R.state === 'finished', finishTime: RG.myTime ?? Infinity, prog: meProg, isPlayer: true };
    const rest = RG.bots.map((b) => ({
      id: b.id, name: b.name, finished: b.finished, finishTime: b.finishTime, prog: b.s, isPlayer: false,
    }));
    return [me, ...rest].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.prog - a.prog;
    });
  }

  // the victim side of the player's pranks, applied to the bots locally
  function regDispatch(msg) {
    switch (msg.sub) {
      case 'wave': {
        const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
        for (const b of RG.bots) {
          const dx = b.x - S.x, dz = b.z - S.z;
          const d = Math.hypot(dx, dz);
          if (d < 40 && (dx * fx + dz * fz) / (d || 1) > 0.5) b.hitWave(fx, fz);
        }
        break;
      }
      case 'anchor': RG.bots.find((b) => b.id === msg.targetId)?.hitAnchor(); break;
      case 'swap': {
        const b = RG.bots.find((x) => x.id === msg.targetId);
        if (b) {
          const bx = b.x, bz = b.z, bh = b.heading;
          b.teleport(msg.x, msg.z, msg.heading);
          RG.teleport(bx, bz, bh);
        }
        break;
      }
      // splash/shield/fx are screen-side effects — nothing local to apply
    }
  }

  function regInit() {
    RG.prof = ME;
    RG.fleet = makeAIFleet({ canal, scene, world, npcs: NPCS, finishS: FINISH_S, player: S });
    RG.bots = RG.fleet.bots;
    RG.teleport = (x, z, heading) => {
      S.x = x; S.z = z; S.heading = heading;
      const sp = Math.hypot(S.vx, S.vz) * 0.4;
      S.vx = Math.sin(heading) * sp; S.vz = Math.cos(heading) * sp;
      S.omega = 0;
    };
    // a loopback link: items use it to reach their victims, here the local bots
    const loopback = { id: 'me', sendItem: (payload) => regDispatch(payload) };
    RG.items = makeRegattaItems({
      S, canal, scene, water: world.water, net: loopback,
      notice,
      myId: () => 'me',
      isOn: () => mode === 'regatta' && R.state === 'playing',
      leaderId: () => {
        const order = regOrder();
        const meFirst = order[0]?.isPlayer;
        if (meFirst && order.length > 1) return order[1].id ?? null;
        return order.find((o) => !o.isPlayer)?.id ?? null;
      },
      aheadId: () => {
        const order = regOrder();
        const meIdx = order.findIndex((o) => o.isPlayer);
        if (meIdx > 0) return order[meIdx - 1].id ?? null;
        return null;
      },
      setBubble: (on) => { myBubble.visible = on; },
      shake: (amt) => { camShake = Math.max(camShake, amt); },
      teleport: RG.teleport,
      bots: () => RG.bots, // whirlpool traps catch bots too (see items.js)
    });
  }

  // bot boats, lantern crates, and the item slot only exist in the regatta
  function setRegattaChrome(on) {
    RG.fleet?.setVisible(on);
    RG.items?.setVisible(on);
    world.remoteBoats = on ? RG.bots.map((b) => b.boat) : []; // the player bumps into bots
  }

  function startRegatta() {
    refreshLoadout();
    mode = 'regatta';
    if (!RG.fleet) regInit();
    setRegattaChrome(true);
    RG.myTime = null;
    // grid slot 0 (front-left), bots staggered behind
    const sm = canal.atS(DOCKS[0].s + 6);
    S.x = sm.x + Math.cos(sm.ang) * -1.6;
    S.z = sm.z - Math.sin(sm.ang) * -1.6;
    S.vx = S.vz = 0; S.heading = sm.ang; S.omega = 0;
    S.blockT = 0; S.shieldT = 0; S.rapidK = 0; S.inRapids = false;
    R.leg = 0; R.carrying = false; R.faresLost = 0; R.faresDelivered = 0;
    R.bumps = 0; R.elapsed = 0; R.kissTimer = 0; R.crashCooldown = 0;
    for (const p of passengers) p.root.visible = false;
    boat.visible = true;
    RG.fleet.spawn();
    R.state = 'countdown';
    R.countdown = 3.2;
    R._lastCount = 99;
    emit('countdown', 3);
    emit('state', R.state);
  }

  function regFinishCheck() {
    if (mode !== 'regatta' || R.state !== 'playing') return;
    const s = canal.nearestS(S.x, S.z).s;
    if (s >= FINISH_S) {
      RG.myTime = R.elapsed;
      R.state = 'finished';
      emit('state', R.state);
      notice('Finished!', 'good');
      setTimeout(() => {
        const order = regOrder();
        emit('results', {
          kind: 'regatta',
          time: RG.myTime,
          place: order.findIndex((o) => o.isPlayer) + 1,
          order: order.map((o) => ({
            name: o.name, isPlayer: o.isPlayer, finished: o.finished,
            finishTime: o.finishTime === Infinity ? null : o.finishTime,
          })),
        });
      }, 900);
    }
  }

  function quitToMenu() {
    boat.visible = false;
    R.state = 'idle';
    setRegattaChrome(false);
  }

  function regBoats() {
    return RG.bots.map((b) => ({
      name: b.name,
      color: '#' + b.color.toString(16).padStart(6, '0'),
      x: +b.x.toFixed(2), z: +b.z.toFixed(2), s: +b.s.toFixed(1),
      finished: b.finished,
      finishTime: b.finishTime === Infinity ? null : +b.finishTime.toFixed(2),
    }));
  }

  // ---------- input (fed by UI/main) ----------
  // absolute mouse x for the oar angle; motion is fed per-event for frame-independent thrust
  function setMouse(nx, ny) { S.mouseX = nx; S.mouseY = ny; }
  function strokeMotion(v) { // signed normalized sweep velocity (per second)
    S.sweepVel = THREE.MathUtils.lerp(S.sweepVel, v, 0.6);
  }
  function setKey(k, down) {
    if (k === 'w') S.w = down;
    if (k === 's') S.s = down;
    if (k === 'a') S.a = down;
    if (k === 'd') S.d = down;
  }
  function shove() {
    if (R.state !== 'playing') return;
    const w = canal.wallsAt(S.x, S.z);
    const side = w.left.dist < w.right.dist ? w.left : w.right;
    if (side.dist > 3.0) { notice('No wall within reach', 'dim'); return; }
    S.vx += side.nx * 3.4;
    S.vz += side.nz * 3.4;
    S.omega += (side === w.left ? -1 : 1) * 0.9;
    world.water.addWake(S.x, S.z, 1.0);
    notice('Shoved off!', 'dim');
  }

  // ---------- wake events from NPC boats ----------
  let seenWakes = 0;
  const wakeBus = world.wakeBus || (world.wakeBus = []);
  function processWakes() {
    for (; seenWakes < wakeBus.length; seenWakes++) {
      const wk = wakeBus[seenWakes];
      wk.hitPlayer = false;
    }
    for (const wk of wakeBus) {
      if (wk.hitPlayer) continue;
      const age = (performance.now() / 1000) - wk.t;
      const front = age * 2.6;
      const d = Math.hypot(S.x - wk.x, S.z - wk.z);
      if (Math.abs(d - front) < 1.2 && front > 2 && front < 26) {
        wk.hitPlayer = true;
        const nx = (S.x - wk.x) / (d || 1), nz = (S.z - wk.z) / (d || 1);
        const mag = wk.strength * 1.1 * (1 - stats.resist * 0.8);
        S.vx += nx * mag; S.vz += nz * mag;
        S.omega += (nx * Math.cos(S.heading) - nz * Math.sin(S.heading)) * 0.4;
        notice('Rode the wake!', 'dim');
      }
    }
  }

  // ---------- collision with walls + bridge piers + other boats ----------
  const HULL_F = 3.8 * BOAT_SCALE + 0.4;  // bow/stern probe distance
  const HULL_S = 0.7 * BOAT_SCALE;        // side probe distance
  function collide(dt) {
    if (R.crashCooldown > 0) R.crashCooldown -= dt;
    const pts = [
      [S.x, S.z],
      [S.x + Math.sin(S.heading) * HULL_F, S.z + Math.cos(S.heading) * HULL_F],   // bow
      [S.x - Math.sin(S.heading) * HULL_F, S.z - Math.cos(S.heading) * HULL_F],   // stern
      [S.x + Math.cos(S.heading) * HULL_S, S.z - Math.sin(S.heading) * HULL_S],
      [S.x - Math.cos(S.heading) * HULL_S, S.z + Math.sin(S.heading) * HULL_S],
    ];
    let crashed = false, hitSpeed = 0, crashCause = 'wall';
    for (const [px, pz] of pts) {
      const w = canal.wallsAt(px, pz);
      for (const side of [w.left, w.right]) {
        let limit = 0.55;
        // bridge pier intrusion
        for (const br of BRIDGES) {
          const sm = canal.nearestS(px, pz);
          if (Math.abs(sm.s - br.s) < br.thick / 2 + 1.2) limit += br.pier;
        }
        if (side.dist < limit) {
          const pen = limit - side.dist;
          // push the whole boat out
          S.x += side.nx * pen;
          S.z += side.nz * pen;
          const vn = S.vx * side.nx + S.vz * side.nz;
          if (vn < 0) {
            const impact = -vn;
            S.vx -= (1.35) * vn * side.nx;
            S.vz -= (1.35) * vn * side.nz;
            S.omega += (Math.random() - 0.5) * impact * 0.6;
            if (impact > hitSpeed) hitSpeed = impact;
            if (impact > CRASH_SPEED * stats.toughness && R.crashCooldown <= 0 && R.state === 'playing') {
              crashed = true;
            } else if (impact > 0.3) {
              R.bumps++;
            }
          }
        }
      }
    }
    // --- rapids rocks
    if (world.rapids) {
      const impact = world.rapids.collide(S, pts.slice(0, 3));
      if (impact > 0) {
        camShake = Math.max(camShake, Math.min(1, impact * 0.5));
        if (impact > hitSpeed) hitSpeed = impact;
        if (impact > CRASH_SPEED * 0.9 * stats.toughness && R.crashCooldown <= 0 && R.state === 'playing') {
          crashed = true;
          crashCause = 'rock';
        } else if (impact > 0.3) R.bumps++;
      }
    }
    // --- other boats (NPC + moored): capsule along their centerline
    const others = [world.npcBoat, ...(world.moored || []), ...(world.remoteBoats || [])];
    for (const ob of others) {
      if (!ob) continue;
      const bx = ob.position.x, bz = ob.position.z;
      const h = ob.rotation.y;
      const fx = Math.sin(h), fz = Math.cos(h);
      const dx = S.x - bx, dz = S.z - bz;
      const along = THREE.MathUtils.clamp(dx * fx + dz * fz, -4.0 * BOAT_SCALE, 4.0 * BOAT_SCALE);
      const px = bx + fx * along, pz = bz + fz * along;
      let nx = S.x - px, nz = S.z - pz;
      const d = Math.hypot(nx, nz) || 1e-4;
      const limit = 0.85 + HULL_S;
      if (d < limit) {
        nx /= d; nz /= d;
        S.x += nx * (limit - d);
        S.z += nz * (limit - d);
        const vn = S.vx * nx + S.vz * nz;
        if (vn < 0) {
          const impact = -vn;
          S.vx -= 1.3 * vn * nx;
          S.vz -= 1.3 * vn * nz;
          S.omega += (Math.random() - 0.5) * impact * 0.5;
          world.water.addWake(px, pz, 0.8);
          if (impact > hitSpeed) hitSpeed = impact;
          if (impact > CRASH_SPEED * stats.toughness && R.crashCooldown <= 0 && R.state === 'playing') {
            crashed = true;
            crashCause = 'boat';
          } else if (impact > 0.3) {
            R.bumps++;
          }
        }
      }
    }
    if (crashed) {
      R.crashCooldown = 2.5;
      R.bumps++;
      world.water.addWake(S.x, S.z, 1.2);
      if (mode === 'regatta') {
        notice(crashCause === 'rock' ? 'Hit a rock!' : 'Scrape!', 'bad');
      } else if (R.carrying) {
        R.carrying = false;
        R.faresLost++;
        passenger.root.visible = false;
        notice(crashCause === 'boat' ? 'Passenger left — watch the traffic'
          : crashCause === 'rock' ? 'Passenger left — mind the rocks'
          : 'Passenger left — watch the walls', 'bad');
        emit('farelost', R.faresLost);
        if (R.faresLost >= MAX_FARES_LOST) { endRun('gameover'); return; }
      } else {
        notice('Scrape!', 'bad');
      }
      emit('crash', hitSpeed);
    }
  }

  // ---------- tide ----------
  function tideAccel(dt) {
    const sm = canal.nearestS(S.x, S.z);
    const targetDir = sm.s < 300 ? 1 : -1;
    if (targetDir !== R.tideDir) {
      R.tideDir = targetDir;
      notice('The tide turns', 'dim');
      emit('tide', targetDir);
    }
    const tx = Math.sin(sm.sample.ang) * targetDir, tz = Math.cos(sm.sample.ang) * targetDir;
    const mag = 0.42;
    const cvx = tx * mag, cvz = tz * mag;
    S.vx += (cvx - S.vx) * 0.28 * dt;
    S.vz += (cvz - S.vz) * 0.28 * dt;
    return sm.s;
  }

  // ---------- oar physics ----------
  function stroke(dt) {
    if (S.blockT > 0) return; // item effect: oar's out of your hands
    let thrust = 0, yaw = 0;
    // --- keyboard: W forward, S back-pole, A/D steer
    // (camera looks +Z, so world +X is screen-left: A -> heading+, D -> heading-)
    if (S.w) thrust += 8.0 * stats.thrust;
    if (S.s) thrust -= 3.5;
    const rudder = (0.35 + 0.65 * Math.min(1, S.speed / 1.5)) * stats.turn;
    if (S.a) yaw += 2.4 * rudder;
    if (S.d) yaw -= 2.4 * rudder;
    // --- mouse sweep (analog alternative)
    const rate = S.sweepVel;
    S.sweepVel *= Math.exp(-2.6 * dt);
    S.sweepRate = THREE.MathUtils.lerp(S.sweepRate, Math.abs(rate), 0.25);
    const power = THREE.MathUtils.clamp(Math.abs(rate) * 1.15 - 0.25, 0, 4.2);
    if (power > 0.02) {
      const dir = rate < 0 ? 1 : -1; // sweep left = power stroke, right = recovery
      thrust += power * (dir > 0 ? 5.5 : 1.7) * stats.thrust;
      yaw += power * (dir > 0 ? 0.95 : -0.55); // oar on starboard: power stroke yaws bow left
    }
    if (thrust !== 0 || yaw !== 0) {
      const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
      S.vx += fx * thrust * dt;
      S.vz += fz * thrust * dt;
      S.omega += yaw * dt;
      S.omega = THREE.MathUtils.clamp(S.omega, -1.3, 1.3);
      if (thrust > 1 && Math.random() < thrust * dt * 0.18) {
        world.water.addWake(
          S.x - Math.cos(S.heading) * 1.2 - fx * 2,
          S.z + Math.sin(S.heading) * 1.2 - fz * 2,
          0.35,
        );
      }
    }
    if (S.s) { // back-pole drags the blade: extra braking
      const drag = Math.min(1, 3.5 * dt);
      S.vx *= 1 - drag; S.vz *= 1 - drag;
      S.omega *= 1 - Math.min(1, 2.5 * dt);
    }
    // animation gating with hysteresis
    if (!S.stroking && (S.sweepRate > 1.0 || S.w)) S.stroking = true;
    else if (S.stroking && S.sweepRate < 0.35 && !S.w) S.stroking = false;
  }

  // ---------- integration ----------
  function integrate(dt) {
    // drag: linear + quadratic
    const sp = Math.hypot(S.vx, S.vz);
    const dragF = (0.5 * sp + 0.22 * sp * sp) * stats.drag;
    if (sp > 1e-4) {
      S.vx -= (S.vx / sp) * dragF * dt;
      S.vz -= (S.vz / sp) * dragF * dt;
    }
    // weathervane: heading drifts toward velocity
    if (sp > 0.4) {
      const vang = Math.atan2(S.vx, S.vz);
      let d = vang - S.heading;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      S.omega += d * Math.min(1, sp * 0.5) * dt;
    }
    S.omega *= Math.exp(-2.4 * dt);
    S.heading += S.omega * dt;
    S.x += S.vx * dt;
    S.z += S.vz * dt;
    S.speed = Math.hypot(S.vx, S.vz);
  }

  // ---------- docking ----------
  function dockLogic(dt, s) {
    const target = DOCKS[R.leg + 1];
    if (!target) return;
    const sm = canal.atS(target.s);
    const nx = Math.cos(sm.ang) * target.side, nz = -Math.sin(sm.ang) * target.side;
    // dock center: at the wall, jutting out dock.depth/2
    const dcx = sm.x + nx * (sm.width / 2 - target.depth / 2);
    const dcz = sm.z + nz * (sm.width / 2 - target.depth / 2);
    const along = (S.x - dcx) * Math.sin(sm.ang) + (S.z - dcz) * Math.cos(sm.ang);
    const across = (S.x - dcx) * nx + (S.z - dcz) * nz;
    const inZone = Math.abs(along) < target.size + 1.2 && Math.abs(across) < target.depth * 0.75 + 0.9;
    // heading parallel to wall?
    let dAng = Math.abs(S.heading - sm.ang);
    while (dAng > Math.PI) dAng -= 2 * Math.PI;
    dAng = Math.abs(dAng);
    const parallel = dAng < KISS_ANGLE || dAng > Math.PI - KISS_ANGLE;
    const latVel = Math.abs(S.vx * nx + S.vz * nz);
    if (inZone && S.speed < KISS_SPEED && latVel < KISS_LATERAL && parallel) {
      R.kissTimer += dt;
      if (R.kissTimer >= KISS_HOLD) {
        // docked!
        R.faresDelivered += R.carrying ? 1 : 0;
        emit('docked', { leg: R.leg, delivered: R.carrying });
        R.leg++;
        if (R.leg >= DOCKS.length - 1) { endRun('complete'); return; }
        boardPassenger();
        R.kissTimer = 0;
        notice('Smooth docking — next fare aboard', 'good');
      }
    } else {
      R.kissTimer = Math.max(0, R.kissTimer - dt * 2);
    }
    return { target, sm, dcx, dcz, inZone, dist: Math.hypot(S.x - dcx, S.z - dcz) };
  }

  // ---------- camera ----------
  function updateCamera(dt) {
    const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
    const w = canal.wallsAt(S.x, S.z);
    const wallNear = Math.min(w.left.dist, w.right.dist);
    const lift = THREE.MathUtils.clamp(2.2 - wallNear, 0, 1.4);
    const dist = 7.2 - lift * 1.2;
    const targetPos = new THREE.Vector3(
      S.x - fx * dist,
      1.95 + lift + S.speed * 0.12,
      S.z - fz * dist,
    );
    // keep the camera inside the canal: shove it off nearby walls
    for (let iter = 0; iter < 2; iter++) {
      const cw = canal.wallsAt(targetPos.x, targetPos.z);
      for (const side of [cw.left, cw.right]) {
        if (side.dist < 1.0) {
          targetPos.x += side.nx * (1.0 - side.dist);
          targetPos.z += side.nz * (1.0 - side.dist);
          targetPos.y += (1.0 - side.dist) * 0.8;
        }
      }
    }
    // swap-teleports move the boat across the canal in one frame — snap, don't sweep
    if (camPos.distanceTo(targetPos) > 25) {
      camPos.copy(targetPos);
      camLook.set(S.x + fx * 5, 1.15, S.z + fz * 5);
    } else {
      camPos.lerp(targetPos, 1 - Math.exp(-3.2 * dt));
      camLook.lerp(new THREE.Vector3(S.x + fx * 5, 1.15, S.z + fz * 5), 1 - Math.exp(-4 * dt));
    }
    camera.position.copy(camPos);
    if (camShake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * camShake * 0.35;
      camera.position.y += (Math.random() - 0.5) * camShake * 0.22;
      camera.position.z += (Math.random() - 0.5) * camShake * 0.35;
      camShake *= Math.exp(-3.5 * dt);
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(camLook);
  }

  // ---------- visuals sync ----------
  function syncVisuals(dt) {
    boat.position.set(S.x, Math.sin(performance.now() * 0.001) * 0.02, S.z);
    boat.rotation.y = S.heading;
    boat.rotation.z = THREE.MathUtils.lerp(boat.rotation.z, -S.omega * 0.25 - (S.vx * Math.cos(S.heading) - S.vz * Math.sin(S.heading)) * 0.05, 0.1);
    boat.rotation.x = THREE.MathUtils.lerp(boat.rotation.x, S.speed * 0.012, 0.05);
    // rapids: the hull bucks and rolls in whitewater
    if (S.rapidK > 0.01) {
      const tt = performance.now() * 0.001;
      boat.position.y += Math.sin(tt * 9.1) * 0.05 * S.rapidK;
      boat.rotation.z += Math.sin(tt * 6.3) * 0.06 * S.rapidK * (1 - stats.resist * 0.6);
      boat.rotation.x += Math.sin(tt * 7.7 + 1) * 0.04 * S.rapidK;
    }
    // rudder blade follows A/D
    const rudder = boat.userData.rudder;
    if (rudder) rudder.rotation.y = THREE.MathUtils.lerp(rudder.rotation.y, (S.a ? -0.5 : 0) + (S.d ? 0.5 : 0), 0.15);
    // paddler pose: seated, twisting through alternating strokes
    const steer = (S.a ? 1 : 0) + (S.d ? -1 : 0);
    if (S.stroking) {
      let intensity;
      const prev = S.polePhase;
      if (S.w) {
        S.polePhase = (S.polePhase + dt * 0.95) % 1;
        intensity = 1;
      } else {
        S.polePhase = (S.polePhase + dt * THREE.MathUtils.clamp(S.sweepRate * 0.35, 0.3, 1.2)) % 1;
        intensity = Math.min(1, S.sweepRate / 3);
      }
      // a blade catches the water twice per cycle — splash on that side
      for (const catchAt of [0.25, 0.75]) {
        const wrapped = S.polePhase < prev;
        const crossed = wrapped ? (catchAt > prev || catchAt <= S.polePhase) : (prev < catchAt && S.polePhase >= catchAt);
        if (crossed) {
          const side = catchAt < 0.5 ? 1 : -1;
          const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
          world.water.addWake(
            S.x + Math.cos(S.heading) * side * 1.1 - fx * 0.6,
            S.z - Math.sin(S.heading) * side * 1.1 - fz * 0.6,
            0.3,
          );
        }
      }
      gondolier.update(dt, { mode: 'paddle', phase: S.polePhase, intensity, steer });
    } else {
      gondolier.update(dt, { mode: 'idle', steer: steer * 0.5 });
    }
    if (passenger.root.visible) passenger.update(dt, { mode: 'ride' });
    // mist thickens under bridges
    let underBridge = false;
    const sm = canal.nearestS(S.x, S.z);
    for (const br of BRIDGES) if (Math.abs(sm.s - br.s) < br.thick + 4) underBridge = true;
    world.mist.setDensity((app.quality?.mist ?? 1) * (underBridge ? 1.9 : 1.0));
  }

  // ---------- main update ----------
  function update(dt, t) {
    // regatta: local AI boats + item effects
    if (mode === 'regatta') {
      if (S.blockT > 0) S.blockT -= dt;
      RG.items?.update(dt);
      const racing = R.state === 'playing' || R.state === 'finished';
      RG.fleet?.update(dt, racing);
    }
    if (R.state === 'finished') {
      // drifting past the finish while the field comes home
      stroke(dt); integrate(dt); collide(dt);
      updateCamera(dt); syncVisuals(dt);
      return;
    }
    if (R.state === 'countdown') {
      R.countdown -= dt;
      const n = Math.ceil(R.countdown - 0.2);
      if (n !== R._lastCount && n >= 1) { R._lastCount = n; emit('countdown', n); }
      if (R.countdown <= 0) {
        R.state = 'playing';
        R.startTime = t;
        emit('go');
        emit('state', R.state);
        if (mode === 'regatta') notice('Row!', 'good');
      }
      updateCamera(dt);
      syncVisuals(dt);
      emitHud();
      return;
    }
    if (R.state !== 'playing') {
      updateCamera(dt);
      syncVisuals(dt);
      return;
    }
    R.elapsed = t - R.startTime;
    stroke(dt);
    const s = tideAccel(dt);
    S.rapidK = world.rapids ? world.rapids.applyFlow(S, s, dt, t, stats.resist) : 0;
    if (S.rapidK > 0.08 && !S.inRapids) {
      S.inRapids = true;
      notice('Whitewater!', 'warn');
      camShake = Math.max(camShake, 0.25);
    } else if (S.rapidK <= 0.01) S.inRapids = false;
    integrate(dt);
    collide(dt);
    processWakes();
    const inRegatta = mode === 'regatta';
    const dockInfo = inRegatta ? null : dockLogic(dt, s);
    if (inRegatta) regFinishCheck();
    updateCamera(dt);
    syncVisuals(dt);
    emitHud(dockInfo);
  }

  // one HUD snapshot (also sent during the countdown so the map + board show early)
  function emitHud(dockInfo = null) {
    const inRegatta = mode === 'regatta';
    const order = inRegatta ? regOrder() : null;
    emit('hud', {
      time: R.elapsed,
      speed: S.speed,
      leg: R.leg,
      legs: DOCKS.length - 1,
      carrying: R.carrying,
      faresLost: R.faresLost,
      maxLost: MAX_FARES_LOST,
      tideDir: R.tideDir,
      progress: canal.nearestS(S.x, S.z).s / (inRegatta ? FINISH_S : ROUTE_END),
      mpOrder: order ? order.findIndex((r) => r.isPlayer) + 1 : null,
      mpTotal: order ? RG.bots.length + 1 : null,
      kiss: R.kissTimer / KISS_HOLD,
      rapids: S.rapidK,
      // leaderboard + course strip + minimap data
      board: order ? order.map((o) => ({ name: o.name, me: o.isPlayer, prog: o.prog, fin: o.finished, time: o.finishTime })) : null,
      mode,
      targetS: inRegatta ? FINISH_S : (DOCKS[R.leg + 1]?.s ?? null),
      meS: canal.nearestS(S.x, S.z).s,
      dockDist: dockInfo?.dist ?? null,
      legName: LEG_NAMES[Math.min(R.leg + 1, LEG_NAMES.length - 1)],
    });
  }

  return {
    S, R, boat,
    on, emit,
    startRun, startRegatta, quitToMenu, endRun, reset,
    setProfile, refreshLoadout,
    setMouse, strokeMotion, setKey, shove,
    update,
    get ready() { return charsReady; },
    notice,
    useItem,
    regBoats,
    get _rg() { return RG; },
    get mode() { return mode; },
    roster: { me: ME, rivals: NPCS }, // the start list, straight from the race data
  };
}
