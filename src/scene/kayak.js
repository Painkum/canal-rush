// Parametric tandem sea kayak: lofted hull + deck, cockpit coamings with spray
// skirts, deck bungees, sheer stripe and a stern rudder.
// Same local-space contract as the gondola: +Z = bow, y=0 at waterline,
// origin amidships, and the whole group is scaled by BOAT_SCALE, so the
// gameplay collision constants (built for a ~10 m local hull) still fit.
import * as THREE from 'three';
import { BOAT_SCALE } from './gondola.js';

export const KAYAK_LEN = 10.2;
export const KAYAK_BEAM = 1.55;
// cockpit positions in boat-local units (paddler aft, passenger forward)
export const COCKPIT_AFT = -1.55;
export const COCKPIT_FWD = 1.45;
export const SEAT_Y = 0.02;

function section(t) {
  // t: 0 bow -> 1 stern
  const s = Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0.001, 0.999));
  const w = (KAYAK_BEAM / 2) * Math.pow(s, 0.62);
  const deck = 0.06 + 0.32 * Math.pow(s, 0.45);   // deck crown above section centre
  const keel = 0.03 + 0.28 * Math.pow(s, 0.55);   // hull depth below section centre
  const rocker = 0.1 + 0.32 * Math.pow(Math.abs(2 * t - 1), 3.2); // upswept ends
  return { w, deck, keel, rocker };
}

// loft a band of the cross-section from theta0..theta1 (0 = deck ridge, PI = keel)
function loft(theta0, theta1, N = 56, M = 12) {
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const { w, deck, keel, rocker } = section(t);
    const z = (0.5 - t) * KAYAK_LEN;
    for (let j = 0; j <= M; j++) {
      const th = theta0 + (theta1 - theta0) * (j / M);
      const c = Math.cos(th);
      const x = Math.sin(th) * w;
      const y = rocker + (c >= 0 ? c * deck : c * keel);
      pos.push(x, y, z);
      uvs.push(t * 3, j / M);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// deck height (local y) at a given local z, along the centreline
export function deckYAt(z) {
  const t = 0.5 - z / KAYAK_LEN;
  const { deck, rocker } = section(t);
  return rocker + deck;
}

function sheerLine(sign) {
  const pts = [];
  for (let i = 1; i < 40; i++) {
    const t = i / 40;
    const { w, rocker } = section(t);
    pts.push(new THREE.Vector3(sign * w * 1.002, rocker + 0.01, (0.5 - t) * KAYAK_LEN));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// color: the main paint (deck, what you see from the camera); under: the hull bottom
export function makeKayak({ color = 0x2e7bf6, under = 0xeaf1f8, physical = true } = {}) {
  const group = new THREE.Group();
  const Mat = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const gloss = physical ? { clearcoat: 0.25, clearcoatRoughness: 0.5 } : {};

  const hullMat = new Mat({ color: under, roughness: 0.35, envMapIntensity: 0.6, side: THREE.DoubleSide, ...gloss });
  const deckMat = new Mat({ color, roughness: 0.62, envMapIntensity: 0.25, side: THREE.DoubleSide, ...gloss });
  // a touch of self-glow keeps the paint readable when backlit by the low sun
  deckMat.emissive = new THREE.Color(color).multiplyScalar(0.35);
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.6 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.9 });
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.7 });

  // hull (below the sheer) + deck (above), as two bands of one loft
  group.add(new THREE.Mesh(loft(Math.PI / 2, Math.PI * 1.5), hullMat));
  group.add(new THREE.Mesh(loft(-Math.PI / 2, Math.PI / 2), deckMat));

  // sheer stripes (dark rub strip where deck meets hull)
  for (const sgn of [-1, 1]) {
    group.add(new THREE.Mesh(new THREE.TubeGeometry(sheerLine(sgn), 60, 0.028, 5, false), trimMat));
  }

  // cockpits: coaming ring + spray skirt
  for (const cz of [COCKPIT_AFT, COCKPIT_FWD]) {
    const y = deckYAt(cz);
    const coam = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 28), trimMat);
    coam.rotation.x = -Math.PI / 2;
    coam.scale.set(0.95, 1.65, 1);
    coam.position.set(0, y + 0.02, cz);
    group.add(coam);
    const skirt = new THREE.Mesh(new THREE.CircleGeometry(0.5, 28), skirtMat);
    skirt.rotation.x = -Math.PI / 2;
    skirt.scale.set(0.95, 1.65, 1);
    skirt.position.set(0, y + 0.035, cz);
    group.add(skirt);
  }

  // deck bungees: criss-cross cords fore and aft of the cockpits
  for (const [z0, z1] of [[2.6, 3.9], [-2.7, -4.0]]) {
    for (let k = 0; k < 3; k++) {
      const z = z0 + (z1 - z0) * (k / 2);
      const y = deckYAt(z);
      const { w } = section(0.5 - z / KAYAK_LEN);
      const cord = new THREE.Mesh(new THREE.BoxGeometry(w * 1.5, 0.025, 0.04), cordMat);
      cord.position.set(0, y + 0.015, z);
      group.add(cord);
    }
  }

  // toggle handles at the tips
  for (const z of [KAYAK_LEN / 2 - 0.15, -KAYAK_LEN / 2 + 0.15]) {
    const tog = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 4, 10), cordMat);
    tog.position.set(0, deckYAt(z * 0.98) + 0.06, z);
    group.add(tog);
  }

  // stern rudder blade
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.32), trimMat);
  rudder.position.set(0, 0.05, -KAYAK_LEN / 2 + 0.05);
  group.add(rudder);
  group.userData.rudder = rudder;

  // contact shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 10.8),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.45 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  shadow.renderOrder = 2;
  shadow.userData.noReflect = true;
  group.add(shadow);

  group.userData.hullMat = hullMat;
  group.userData.deckMat = deckMat;
  group.userData.setPaint = (main, und) => {
    deckMat.color.setHex(main);
    deckMat.emissive.setHex(main).multiplyScalar(0.35);
    if (und != null) hullMat.color.setHex(und);
  };
  group.scale.setScalar(BOAT_SCALE);
  return group;
}

let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,.9)');
  g.addColorStop(0.6, 'rgba(0,0,0,.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(64, 64, 62, 0, 7); ctx.fill();
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

// double-bladed paddle in real-world metres; shaft along X, centred on the grip
export function makePaddle({ blade = 0xf2c94c } = {}) {
  const g = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.4, metalness: 0.3 });
  const bladeMat = new THREE.MeshStandardMaterial({ color: blade, roughness: 0.45, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.1, 8), shaftMat);
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.012, 0.17), bladeMat);
    b.position.x = sx * 1.22;
    b.rotation.x = sx * 0.35; // slight feather
    g.add(b);
  }
  g.userData.bladeMat = bladeMat;
  return g;
}
