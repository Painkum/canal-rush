// The human gondolier standing on the stern deck, plus the canvas name sprite
// used by the AI gondolas. Drop-in for the old orb pilot: {root, update(dt, pose)}.
// Each crew member is a real low-poly person (see person.js) whose accents —
// shirt stripes, neckerchief, hat band or cap — carry their team colour.
import * as THREE from 'three';
import { makePerson } from './person.js';
import { makePaddle } from './kayak.js';

const css = (hex) => '#' + (hex >>> 0).toString(16).padStart(6, '0');

// team-coloured looks, all built on the classic gondolier body
const VARIANTS = {
  // the local entry: blue stripes + blue neckerchief, straw hat
  player: { stripe: '#2e7bf6', kerchief: 0x2e7bf6, hatBand: 0x2e7bf6, hat: 'straw', skin: 0xe7b48c, hair: 0x2e2016 },
  // MIRA — dawn gold
  gold: { stripe: '#c79a2e', kerchief: 0xf2c94c, hatBand: 0xf2c94c, hat: 'straw', skin: 0xd9a07a, hair: 0x4a2e18 },
  // BEPPE — regatta red, sailor's cap
  red: { stripe: '#b03a3a', kerchief: 0xeb5757, hat: 'cap', capColor: 0x8e2f2f, skin: 0xc89068, hair: 0x1a1a1a },
  // NICO — lagoon green, bare-headed
  green: { stripe: '#1e7a48', kerchief: 0x27ae60, hat: 'none', skin: 0xe0aa80, hair: 0x20242a },
};

export function makeHumanPilot(variant = 'player') {
  const person = makePerson('gondolier', VARIANTS[variant] || VARIANTS.player);
  // same pose contract the orb pilot had: {mode:'pole'|'idle', phase, intensity, steer}
  function update(dt, pose = {}) {
    person.update(dt, pose);
  }
  return { root: person.root, person, update };
}

// A kayaker seated in a cockpit, holding a double-bladed paddle that twists
// with the torso. pose: {mode:'paddle'|'idle', phase, intensity, steer}
export function makeKayakPaddler(variant = 'player', { vest = 0xf2763a, blade = 0xf2c94c } = {}) {
  const look = { ...(VARIANTS[variant] || VARIANTS.player), vest };
  if (look.hat === 'straw') look.hat = 'cap';
  if (!look.capColor) look.capColor = look.kerchief ?? 0x35506a;
  const person = makePerson('gondolier', look);
  const paddle = makePaddle({ blade });
  paddle.position.set(0, 0.30, 0.55);
  person.joints.spine.add(paddle);
  let restT = 0;
  function update(dt, pose = {}) {
    const active = pose.mode === 'paddle';
    restT += dt;
    const phase = active ? (pose.phase ?? 0) : Math.sin(restT * 0.6) * 0.03;
    const intensity = active ? (pose.intensity ?? 1) : 0;
    person.update(dt, { mode: 'paddle', phase, intensity, steer: pose.steer || 0 });
    const s = Math.sin(phase * Math.PI * 2);
    // roll the shaft so the leading blade dips in; level it out at rest
    const k = 0.35 + 0.65 * Math.min(1, intensity);
    paddle.rotation.z = active ? s * 0.52 * k : 0.04 * Math.sin(restT * 0.8);
    paddle.rotation.y = active ? -s * 0.12 * k : 0;
  }
  return {
    root: person.root, person, paddle, update,
    setColors({ vest: v, blade: b } = {}) {
      if (v != null) person.setVest(v);
      if (b != null) paddle.userData.bladeMat.color.setHex(b);
    },
  };
}

export function makeNameSprite(text, colorHex = null) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d');
  c.font = '800 50px "Manrope", system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillStyle = 'rgba(6,11,20,0.55)';
  const w = c.measureText(text).width + 60;
  c.beginPath(); c.roundRect((512 - w) / 2, 22, w, 84, 16); c.fill();
  c.fillStyle = colorHex ? css(colorHex) : '#eef5fc';
  c.fillText(text, 256, 80);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2.6, 0.65, 1);
  return sp;
}
