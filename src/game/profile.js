// CANAL RUSH — local paddler profiles: name, coins, kayak upgrades, paint.
// Everything lives in this browser's localStorage; nothing leaves the device.

const KEY = 'venice-speed.profiles';
const CUR = 'venice-speed.current';
const START_COINS = 120;

export const VEST_COLORS = [0x2e7bf6, 0xf2763a, 0x27ae60, 0xeb5757, 0xb57bff, 0xf2c94c];

export const UPGRADES = [
  { id: 'paddle', name: 'Carbon Paddle', desc: 'Stronger stroke · +12% thrust per level', costs: [60, 140, 260] },
  { id: 'hull', name: 'Stable Hull', desc: 'Rapids & wakes toss you less · takes harder hits', costs: [70, 160, 300] },
  { id: 'rudder', name: 'Skeg & Rudder', desc: 'Sharper turning · +15% per level', costs: [50, 120, 220] },
  { id: 'glide', name: 'Polished Keel', desc: 'Less drag · higher top speed', costs: [80, 180, 340] },
];

export const PAINTS = [
  { id: 'azure', name: 'Azure', hull: 0x2e7bf6, deck: 0xeaf1f8, blade: 0xf2c94c, cost: 0 },
  { id: 'sunset', name: 'Sunset', hull: 0xf2763a, deck: 0xfff3e2, blade: 0x1c1f24, cost: 80 },
  { id: 'lagoon', name: 'Lagoon', hull: 0x1fa58a, deck: 0xe8f6ef, blade: 0xf2763a, cost: 80 },
  { id: 'carbon', name: 'Carbon', hull: 0x1b1d22, deck: 0x3a3f48, blade: 0xeb5757, cost: 160 },
  { id: 'doge', name: 'Doge Gold', hull: 0xd6a53a, deck: 0x2a1e10, blade: 0xeef5fc, cost: 320 },
];

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { return []; }
}
function writeAll(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

function fresh(name, vest) {
  return {
    name, vest, coins: START_COINS,
    upgrades: { paddle: 0, hull: 0, rudder: 0, glide: 0 },
    paints: ['azure'], paint: 'azure',
    best: { regatta: null, route: null }, races: 0, wins: 0,
    created: Date.now(), last: Date.now(),
  };
}

export function makeProfiles() {
  let list = readAll();
  let cur = null;
  const listeners = [];
  const changed = () => { if (cur) { cur.last = Date.now(); writeAll(list); } listeners.forEach((f) => f(cur)); };

  return {
    list: () => [...list].sort((a, b) => b.last - a.last),
    lastName() { try { return localStorage.getItem(CUR); } catch { return null; } },
    get current() { return cur; },
    onChange(f) { listeners.push(f); },

    signIn(name, vest) {
      name = String(name).trim().slice(0, 12);
      if (!name) return null;
      let p = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!p) { p = fresh(name, vest ?? VEST_COLORS[0]); list.push(p); }
      else if (vest != null) p.vest = vest;
      // older saves may miss newer fields
      p.upgrades = { paddle: 0, hull: 0, rudder: 0, glide: 0, ...p.upgrades };
      p.paints ||= ['azure']; p.paint ||= 'azure'; p.best ||= { regatta: null, route: null };
      cur = p;
      try { localStorage.setItem(CUR, p.name); } catch {}
      changed();
      return p;
    },
    signOut() { cur = null; listeners.forEach((f) => f(cur)); },
    remove(name) {
      list = list.filter((x) => x.name !== name);
      writeAll(list);
    },

    // ---- shop
    nextCost(id) {
      const u = UPGRADES.find((x) => x.id === id);
      const lvl = cur?.upgrades[id] ?? 0;
      return lvl >= u.costs.length ? null : u.costs[lvl];
    },
    buyUpgrade(id) {
      const cost = this.nextCost(id);
      if (!cur || cost == null) return { ok: false, why: 'max' };
      if (cur.coins < cost) return { ok: false, why: 'coins' };
      cur.coins -= cost;
      cur.upgrades[id]++;
      changed();
      return { ok: true };
    },
    buyOrEquipPaint(id) {
      const pt = PAINTS.find((x) => x.id === id);
      if (!cur || !pt) return { ok: false };
      if (!cur.paints.includes(id)) {
        if (cur.coins < pt.cost) return { ok: false, why: 'coins' };
        cur.coins -= pt.cost;
        cur.paints.push(id);
      }
      cur.paint = id;
      changed();
      return { ok: true };
    },
    paint() { return PAINTS.find((x) => x.id === cur?.paint) || PAINTS[0]; },

    // ---- gameplay multipliers from upgrades
    stats() {
      const u = cur?.upgrades || {};
      return {
        thrust: 1 + 0.12 * (u.paddle || 0),
        turn: 1 + 0.15 * (u.rudder || 0),
        resist: 0.22 * (u.hull || 0),        // fraction of rapids/wake shove removed
        toughness: 1 + 0.2 * (u.hull || 0),  // crash threshold multiplier
        drag: 1 - 0.08 * (u.glide || 0),
      };
    },

    // ---- rewards: called once per finished run with the results payload
    award(r) {
      if (!cur) return { coins: 0, lines: [] };
      const lines = [];
      if (r.kind === 'regatta') {
        const base = [150, 90, 60, 30][r.place - 1] ?? 20;
        lines.push([`Place P${r.place}`, base]);
        cur.races++;
        if (r.place === 1) cur.wins++;
        if (r.place === 1 && (cur.best.regatta == null || r.time < cur.best.regatta)) {
          cur.best.regatta = r.time;
          lines.push(['New best time', 40]);
        }
      } else {
        if (r.fares) lines.push([`${r.fares} fares delivered`, r.fares * 25]);
        if (r.kind === 'complete') lines.push(['Route complete', 50]);
        if (r.kind === 'complete' && r.lost === 0) lines.push(['Perfect morning', 60]);
        if (r.kind === 'complete' && (cur.best.route == null || r.time < cur.best.route)) cur.best.route = r.time;
      }
      const coins = lines.reduce((a, [, c]) => a + c, 0);
      cur.coins += coins;
      changed();
      return { coins, lines };
    },
  };
}
