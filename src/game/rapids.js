// CANAL RUSH — rapids: stretches of whitewater with rocks breaking the surface.
// Inside a zone the current sweeps boats downstream and turbulence shoves and
// spins them sideways; rocks are solid obstacles (a hard hit costs a fare in
// the Morning Route, a scrape in the regatta). Hull upgrades damp the shove.
// Positions avoid docks and bridges so the canal stays fair.
import * as THREE from 'three';

export const RAPID_ZONES = [
  { s: 62, len: 15 },
  { s: 180, len: 16 },
  { s: 290, len: 15 },
  { s: 412, len: 14 },
  { s: 505, len: 16 },
];

const ROCK_PAD = 0.36; // hull half-width in metres, added to rock radius

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const foamVert = /* glsl */`
  #include <fog_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const foamFrag = /* glsl */`
  #include <fog_pars_fragment>
  uniform float uTime, uLen, uSeed;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    vec2 uv = vUv;
    float flow = uTime * 1.7;
    float y = uv.y * uLen;
    float n = noise(vec2(uv.x * 26.0 + uSeed, y * 1.5 + flow)) * 0.6
            + noise(vec2(uv.x * 60.0 - uSeed, y * 3.4 + flow * 1.7)) * 0.4;
    float streak = smoothstep(0.52, 0.82, n);
    // standing chevron waves pointing downstream
    float chev = sin((y + abs(uv.x - 0.5) * 6.0) * 1.6 + uTime * 0.6) * 0.5 + 0.5;
    chev = smoothstep(0.78, 1.0, chev) * (0.6 + 0.4 * noise(vec2(uv.x * 9.0, y + flow)));
    float edge = smoothstep(0.0, 0.16, uv.y) * smoothstep(1.0, 0.84, uv.y)
               * smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);
    float a = clamp(streak * 0.7 + chev * 0.5, 0.0, 1.0) * edge * 0.72;
    gl_FragColor = vec4(vec3(0.74, 0.84, 0.88), a);
    #include <fog_fragment>
  }
