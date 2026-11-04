// CANAL RUSH — heading-up minimap: the canal around you (~45 m radius) with
// walls, rapids, rocks, docks, ? boxes, the finish line, rivals and you.
import { DOCKS, BRIDGES } from '../scene/canal.js';

const PX_PER_M = 3.4;
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

export function makeMinimap(app, canvas) {
  const ctx = canvas.getContext('2d');
  const world = app.world;
  const canal = world.canal;
  const game = app.game;
  let W = 0, H = 0, dpr = 1;

  function fit() {
    dpr = Math.min(2, devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  addEventListener('resize', fit);

  let last = 0;
  function draw(d) {
    const now = performance.now();
    if (now - last < 50) return; // ~20 Hz is plenty
    last = now;
    if (!W) fit();
    const S = game.S;
    const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
    const rx = -Math.cos(S.heading), rz = Math.sin(S.heading); // screen-right in world
    const cx = W / 2, cy = H * 0.58; // you sit low so you see further ahead
    const k = PX_PER_M;
    const tx = (x, z) => {
      const dx = x - S.x, dz = z - S.z;
      return [cx + (dx * rx + dz * rz) * k, cy - (dx * fx + dz * fz) * k];
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // canal water: polygon between the two walls near you
    const near = canal.nearestS(S.x, S.z);
    const i0 = Math.max(0, near.i - 50), i1 = Math.min(canal.samples.length - 1, near.i + 60);
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) { const [x, y] = tx(canal.left[i].x, canal.left[i].y); i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    for (let i = i1; i >= i0; i--) { const [x, y] = tx(canal.right[i].x, canal.right[i].y); ctx.lineTo(x, y); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(63, 208, 201, .32)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(246, 239, 228, .9)';
    ctx.stroke();

    // rapids: foamy bands across the canal
    const rapids = world.rapids;
    if (rapids) {
      for (const z of rapids.zones) {
        if (Math.abs(z.s - near.s) > 80) continue;
        ctx.beginPath();
        const a = z.s - z.len / 2, b = z.s + z.len / 2;
        for (let s = a; s <= b; s += 2) { const p = canal.atS(s); const [x, y] = tx(p.x + Math.cos(p.ang) * p.width * 0.45, p.z - Math.sin(p.ang) * p.width * 0.45); s === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        for (let s = b; s >= a; s -= 2) { const p = canal.atS(s); const [x, y] = tx(p.x - Math.cos(p.ang) * p.width * 0.45, p.z + Math.sin(p.ang) * p.width * 0.45); ctx.lineTo(x, y); }
        ctx.closePath();
        ctx.fillStyle = 'rgba(246, 239, 228, .35)';
        ctx.fill();
      }
      ctx.fillStyle = '#5b6470';
      for (const rk of rapids.rocks) {
        if (Math.abs(rk.s - near.s) > 70) continue;
        const [x, y] = tx(rk.x, rk.z);
        ctx.beginPath(); ctx.arc(x, y, Math.max(2.2, rk.r * k), 0, 6.283); ctx.fill();
      }
    }

    // bridges: thin dark bars
    ctx.strokeStyle = 'rgba(20, 28, 40, .8)';
    ctx.lineWidth = 3;
    for (const br of BRIDGES) {
      if (Math.abs(br.s - near.s) > 70) continue;
      crossLine(br.s, tx);
    }

    // docks (target dock glows in the Morning Route) + finish line
    for (const dk of DOCKS) {
      if (Math.abs(dk.s - near.s) > 70) continue;
      const p = canal.atS(dk.s);
      const nx = Math.cos(p.ang) * dk.side, nz = -Math.sin(p.ang) * dk.side;
      const [x, y] = tx(p.x + nx * (p.width / 2 - 0.8), p.z + nz * (p.width / 2 - 0.8));
      const isTarget = d.mode !== 'regatta' && d.targetS === dk.s;
      ctx.fillStyle = isTarget ? '#ff7a59' : 'rgba(255, 211, 161, .9)';
      ctx.fillRect(x - 4, y - 4, 8, 8);
      if (isTarget) { ctx.strokeStyle = 'rgba(255,122,89,.65)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9 + Math.sin(now / 200) * 2, 0, 6.283); ctx.stroke(); }
    }
    if (d.mode === 'regatta' && Math.abs(d.targetS - near.s) < 80) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      crossLine(d.targetS, tx);
      ctx.setLineDash([]);
    }

    // ? boxes
    const items = game._rg?.items;
    if (d.mode === 'regatta' && items?.boxes) {
      ctx.fillStyle = '#ffd3a1';
      for (const b of items.boxes) {
        if (!b.active) continue;
        const [x, y] = tx(b.x, b.z);
        if (x < -6 || y < -6 || x > W + 6 || y > H + 6) continue;
        ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      }
    }

    // other boats
    const npc = world.npcBoat;
    if (npc) dot(tx(npc.position.x, npc.position.z), 3, 'rgba(220,220,220,.8)');
    if (d.mode === 'regatta') {
      for (const b of game._rg?.bots || []) {
        const [x, y] = tx(b.x, b.z);
        arrow(x, y, b.heading - S.heading, hex(b.color), 5.5);
      }
    }
    // you
    arrow(cx, cy, 0, '#ff7a59', 8, true);

    function crossLine(s, f) {
      const p = canal.atS(s);
      const nx = Math.cos(p.ang), nz = -Math.sin(p.ang), hw = p.width / 2;
      const [x1, y1] = f(p.x - nx * hw, p.z - nz * hw), [x2, y2] = f(p.x + nx * hw, p.z + nz * hw);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }

  function dot([x, y], r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); }
  function arrow(x, y, rel, color, size, outline) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-rel);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, size * 0.75);
    ctx.lineTo(0, size * 0.35);
    ctx.lineTo(-size * 0.7, size * 0.75);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = outline ? 2 : 1.2;
    ctx.strokeStyle = outline ? '#fff' : 'rgba(10,15,25,.8)';
    ctx.stroke();
    ctx.restore();
  }

  return { draw, fit };
}
