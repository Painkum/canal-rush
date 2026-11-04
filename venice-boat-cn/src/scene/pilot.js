// The orb pilot standing on the stern deck, plus the canvas name sprite used
// by the AI gondolas. Drop-in for makePerson's {root, update(dt, pose)}.
import * as THREE from 'three';

export function makeOrbPilot(colorHex) {
  const root = new THREE.Group();
  const color = new THREE.Color(colorHex);
  const orbMat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0,
  });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), orbMat);
  orb.position.y = 0.42;
  orb.castShadow = true;
  root.add(orb);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.45,
  });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), eyeMat);
    eye.scale.set(0.062, 0.115, 0.038);
    eye.position.set(s * 0.115, 0.48, 0.305);
    root.add(eye);
  }
  let t = Math.random() * 6;
  function update(dt, pose = {}) {
    t += dt;
    const steer = pose.steer || 0;
    if (pose.mode === 'pole') {
      // bobs with the stroke cycle, leans into the pole
      const ph = (pose.phase ?? 0) * Math.PI * 2;
      orb.position.y = 0.42 + Math.sin(ph) * 0.05 * (pose.intensity ?? 1);
      root.rotation.x = Math.sin(ph + 0.6) * 0.1 * (pose.intensity ?? 1);
    } else {
      orb.position.y = 0.42 + Math.sin(t * 1.4) * 0.02;
      root.rotation.x *= 0.9;
    }
    root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, -steer * 0.18, 0.1);
  }
  return { root, update, setColor(hex) {
    const c = new THREE.Color(hex);
    orbMat.color.copy(c);
    orbMat.emissive.copy(c);
  } };
}

export function makeNameSprite(text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d');
  c.font = '600 54px "Geist Mono", Menlo, monospace';
  c.textAlign = 'center';
  c.fillStyle = 'rgba(6,11,20,0.55)';
  const w = c.measureText(text).width + 60;
  c.beginPath(); c.roundRect((512 - w) / 2, 22, w, 84, 16); c.fill();
  c.fillStyle = '#eef5fc';
  c.fillText(text, 256, 80);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(2.6, 0.65, 1);
  return sp;
}
