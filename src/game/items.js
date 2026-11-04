// CANAL RUSH — water-prank items for the regatta.
// Floating ? boxes along the canal; grab one, watch it spin, E to use. Effects resolve locally:
// the player's pranks are dispatched to the AI boats (see game.js), and every
// hit lands with big water rings and camera shake — invisible pranks aren't
// pranks.
import * as THREE from 'three';

const ROW_S = [45, 100, 160, 220, 280, 340, 400, 460, 520];
const LANES = [-0.55, 0, 0.55];   // fraction of half-width
const RESPAWN = 8;
const PICKUP_R2 = 2.1 * 2.1;

export const ITEM_DEFS = {
  wave:   { label: 'WAVE',   w: 0.24, color: '#7fd4ff' },
  whirl:  { label: 'WHIRL',  w: 0.18, color: '#6fe0c8' },
  anchor: { label: 'ANCHOR', w: 0.14, color: '#c9ced6' },
  splash: { label: 'SPLASH', w: 0.16, color: '#9fd8ff' },
  shield: { label: 'SHIELD', w: 0.14, color: '#ffd9a8' },
  swap:   { label: 'SWAP',   w: 0.14, color: '#ffb168' },
};

const ICONS = {
  wave: '<path d="M4 20c4-6 8-6 12 0s8 6 12 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M4 12c4-6 8-6 12 0s8 6 12 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>',
  whirl: '<path d="M16 5a11 11 0 1 1-9 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M16 10a6 6 0 1 1-5 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>',
  anchor: '<path d="M16 6v18M16 6a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 15l-4 3c2 6 7 9 12 9s10-3 12-9l-4-3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  splash: '<path d="M16 4c4 6 7 10 7 14a7 7 0 1 1-14 0c0-4 3-8 7-14z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="7" cy="24" r="1.6" fill="currentColor"/><circle cx="25" cy="22" r="1.4" fill="currentColor"/>',
  shield: '<path d="M16 4l10 4v8c0 7-4 11-10 13-6-2-10-6-10-13V8z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
  swap: '<path d="M6 11h17l-5-5M26 21H9l5 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

function rollItem() {
  let total = 0;
  for (const k in ITEM_DEFS) total += ITEM_DEFS[k].w;
  let r = Math.random() * total;
  for (const k in ITEM_DEFS) { r -= ITEM_DEFS[k].w; if (r <= 0) return k; }
  return 'wave';
}

// api: { S, canal, scene, water, net, notice, myId(), leaderId(), aheadId(),
//        isOn(), setBubble(on), shake(amt), teleport(x,z,heading),
//        bots?() — regatta AI boats (whirlpools catch them too) }
export function makeRegattaItems(api) {
  const { scene, canal } = api;

  // ---------- HUD slot ----------
  const slot = document.createElement('div');
  slot.id = 'item-slot';
  slot.innerHTML = '<span id="item-icon"></span><span class="key">E</span><span class="lbl"></span>';
  document.body.appendChild(slot);
  const iconEl = slot.querySelector('#item-icon');

  const lblEl = slot.querySelector('.lbl');
  let held = null;
  let rolling = 0;       // seconds left on the "?" roulette after a pickup
  let rollTick = 0;
  const KINDS = Object.keys(ITEM_DEFS);
  function iconSVG(kind) {
    return `<svg viewBox="0 0 32 32" style="color:${ITEM_DEFS[kind].color}">${ICONS[kind]}</svg>`;
  }
  function setHeld(kind) {
    held = kind;
    slot.classList.remove('rolling', 'ready');
    if (!kind) { slot.style.display = 'none'; return; }
    slot.style.display = 'flex';
    iconEl.innerHTML = iconSVG(kind);
    lblEl.textContent = ITEM_DEFS[kind].label;
    slot.classList.add('ready');
  }
  // picked up a ? box: spin through the icons, then land on the prize
  function startRoll(kind) {
    held = kind;
    rolling = 0.9;
    rollTick = 0;
    slot.style.display = 'flex';
    slot.classList.remove('ready');
    slot.classList.add('rolling');
    iconEl.innerHTML = '<b class="q">?</b>';
    lblEl.textContent = '';
  }

  // ---------- expanding water-ring bursts (the "it landed HERE" language) ---
  const rings = []; // {mesh, t, life, r0, r1}
  function ringBurst(x, z, colorHex, big = false) {
    for (let i = 0; i < (big ? 3 : 2); i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.15, 40),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(colorHex).multiplyScalar(1.6),
          transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.1 + i * 0.02, z);
      scene.add(mesh);
      rings.push({ mesh, t: -i * 0.16, life: 0.9, r1: (big ? 9 : 5.5) + i * 2 });
    }
    api.water?.addWake?.(x, z, big ? 1.6 : 1.0);
    api.water?.addWake?.(x + 1.2, z - 0.8, 0.8);
    api.water?.addWake?.(x - 1.0, z + 1.1, 0.8);
  }

  // ---------- crates: floating dawn lanterns ----------
  const group = new THREE.Group();
  scene.add(group);
  const qTex = questionTexture();
  const boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const boxMat = new THREE.MeshBasicMaterial({ map: qTex, transparent: true, opacity: 0.94, depthWrite: true });
  const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#f6efe4').multiplyScalar(1.3), transparent: true, opacity: 0.9 });
  const edgeGeo = new THREE.EdgesGeometry(boxGeo);
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff7a59, transparent: true, depthWrite: false, opacity: 0.3, blending: THREE.AdditiveBlending });
  const boxes = [];
  for (const s of ROW_S) {
    const sm = canal.atS(s);
    const nx = Math.cos(sm.ang), nz = -Math.sin(sm.ang);
    for (const lane of LANES) {
      const lat = lane * (sm.width / 2 - 1.4);
      const x = sm.x + nx * lat, z = sm.z + nz * lat;
      const grp = new THREE.Group();
      grp.position.set(x, 0.75, z);
      const cube = new THREE.Mesh(boxGeo, boxMat);
      cube.rotation.set(0.35, 0, 0.35);
      cube.add(new THREE.LineSegments(edgeGeo, edgeMat));
      grp.add(cube);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(2.2);
      grp.add(glow);
      grp.userData.cube = cube;
      group.add(grp);
      boxes.push({ grp, x, z, active: true, respawn: 0, phase: Math.random() * 6.28 });
    }
  }

  // ---------- whirlpool traps (bigger, angrier) ----------
  const whirls = [];
  function spawnWhirl(x, z, ownerId) {
    const grp = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.8 + i * 1.1, 1.6 + i * 1.3, 32),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color('#6fe0c8').multiplyScalar(1.5),
          transparent: true, opacity: 0.55 - i * 0.18, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1 + i * 0.02;
      grp.add(ring);
    }
    grp.position.set(x, 0, z);
    scene.add(grp);
    whirls.push({ grp, x, z, ownerId, life: 35, arm: 1.2 });
    api.water?.addWake?.(x, z, 1.0);
  }
  function popWhirl(i, big) {
    ringBurst(whirls[i].x, whirls[i].z, '#6fe0c8', big);
    scene.remove(whirls[i].grp);
    whirls.splice(i, 1);
  }

  // ---------- use ----------
  function use() {
    if (!held || rolling > 0 || !api.isOn()) return;
    const kind = held;
    setHeld(null);
    const S = api.S;
    const r = (v) => +v.toFixed(2);
    if (kind === 'wave') {
      api.net.sendItem({ sub: 'wave' });
      ringBurst(S.x + Math.sin(S.heading) * 4, S.z + Math.cos(S.heading) * 4, '#7fd4ff');
      api.notice('Surge ahead!', 'good');
    } else if (kind === 'whirl') {
      const bx = S.x - Math.sin(S.heading) * 5, bz = S.z - Math.cos(S.heading) * 5;
      spawnWhirl(bx, bz, api.myId());
      api.net.sendItem({ sub: 'whirl', x: r(bx), z: r(bz) });
      api.notice('Whirlpool laid', 'dim');
    } else if (kind === 'anchor') {
      const target = api.leaderId();
      if (target == null) { api.notice('No target', 'dim'); setHeld(kind); return; }
      api.net.sendItem({ sub: 'anchor', targetId: target });
      api.notice('Anchored!', 'good');
    } else if (kind === 'splash') {
      api.net.sendItem({ sub: 'splash' });
      ringBurst(S.x, S.z, '#9fd8ff');
      api.notice('Splash!', 'good');
    } else if (kind === 'shield') {
      S.shieldT = 8;
      api.net.sendItem({ sub: 'shieldOn' });
      api.notice('Bubble shield!', 'good');
    } else if (kind === 'swap') {
      const target = api.aheadId() ?? api.leaderId();
      if (target == null) { api.notice('No target', 'dim'); setHeld(kind); return; }
      api.net.sendItem({ sub: 'swap', targetId: target, x: r(S.x), z: r(S.z), heading: r(S.heading) });
      api.notice('Swapped!', 'good');
    }
  }

  // ---------- incoming ----------
  function blocked() {
    const S = api.S;
    if (S.shieldT > 0) {
      S.shieldT = 0;
      api.net.sendItem({ sub: 'shieldPop' });
      ringBurst(S.x, S.z, '#ffd9a8');
      api.notice('Blocked!', 'good');
      return true;
    }
    return false;
  }

  // victim tells the world where the hit landed so the rings show there
  function announceFx(kind) {
    const S = api.S;
    api.net.sendItem({ sub: 'fx', kind, x: +S.x.toFixed(1), z: +S.z.toFixed(1) });
  }

  // crates + the HUD slot only exist while a regatta is live
  function setVisible(v) {
    group.visible = v;
    slot.style.display = v && held ? 'flex' : 'none';
  }

  // ---------- per-frame ----------
  function update(dt) {
    const S = api.S;
    const t = performance.now() / 1000;
    if (rolling > 0) {
      rolling -= dt;
      rollTick -= dt;
      if (rolling <= 0) setHeld(held);
      else if (rollTick <= 0) {
        rollTick = 0.08;
        iconEl.innerHTML = Math.random() < 0.3 ? '<b class="q">?</b>' : iconSVG(KINDS[(Math.random() * KINDS.length) | 0]);
      }
    }
    for (const b of boxes) {
      if (!b.active) {
        b.respawn -= dt;
        if (b.respawn <= 0) { b.active = true; b.grp.visible = true; b.grp.scale.setScalar(0.01); }
        continue;
      }
      const pop = Math.min(1, b.grp.scale.x + dt * 3);
      if (pop < 1) b.grp.scale.setScalar(pop);
      b.grp.userData.cube.rotation.y += dt * 1.6;
      b.grp.position.y = 0.75 + Math.sin(t * 1.7 + b.phase) * 0.14;
      if (api.isOn() && !held) {
        const dx = S.x - b.x, dz = S.z - b.z;
        if (dx * dx + dz * dz < PICKUP_R2) {
          startRoll(rollItem());
          b.active = false; b.respawn = RESPAWN; b.grp.visible = false;
          api.water?.addWake?.(b.x, b.z, 0.5);
          ringBurst(b.x, b.z, '#3fd0c9');
        }
      }
    }
    // expanding rings
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.t += dt;
      if (rg.t < 0) continue;
      const k = rg.t / rg.life;
      if (k >= 1) { scene.remove(rg.mesh); rings.splice(i, 1); continue; }
      const sc = 1 + k * rg.r1;
      rg.mesh.scale.setScalar(sc);
      rg.mesh.material.opacity = 0.85 * (1 - k) * (1 - k);
    }
    // whirlpools
    for (let i = whirls.length - 1; i >= 0; i--) {
      const w = whirls[i];
      w.life -= dt;
      if (w.arm > 0) w.arm -= dt;
      w.grp.rotation.y += dt * 3.0;
      w.grp.position.y = Math.sin(t * 4 + i) * 0.03;
      if (w.life <= 0) { popWhirl(i, false); continue; }
      if (w.arm <= 0 && w.ownerId !== api.myId() && api.isOn()) {
        const dx = S.x - w.x, dz = S.z - w.z;
        if (dx * dx + dz * dz < 2.6 * 2.6) {
          if (!blocked()) {
            S.omega += 3.4;
            S.blockT = Math.max(S.blockT || 0, 1.7);
            api.shake(1.0);
            announceFx('whirl');
            api.notice('Caught in a whirlpool!', 'bad');
          }
          api.net.sendItem({ sub: 'whirlPop', x: +w.x.toFixed(2), z: +w.z.toFixed(2) });
          popWhirl(i, true);
        }
      }
      // bots blunder into armed traps the same way the player would
      if (w.arm <= 0 && whirls[i] === w && api.bots) {
        for (const b of api.bots()) {
          if (b.id === w.ownerId) continue;
          const dx = b.x - w.x, dz = b.z - w.z;
          if (dx * dx + dz * dz < 2.6 * 2.6) { b.hitWhirl(); popWhirl(i, true); break; }
        }
      }
    }
    if (S.shieldT > 0) S.shieldT -= dt;
    api.setBubble?.(S.shieldT > 0);
  }

  return { use, update, setVisible, boxes, get held() { return held; } };
}

// a bold orange "?" on a dark glassy face
function questionTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, 'rgba(255,160,120,.96)');
  g.addColorStop(1, 'rgba(255,100,80,.96)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(246,239,228,.95)';
  x.lineWidth = 8;
  x.strokeRect(4, 4, 120, 120);
  x.font = '800 82px "Unbounded", "Arial Black", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,.25)';
  x.fillText('?', 68, 72);
  x.fillStyle = '#f6efe4';
  x.fillText('?', 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