`;

let ringTex = null;
function foamRingTexture() {
  if (ringTex) return ringTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 18, 64, 64, 62);
  g.addColorStop(0, 'rgba(235,245,250,0)');
  g.addColorStop(0.35, 'rgba(235,245,250,.85)');
  g.addColorStop(0.6, 'rgba(235,245,250,.35)');
  g.addColorStop(1, 'rgba(235,245,250,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ringTex = new THREE.CanvasTexture(c);
  return ringTex;
}

export function makeRapids({ canal, scene, water }) {
  const group = new THREE.Group();
  group.name = 'rapids';
  scene.add(group);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4b5057, roughness: 0.32, metalness: 0.05, flatShading: true });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x3c4a3a, roughness: 0.6, flatShading: true });
  const foamMats = [];
  const collars = [];
  const zones = [];
  const rocks = [];

  RAPID_ZONES.forEach((zdef, zi) => {
    const r = rng(9001 + zi * 77);
    const sm = canal.atS(zdef.s);
    const zone = { ...zdef, ang: sm.ang, rocks: [] };
    zones.push(zone);

    // foam sheet, oriented along the canal at the zone centre
    const holder = new THREE.Group();
    holder.position.set(sm.x, 0.05, sm.z);
    holder.rotation.y = sm.ang;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uLen: { value: zdef.len }, uSeed: { value: zi * 13.7 } },
      vertexShader: foamVert, fragmentShader: foamFrag,
      transparent: true, depthWrite: false, fog: true,
    });
    foamMats.push(mat);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(sm.width * 0.88, zdef.len + 4), mat);
    sheet.rotation.x = -Math.PI / 2;
    sheet.renderOrder = 3;
    sheet.userData.noReflect = true;
    holder.add(sheet);
    group.add(holder);

    // rocks in two staggered rows, always leaving one clear lane per row
    const lanes = [-0.55, -0.18, 0.18, 0.55];
    for (let row = 0; row < 2; row++) {
      const gap = Math.floor(r() * lanes.length);
      const rowS = zdef.s + (row === 0 ? -zdef.len * 0.22 : zdef.len * 0.22);
      const rsm = canal.atS(rowS);
      lanes.forEach((lf, li) => {
        if (li === gap || (li === (gap + 2) % lanes.length && r() < 0.5)) return;
        const rad = 0.45 + r() * 0.35;
        const lat = lf * (rsm.width / 2 - 1.1) + (r() - 0.5) * 0.5;
        const ds = (r() - 0.5) * 2.5;
        const ssm = canal.atS(rowS + ds);
        const x = ssm.x + Math.cos(ssm.ang) * lat;
        const z = ssm.z - Math.sin(ssm.ang) * lat;
        const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), r() < 0.3 ? mossMat : rockMat);
        mesh.scale.set(rad, rad * (0.5 + r() * 0.3), rad * (0.8 + r() * 0.3));
        mesh.rotation.set(r() * 0.6, r() * 6.28, r() * 0.6);
        mesh.position.set(x, rad * 0.08, z);
        group.add(mesh);
        const collar = new THREE.Mesh(
          new THREE.PlaneGeometry(rad * 3.6, rad * 3.6),
          new THREE.MeshBasicMaterial({ map: foamRingTexture(), transparent: true, depthWrite: false, opacity: 0.8 }),
        );
        collar.rotation.x = -Math.PI / 2;
        collar.position.set(x, 0.07, z);
        collar.renderOrder = 4;
        collar.userData.noReflect = true;
        collar.userData.phase = r() * 6.28;
        group.add(collar);
        collars.push(collar);
        const rock = { x, z, r: rad, s: rowS + ds, lat, zone };
        zone.rocks.push(rock);
        rocks.push(rock);
      });
    }
  });

  // intensity 0..1 at a canal position, plus the zone's flow direction
  function flowAt(s) {
    for (const z of zones) {
      const d = Math.abs(s - z.s);
      const half = z.len / 2 + 2;
      if (d < half) {
        const k = Math.cos((d / half) * Math.PI * 0.5);
        return { k: k * k, zone: z };
      }
    }
    return { k: 0, zone: null };
  }

  // shove a body {x,z,vx,vz,omega} with current + turbulence; returns intensity
  function applyFlow(b, s, dt, t, resist = 0) {
    const { k, zone } = flowAt(s);
    if (k <= 0) return 0;
    const sm = canal.atS(s);
    const fx = Math.sin(sm.ang), fz = Math.cos(sm.ang);
    const lnx = Math.cos(sm.ang), lnz = -Math.sin(sm.ang);
    const along = b.vx * fx + b.vz * fz;
    if (along < 3.0) { b.vx += fx * 1.5 * k * dt; b.vz += fz * 1.5 * k * dt; }
    const shake = 1 - Math.min(0.8, resist);
    const n = Math.sin(t * 2.7 + s * 0.9 + zone.s) * 0.65 + Math.sin(t * 4.9 + s * 2.1 + 1.3) * 0.35;
    b.vx += lnx * n * 3.2 * k * shake * dt;
    b.vz += lnz * n * 3.2 * k * shake * dt;
    b.omega += Math.sin(t * 3.7 + s * 1.3) * 1.7 * k * shake * dt;
    return k;
  }

  // push a body's hull probe points out of rocks; returns the hardest impact
  function collide(b, pts) {
    let hit = 0;
    for (const [px, pz] of pts) {
      for (const rk of rocks) {
        const dx = px - rk.x, dz = pz - rk.z;
        const lim = rk.r + ROCK_PAD;
        if (Math.abs(dx) > lim || Math.abs(dz) > lim) continue;
        const d = Math.hypot(dx, dz) || 1e-4;
        if (d >= lim) continue;
        const nx = dx / d, nz = dz / d;
        b.x += nx * (lim - d);
        b.z += nz * (lim - d);
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) {
          b.vx -= 1.4 * vn * nx;
          b.vz -= 1.4 * vn * nz;
          b.omega += (Math.random() - 0.5) * -vn * 0.9;
          if (-vn > hit) hit = -vn;
          water?.addWake(rk.x + nx * rk.r, rk.z + nz * rk.r, 0.7);
        }
      }
    }
    return hit;
  }

  let splashT = 0;
  function update(dt, t) {
    for (const m of foamMats) m.uniforms.uTime.value = t;
    for (const c of collars) {
      const p = 1 + Math.sin(t * 3.1 + c.userData.phase) * 0.08;
      c.scale.set(p, p, 1);
      c.material.opacity = 0.65 + Math.sin(t * 2.3 + c.userData.phase) * 0.15;
    }
    // little ripple bursts off the rocks keep the water surface lively
    splashT -= dt;
    if (splashT <= 0 && rocks.length) {
      const rk = rocks[(Math.random() * rocks.length) | 0];
      water?.addWake(rk.x, rk.z, 0.4);
      splashT = 0.35;
    }
  }

  return { zones, rocks, flowAt, applyFlow, collide, update, group };
}
