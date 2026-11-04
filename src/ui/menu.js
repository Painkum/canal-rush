// CANAL RUSH — front-end state machine.
// Login + main menu are "hub" screens: a top bar with the emblem, a big
// greeting, and vaporetto-ticket cards along the bottom over the live canal.
// Sub-screens (shop, controls, settings, pause, results) are a rounded panel. Keyboard and
// pointer share one selection model: zones (↑↓ between, ←→ within).
import { blip, setSound } from './audio.js';
import { LEG_NAMES } from '../game/game.js';
import { UPGRADES, PAINTS, VEST_COLORS } from '../game/profile.js';
import { logoHTML, TAGLINE, FULL_NAME } from './brand.js';
import { makeMinimap } from './minimap.js';
import { RAPID_ZONES } from '../game/rapids.js';
import { DOCKS, BRIDGES } from '../scene/canal.js';

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmtTime = (s, ms = false) => {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const frac = ms ? String(Math.floor((s * 1000) % 1000)).padStart(3, '0') : String(Math.floor((s * 10) % 10));
  return `${m}:${String(sec).padStart(2, '0')}.${frac}`;
};
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th');
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const coin = (n) => `<i class="coin"></i>${n}`;
const ICONS = {
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dock: '<svg viewBox="0 0 24 24"><path d="M3 15h18M6 15v5M18 15v5M12 15v5M4 11c2-2 4-2 6 0s4 2 6 0 4-2 4-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  wrench: '<svg viewBox="0 0 24 24"><path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Buongiorno' : hr < 18 ? 'Buon pomeriggio' : 'Buonasera'; };

export function makeUI(app) {
  const ui = document.getElementById('ui');
  const scrim = document.getElementById('scrim');
  const noticeEl = document.getElementById('notice');
  const hudEl = document.getElementById('hud');
  const game = app.game;
  const profiles = app.profiles;
  document.title = `${FULL_NAME} — Kayak Racing at Dawn`;

  const roster = game.roster; // { me: {name,color}, rivals: [{name,color}] }
  const colorOf = (name) => {
    if (name === roster.me.name) return hex(roster.me.color);
    const r = roster.rivals.find((x) => x.name === name);
    return r ? hex(r.color) : '#888';
  };

  // ---------- settings rows ----------
  const SETTING_ROWS = [
    { label: 'Quality', value: () => app.settings.quality, cycle: (d) => cycleQuality(d) },
    { label: 'Sound', value: () => (app.settings.sound ? 'On' : 'Off'), cycle: () => toggleSound() },
  ];
  function cycleQuality(d) {
    const order = ['low', 'medium', 'high'];
    const i = order.indexOf(app.settings.quality);
    app.applyQuality(order[(i + d + 3) % 3]);
    blip.nav();
    refreshValues();
  }
  function toggleSound() {
    app.settings.sound = !app.settings.sound;
    app.saveSettings();
    setSound(app.settings.sound);
    blip.confirm();
    refreshValues();
  }

  // ---------- screens + their actions ----------
  const ZONES = { login: ['rows', 'acts'], menu: ['acts'], shop: ['rows', 'acts'], controls: ['acts'], settings: ['rows', 'acts'], pause: ['acts'], results: ['acts'] };
  // card: {kick, title, sub, kind: 'hero'|'card'|'small'}
  const ACTIONS = {
    login: [
      { kind: 'hero', kick: 'Boarding', title: () => 'Board', sub: () => 'Sign in and hit the water', act: 'login' },
    ],
    menu: [
      { kind: 'hero', kick: 'Line 1 · Race', title: () => 'Race', sub: () => '3 rivals · 600 m · 5 rapids', act: 'regatta', icon: 'flag' },
      { kind: 'card', kick: 'Line 2 · Solo', title: () => 'Ferry', sub: () => 'Five fares, six docks, no bumps', act: 'route', icon: 'dock' },
      { kind: 'card', kick: 'Line 3 · Boatyard', title: () => 'Shop', sub: () => `Upgrades & paint · ${coin(profiles.current?.coins ?? 0)}`, act: 'shop', icon: 'wrench' },
      { kind: 'small', title: () => 'Settings', act: 'settings' },
      { kind: 'small', title: () => 'Controls', act: 'controls' },
      { kind: 'small', title: () => 'Switch paddler', act: 'logout' },
    ],
    shop: [{ title: () => 'Back', act: 'back' }],
    controls: [{ title: () => 'Back', act: 'back' }],
    settings: [{ title: () => 'Back', act: 'back' }],
    pause: [
      { title: () => 'Resume', act: 'resume' },
      { title: () => 'Restart', act: 'restart' },
      { title: () => 'Settings', act: 'settings' },
      { title: () => 'Main Menu', act: 'main' },
    ],
    results: [
      { title: () => 'Race Again', act: 'restart' },
      { title: () => 'Shop', act: 'shop' },
      { title: () => 'Main Menu', act: 'main' },
    ],
  };
  const FOOT = {
    login: 'Profiles are saved on this device only',
    menu: '← → ↑ ↓ Move · Enter select',
    shop: '↑ ↓ Move · Enter buy / equip · Esc back',
    controls: 'Esc back',
    settings: '← → Change · Esc back',
    pause: 'Esc resume',
    results: 'Enter confirm',
  };

  const screenEls = {};

  function actButton(id, a, i) {
    let mi;
    if (a.kind === 'hero' || a.kind === 'card') {
      mi = h(`<button class="mi card ${a.kind} st" data-i="${i}">
        <span class="body"><span class="kick">${a.kick}</span><span class="ttl">${a.title()}</span><span class="sub">${a.sub()}</span></span>
        <span class="stub">${ICONS[a.icon] || ''}<span class="go">›</span></span>
      </button>`);
    } else if (a.kind === 'small') {
      mi = h(`<button class="mi chip st" data-i="${i}"><span class="ttl">${a.title()}</span></button>`);
    } else {
      mi = h(`<button class="mi pbtn st" data-i="${i}"><span class="ttl">${a.title()}</span></button>`);
    }
    mi.addEventListener('pointerover', () => select(id, 'acts', i));
    mi.addEventListener('click', () => { confirmAct(id, i); mi.blur(); });
    return mi;
  }
  function refreshActLabels(id) {
    ACTIONS[id].forEach((a, i) => {
      const el = screenEls[id].querySelector(`.mi[data-i="${i}"]`);
      if (!el) return;
      el.querySelector('.ttl').innerHTML = a.title();
      const sub = el.querySelector('.sub');
      if (sub && a.sub) sub.innerHTML = a.sub();
    });
  }

  // hub: logo, tag chip, left column of cards, right side panel
  function makeHub(id) {
    const el = h(`<section class="screen hub" data-screen="${id}">
      <header class="topbar">${logoHTML('st')}</header>
      <div class="hub-main"><div class="pre"></div><div class="acts"><div class="tickets"></div></div></div>
      <aside class="side st"></aside>
      <div class="foot st">${FOOT[id] || ''}</div>
    </section>`);
    const tickets = el.querySelector('.tickets');
    const acts = el.querySelector('.acts');
    let row = null;
    ACTIONS[id].forEach((a, i) => {
      const b = actButton(id, a, i);
      if (a.kind === 'small') {
        if (!row) { row = h('<div class="chiprow"></div>'); acts.appendChild(row); }
        row.appendChild(b);
      } else tickets.appendChild(b);
    });
    ui.appendChild(el);
    screenEls[id] = el;
    return el;
  }

  // panel: kicker, title, body, a row of buttons
  function makePanel(id, kick, title) {
    const el = h(`<section class="screen" data-screen="${id}">
      <div class="panel">
        <div class="over st">${kick}</div>
        <div class="mast st">${title}</div>
        <div class="mid"></div>
        <div class="acts"></div>
      </div>
      <div class="foot st">${FOOT[id] || ''}</div>
    </section>`);
    const acts = el.querySelector('.acts');
    ACTIONS[id].forEach((a, i) => acts.appendChild(actButton(id, a, i)));
    ui.appendChild(el);
    screenEls[id] = el;
    return el;
  }

  // ================================================================ LOGIN ==
  const loginEl = makeHub('login');
  loginEl.querySelector('.pre').innerHTML = `
    <h1 class="headline st">Grab a paddle.</h1>
    <p class="lede st">${TAGLINE}. Race the locals, ride the rapids, ferry the early risers.</p>
    <div class="formcard st">
      <div class="kick">New paddler</div>
      <input class="namefield" type="text" maxlength="12" placeholder="Your name" autocomplete="off" spellcheck="false" aria-label="Paddler name">
      <div class="swatches" role="radiogroup" aria-label="Vest colour"><span class="lab">Vest</span></div>
      <div class="loginmsg"></div>
    </div>`;
  loginEl.querySelector('.side').innerHTML = `
    <div class="side-h">Returning paddlers</div>
    <div class="plist"></div>
    <div class="side-empty">No paddlers yet. Write your name on the left to start a career.</div>`;
  const nameInput = loginEl.querySelector('.namefield');
  const swatchesEl = loginEl.querySelector('.swatches');
  const plistEl = loginEl.querySelector('.plist');
  const loginMsg = loginEl.querySelector('.loginmsg');
  let pickedVest = VEST_COLORS[0];
  VEST_COLORS.forEach((c, i) => {
    const b = h(`<button class="sw${i === 0 ? ' on' : ''}" role="radio" aria-label="Vest colour ${i + 1}" style="--c:${hex(c)}"></button>`);
    b.addEventListener('click', () => {
      pickedVest = c;
      [...swatchesEl.querySelectorAll('.sw')].forEach((x) => x.classList.toggle('on', x === b));
      blip.nav();
    });
    swatchesEl.appendChild(b);
  });
  nameInput.addEventListener('input', () => { loginMsg.textContent = ''; });
  nameInput.addEventListener('focus', () => select('login', 'acts', 0));

  function renderLogin() {
    const list = profiles.list().slice(0, 5);
    loginEl.querySelector('.side-empty').style.display = list.length ? 'none' : '';
    plistEl.innerHTML = '';
    list.forEach((p, i) => {
      const row = h(`<button class="rv prow" data-i="${i}">
        <i class="pip" style="background:${hex(p.vest)}"></i>
        <span class="rk">${esc(p.name)}</span>
        <span class="rval">${coin(p.coins)}<small>${p.wins} win${p.wins === 1 ? '' : 's'}</small></span>
      </button>`);
      row.addEventListener('pointerover', () => select('login', 'rows', i));
      row.addEventListener('click', () => { signIn(p.name, null); row.blur(); });
      plistEl.appendChild(row);
    });
    nameInput.value = '';
    loginMsg.textContent = '';
    sel.login = list.length ? { z: 'rows', i: 0 } : { z: 'acts', i: 0 };
  }

  function signIn(name, vest) {
    const p = profiles.signIn(name, vest);
    if (!p) {
      loginMsg.textContent = 'Type your name first';
      nameInput.focus();
      blip.bad();
      return;
    }
    nameInput.blur();
    blip.confirm();
    game.setProfile(p);
    renderMenu();
    stack = ['menu'];
    sel.menu = { z: 'acts', i: 0 };
    show('menu', { asBack: true });
  }
  function submitLogin() {
    const typed = nameInput.value.trim();
    if (typed) return signIn(typed, pickedVest);
    if (sel.login.z === 'rows') {
      const p = profiles.list()[sel.login.i];
      if (p) return signIn(p.name, null);
    }
    signIn('', null);
  }

  // ================================================================= MENU ==
  const menuEl = makeHub('menu');
  function renderMenu() {
    const p = profiles.current;
    refreshActLabels('menu');
    if (!p) return;
    const lv = Object.values(p.upgrades).reduce((a, b) => a + b, 0);
    menuEl.querySelector('.pre').innerHTML = `
      <div class="hello st"><i class="pip" style="background:${hex(p.vest)}"></i>${greeting()},</div>
      <h1 class="headline st">${esc(p.name)}.</h1>
      <p class="lede st">The lagoon's calm. Your rivals aren't. Pick your line.</p>
      <div class="statrow st">
        <div class="stat"><b>${p.races}</b><span>Races</span></div>
        <div class="stat"><b>${p.wins}</b><span>Wins</span></div>
        <div class="stat"><b>${coin(p.coins)}</b><span>Coins</span></div>
        <div class="stat"><b>${lv}<small>/12</small></b><span>Upgrades</span></div>
        <div class="stat"><b>${fmtTime(p.best.regatta)}</b><span>Best race</span></div>
      </div>`;
  }

  // ============================================================= CONTROLS ==
  const controlsEl = makePanel('controls', 'How to paddle', 'Controls');
  controlsEl.querySelector('.mid').innerHTML = `
    <div class="rows">
      <div class="row st"><span class="k">W</span><span class="v">Paddle forward</span></div>
      <div class="row st"><span class="k">S</span><span class="v">Back-paddle — reverse &amp; brake</span></div>
      <div class="row st"><span class="k">A / D</span><span class="v">Rudder — steer</span></div>
      <div class="row st"><span class="k">Mouse</span><span class="v">Sweep the paddle — analog thrust &amp; steering</span></div>
      <div class="row st"><span class="k">Space</span><span class="v">Push off a wall with the paddle</span></div>
      <div class="row st"><span class="k">E</span><span class="v">Use the power-up from a ? box</span></div>
      <div class="row st"><span class="k">Esc</span><span class="v">Pause</span></div>
      <p class="desc st"><b>Race</b> — first kayak across Zattere Alba wins. Smash the floating <b>?</b> boxes for a random power-up: Wave, Whirlpool, Anchor, Splash, Shield or Swap.</p>
      <p class="desc st"><b>Rapids</b> — five whitewater stretches sweep you downstream and shove you sideways. Find the gap between the rocks; the minimap shows them.</p>
      <p class="desc st"><b>Morning Route</b> — ferry five fares. Dock slowly, level and head-on. Hit a wall, rock or boat too hard and your passenger walks; lose three and it's over.</p>
    </div>`;

  // ============================================================= SETTINGS ==
  const settingsEl = makePanel('settings', 'Preferences', 'Settings');
  const settingsMid = settingsEl.querySelector('.mid');
  SETTING_ROWS.forEach((r, i) => {
    const rv = h(`<button class="rv st" data-i="${i}">
      <span class="rk">${r.label}</span>
      <span class="rval"><span class="chev">‹</span><span class="vv"></span><span class="chev">›</span></span>
    </button>`);
    rv.addEventListener('pointerover', () => select('settings', 'rows', i));
    rv.addEventListener('click', () => { r.cycle(1); rv.blur(); });
    settingsMid.appendChild(rv);
  });
  function refreshValues() {
    SETTING_ROWS.forEach((r, i) => {
      const vv = settingsEl.querySelector(`.rv[data-i="${i}"] .vv`);
      if (vv) vv.textContent = r.value();
    });
  }

  // ================================================================= SHOP ==
  const shopEl = makePanel('shop', 'Boatyard', 'Shop');
  shopEl.classList.add('wide');
  const shopMid = shopEl.querySelector('.mid');
  shopMid.innerHTML = '<div class="cap st">Upgrades</div><div class="ulist"></div><div class="cap st">Paint</div><div class="plist2"></div><div class="shopmsg"></div>';
  const ulistEl = shopMid.querySelector('.ulist');
  const paintListEl = shopMid.querySelector('.plist2');
  const shopMsg = shopMid.querySelector('.shopmsg');
  const SHOP_ROWS = [...UPGRADES.map((u) => ({ kind: 'up', u })), ...PAINTS.map((pt) => ({ kind: 'paint', pt }))];
  function renderShop() {
    const p = profiles.current;
    if (!p) return;
    shopEl.querySelector('.over').innerHTML = `Boatyard · ${esc(p.name)} · ${coin(p.coins)}`;
    ulistEl.innerHTML = '';
    paintListEl.innerHTML = '';
    SHOP_ROWS.forEach((r, i) => {
      let html;
      if (r.kind === 'up') {
        const lvl = p.upgrades[r.u.id];
        const cost = profiles.nextCost(r.u.id);
        const pips = r.u.costs.map((_, k) => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('');
        const poor = cost != null && p.coins < cost;
        html = `<button class="rv shoprow${poor ? ' poor' : ''}${cost == null ? ' maxed' : ''}" data-i="${i}">
          <span class="sh-main"><span class="rk">${r.u.name}</span><span class="sh-desc">${r.u.desc}</span></span>
          <span class="sh-pips">${pips}</span>
          <span class="rval">${cost == null ? 'Maxed' : coin(cost)}</span>
        </button>`;
      } else {
        const owned = p.paints.includes(r.pt.id);
        const on = p.paint === r.pt.id;
        const poor = !owned && p.coins < r.pt.cost;
        html = `<button class="rv shoprow paintrow${poor ? ' poor' : ''}${on ? ' equipped' : ''}" data-i="${i}">
          <span class="sh-main"><span class="rk"><i class="hullsw" style="--h:${hex(r.pt.hull)};--d:${hex(r.pt.deck)}"></i>${r.pt.name}</span></span>
          <span class="rval">${on ? 'Equipped' : owned ? 'Equip' : coin(r.pt.cost)}</span>
        </button>`;
      }
      const row = h(html);
      row.addEventListener('pointerover', () => select('shop', 'rows', i));
      row.addEventListener('click', () => { buyRow(i); row.blur(); });
      (r.kind === 'up' ? ulistEl : paintListEl).appendChild(row);
    });
    paintSel('shop');
  }
  let shopMsgTimer = null;
  function flashShop(text, good) {
    shopMsg.textContent = text;
    shopMsg.classList.toggle('good', !!good);
    clearTimeout(shopMsgTimer);
    shopMsgTimer = setTimeout(() => { shopMsg.textContent = ''; }, 2200);
  }
  function buyRow(i) {
    const r = SHOP_ROWS[i];
    if (!r) return;
    let res;
    if (r.kind === 'up') {
      res = profiles.buyUpgrade(r.u.id);
      if (res.ok) flashShop(`${r.u.name} — level ${profiles.current.upgrades[r.u.id]}`, true);
    } else {
      res = profiles.buyOrEquipPaint(r.pt.id);
      if (res.ok) flashShop(`${r.pt.name} paint on the hull`, true);
    }
    if (res.ok) blip.good();
    else {
      blip.bad();
      flashShop(res.why === 'max' ? 'Already maxed out' : 'Not enough coins — win a race first');
    }
    game.refreshLoadout();
    renderShop();
    renderMenu();
  }

  // ======================================================= PAUSE / RESULTS ==
  makePanel('pause', 'The canal waits', 'Paused');
  makePanel('results', 'Race over', '—');

  // ============================================================ selection ==
  let stack = ['login'];
  const sel = {
    login: { z: 'acts', i: 0 },
    menu: { z: 'acts', i: 0 },
    shop: { z: 'rows', i: 0 },
    controls: { z: 'acts', i: 0 },
    settings: { z: 'rows', i: 0 },
    pause: { z: 'acts', i: 0 },
    results: { z: 'acts', i: 0 },
  };
  let mode = 'menu'; // 'menu' | 'hud'
  const current = () => stack[stack.length - 1];

  function zoneItems(id, z) {
    const el = screenEls[id];
    if (z === 'rows') return [...el.querySelectorAll('.rv')];
    return [...el.querySelectorAll('.acts .mi')];
  }
  function paintSel(id) {
    const cur = sel[id];
    for (const z of ZONES[id]) {
      zoneItems(id, z).forEach((el2, k) => el2.classList.toggle('sel', z === cur.z && k === cur.i));
    }
  }
  function select(id, z, i) {
    const items = zoneItems(id, z);
    if (!items.length) return;
    i = ((i % items.length) + items.length) % items.length;
    const changed = sel[id].z !== z || sel[id].i !== i;
    sel[id] = { z, i };
    if (changed) blip.nav();
    paintSel(id);
  }
  function assignStagger(root) {
    [...root.querySelectorAll('.st')].forEach((el2, k) => { el2.style.animationDelay = `${k * 55}ms`; });
  }
  function show(id, { asBack = false } = {}) {
    if (!asBack && current() !== id) stack.push(id);
    const el = screenEls[id];
    for (const sel2 of Object.values(screenEls)) {
      const on = sel2 === el;
      sel2.classList.toggle('active', on);
      if (on) {
        sel2.classList.remove('entering');
        void sel2.offsetWidth;
        sel2.classList.add('entering');
      }
    }
    ui.classList.toggle('on-hub', el.classList.contains('hub'));
    refreshValues();
    assignStagger(el);
    paintSel(id);
  }
  function goBack() {
    if (stack.length > 1) {
      stack.pop();
      show(current(), { asBack: true });
      blip.back();
    }
  }

  function confirmAct(id, i) {
    const it = ACTIONS[id][i];
    if (!it) return;
    blip.confirm();
    switch (it.act) {
      case 'regatta': startGame('regatta'); break;
      case 'route': startGame('fares'); break;
      case 'restart': startGame(lastGame); break;
      case 'controls': show('controls'); break;
      case 'shop': renderShop(); show('shop'); break;
      case 'login': submitLogin(); break;
      case 'logout': profiles.signOut(); game.setProfile(null); renderLogin(); stack = ['login']; show('login', { asBack: true }); break;
      case 'settings': show('settings'); break;
      case 'back': goBack(); break;
      case 'resume': resumeGame(); break;
      case 'main': toMainMenu(); break;
    }
  }
  function confirmCurrent() {
    const id = current();
    const cur = sel[id];
    if (cur.z === 'rows') {
      if (id === 'login') { submitLogin(); return; }
      if (id === 'shop') { buyRow(cur.i); return; }
      SETTING_ROWS[cur.i].cycle(1); return;
    }
    confirmAct(id, cur.i);
  }

  // ===================================================== mode transitions ==
  let lastGame = 'regatta';

  function enterHud() {
    stack = ['menu'];
    for (const el of Object.values(screenEls)) el.classList.remove('active');
    mode = 'hud';
    ui.classList.remove('on-hub');
    ui.classList.add('playing', 'hudonly');
    scrim.classList.add('playing');
    hudEl.classList.add('active');
    hud.onRunStart(lastGame);
  }
  function startGame(kind) {
    lastGame = kind;
    enterHud();
    if (kind === 'regatta') app.startRegatta();
    else app.startRun();
  }
  function pauseGame() {
    if (mode !== 'hud' || (game.R.state !== 'playing' && game.R.state !== 'countdown')) return;
    mode = 'menu';
    app.setMode('paused');
    ui.classList.remove('playing', 'hudonly');
    scrim.classList.remove('playing');
    hudEl.classList.remove('active');
    stack = ['pause'];
    show('pause', { asBack: true });
  }
  function resumeGame() {
    mode = 'hud';
    app.setMode('game');
    ui.classList.add('playing', 'hudonly');
    scrim.classList.add('playing');
    hudEl.classList.add('active');
    for (const el of Object.values(screenEls)) el.classList.remove('active');
    blip.confirm();
  }
  function toMainMenu() {
    mode = 'menu';
    app.quitToMenu();
    hudEl.classList.remove('active');
    renderMenu();
    stack = ['menu'];
    show('menu', { asBack: true });
  }

  function showResults(r) {
    mode = 'menu';
    app.setMode('results');
    ui.classList.remove('playing', 'hudonly');
    scrim.classList.remove('playing');
    hudEl.classList.remove('active');
    noticeEl.classList.remove('pop', 'pop-slow');
    void noticeEl.offsetWidth;
    const el = screenEls.results;
    const mid = el.querySelector('.mid');
    mid.innerHTML = '';
    if (r.kind === 'regatta') {
      el.querySelector('.over').textContent = r.place === 1 ? 'Victory at Zattere Alba' : 'Race over';
      el.querySelector('.mast').innerHTML = `<span class="acc">${ordinal(r.place)}</span><small>/${r.order.length}</small>`;
      const board = h('<div class="board big"></div>');
      r.order.forEach((o, i) => {
        board.appendChild(h(`<div class="brow st${o.isPlayer ? ' me' : ''}">
          <span class="bpos">${i + 1}</span><i class="bbar" style="background:${colorOf(o.name)}"></i>
          <span class="bname">${o.isPlayer ? 'You' : esc(o.name)}</span>
          <span class="bgap">${o.finished && o.finishTime != null ? fmtTime(o.finishTime, true) : 'DNF'}</span>
        </div>`));
      });
      mid.appendChild(board);
    } else {
      el.querySelector('.over').textContent = r.kind === 'complete' ? 'Route complete' : 'Morning lost';
      el.querySelector('.mast').textContent = fmtTime(r.time, true);
      const rating = r.kind !== 'complete' ? 'Unfinished'
        : r.lost === 0 && r.fares === 5 ? 'Perfect morning'
        : r.fares >= 4 ? 'Smooth sailing'
        : 'A rough ride';
      mid.innerHTML = `
        <div class="rows">
          <div class="row st"><span class="k">Fares</span><span class="v acc">${r.fares} / 5 delivered</span></div>
          <div class="row st"><span class="k">Lost</span><span class="v">${r.lost} went ashore</span></div>
          <div class="row st"><span class="k">Bumps</span><span class="v">${r.bumps}</span></div>
          <div class="row st"><span class="k">Rating</span><span class="v">${rating}</span></div>
        </div>`;
    }
    const reward = profiles.award(r);
    if (reward.coins) {
      const box = h('<div class="reward"></div>');
      box.innerHTML = reward.lines.map(([t, c]) => `<div class="row st"><span class="k">${t}</span><span class="v acc">+${coin(c)}</span></div>`).join('')
        + `<div class="row st total"><span class="k">Purse</span><span class="v">${coin(profiles.current.coins)}</span></div>`;
      mid.appendChild(box);
    }
    renderMenu();
    stack = ['results'];
    sel.results = { z: 'acts', i: 0 };
    show('results', { asBack: true });
  }

  // ============================================================= keyboard ==
  addEventListener('keydown', (e) => {
    if (mode === 'hud') {
      if (e.key === 'Escape') pauseGame();
      return;
    }
    if (e.target === nameInput) {
      if (e.key === 'Enter') { e.preventDefault(); submitLogin(); }
      else if (e.key === 'Escape') nameInput.blur();
      else if (e.key === 'ArrowDown') { nameInput.blur(); select('login', 'acts', 0); }
      return;
    }
    const id = current();
    const zl = ZONES[id];
    const cur = sel[id];
    const zi = zl.indexOf(cur.z);
    const k = e.key;
    // typing a letter on the login screen jumps into the name field
    if (id === 'login' && k.length === 1 && /[a-z0-9]/i.test(k) && !e.ctrlKey && !e.metaKey) { nameInput.focus(); return; }
    const walk = (d) => {
      const items = zoneItems(id, cur.z);
      const ni = cur.i + d;
      // multi-zone screens: stepping off the end of a zone moves to the next zone
      if (zl.length > 1 && (ni < 0 || ni >= items.length)) {
        const nzi = zi + Math.sign(d);
        if (nzi < 0 || nzi >= zl.length) return;
        const nz = zl[nzi];
        const n = zoneItems(id, nz).length;
        if (!n) return;
        select(id, nz, d > 0 ? 0 : n - 1);
        return;
      }
      select(id, cur.z, ni);
    };
    if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); walk(1); }
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); walk(-1); }
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ArrowRight' || k === 'd' || k === 'D') {
      e.preventDefault();
      const d = (k === 'ArrowLeft' || k === 'a' || k === 'A') ? -1 : 1;
      if (cur.z === 'rows' && id === 'settings') SETTING_ROWS[cur.i].cycle(d);
      else if (cur.z === 'acts') select(id, 'acts', cur.i + d);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      confirmCurrent();
    } else if (k === 'Escape') {
      if (id === 'pause') resumeGame();
      else if (id !== 'login' && id !== 'menu') goBack();
    }
  });

  // ============================================================== notices ==
  function notice(html, { small = false, slow = false } = {}) {
    noticeEl.innerHTML = html;
    noticeEl.classList.remove('pop', 'pop-slow', 'small');
    void noticeEl.offsetWidth;
    if (small) noticeEl.classList.add('small');
    noticeEl.classList.add(slow ? 'pop-slow' : 'pop');
  }

  const hud = makeHUD(app, colorOf);

  game.on('results', showResults);
  game.on('countdown', (n) => { blip.nav(); notice(`${n}`); });
  game.on('go', () => { blip.go(); notice(`<span class="acc">GO!</span>`); });
  game.on('notice', (n) => {
    if (n.kind === 'bad') { blip.bad(); notice(n.text, { small: true, slow: true }); }
    else if (n.kind === 'good') { blip.good(); notice(n.text, { small: true }); }
    else if (n.kind === 'warn') { blip.bad(); notice(`<span class="acc">${n.text}</span>`, { small: true }); }
    else if (n.text === 'The tide turns') { notice(n.text, { small: true, slow: true }); }
  });

  // open on the login screen
  refreshValues();
  renderLogin();
  show('login', { asBack: true });

  return { notice, hud, enterHud, get mode() { return mode; } };
}

// ================================================================== HUD ====
function makeHUD(app, colorOf) {
  const game = app.game;
  const el = document.getElementById('hud');
  const COURSE_END = 600;
  el.innerHTML = `
    <div class="hud-tl">
      <div class="h-time">0:00.000</div>
      <div class="h-pos"></div>
      <div class="h-sub"></div>
      <div class="board"></div>
    </div>
    <div class="hud-course"><div class="track"></div></div>
    <div class="hud-map"><canvas></canvas><div class="maplab"><span class="mode"></span><span class="dist"></span></div></div>
    <div class="hud-speed"><div class="num">0</div><div class="lab">KNOTS<span class="tide"></span></div></div>
    <div class="hud-kiss">Kiss the dock<div class="barline"><i></i></div></div>
    <div class="hud-rapids">Whitewater<div class="barline"><i></i></div></div>
    <div class="hud-hints"></div>`;

  const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
  const hintsEl = el.querySelector('.hud-hints');
  hintsEl.innerHTML = IS_TOUCH
    ? `<div><b>▲</b> Paddle · <b>▼</b> Brake · <b>◀ ▶</b> Steer · <b>ITEM</b> Power-up</div>`
    : `<div><b>W</b> Paddle · <b>A D</b> Steer · <b>S</b> Brake</div>
       <div><b>Space</b> Push off wall · <b>E</b> Use power-up · <b>Esc</b> Pause</div>
       <div>Hit the <b>?</b> boxes · dodge the <b>rocks</b></div>`;

  const timeEl = el.querySelector('.h-time');
  const posEl = el.querySelector('.h-pos');
  const subEl = el.querySelector('.h-sub');
  const boardEl = el.querySelector('.board');
  const speedEl = el.querySelector('.hud-speed .num');
  const tideEl = el.querySelector('.tide');
  const kissEl = el.querySelector('.hud-kiss');
  const kissBar = kissEl.querySelector('i');
  const rapidsEl = el.querySelector('.hud-rapids');
  const rapidsBar = rapidsEl.querySelector('i');
  const trackEl = el.querySelector('.hud-course .track');
  const mapLabMode = el.querySelector('.maplab .mode');
  const mapLabDist = el.querySelector('.maplab .dist');
  const minimap = makeMinimap(app, el.querySelector('.hud-map canvas'));

  // course strip: rapids bands, bridge ticks, docks, finish flag, racer dots
  const pct = (s) => `${(s / COURSE_END) * 100}%`;
  for (const z of RAPID_ZONES) trackEl.appendChild(h(`<i class="zone" style="left:${pct(z.s - z.len / 2)};width:${pct(z.len)}"></i>`));
  for (const b of BRIDGES) trackEl.appendChild(h(`<i class="bridge" style="left:${pct(b.s)}"></i>`));
  const dockEls = DOCKS.map((d) => { const t = h(`<i class="dock" style="left:${pct(d.s)}"></i>`); trackEl.appendChild(t); return t; });
  trackEl.appendChild(h(`<i class="flag" style="left:${pct(DOCKS[DOCKS.length - 1].s)}"></i>`));
  const fillEl = h('<i class="fill"></i>');
  trackEl.appendChild(fillEl);
  const dots = {};
  const meDot = h('<i class="racer me"></i>');
  trackEl.appendChild(meDot);
  function racerDot(name) {
    if (!dots[name]) { dots[name] = h(`<i class="racer" style="background:${colorOf(name)}"></i>`); trackEl.appendChild(dots[name]); }
    return dots[name];
  }

  let hintsTimer = null;
  function onRunStart(kind) {
    hintsEl.classList.remove('gone');
    clearTimeout(hintsTimer);
    hintsTimer = setTimeout(() => hintsEl.classList.add('gone'), 9000);
    el.classList.toggle('race', kind === 'regatta');
    for (const d of Object.values(dots)) d.style.display = kind === 'regatta' ? '' : 'none';
    minimap.fit();
  }

  game.on('hud', (d) => {
    timeEl.textContent = fmtTime(d.time, true);
    speedEl.textContent = (d.speed * 1.94).toFixed(1);
    tideEl.textContent = d.tideDir > 0 ? ' · Tide ▲' : ' · Tide ▼';
    const meS = d.meS ?? d.progress * COURSE_END;

    if (d.board) {
      posEl.innerHTML = `${ordinal(d.mpOrder)}<small>/${d.mpTotal}</small>`;
      subEl.textContent = 'First to Zattere Alba';
      const me = d.board.find((o) => o.me);
      boardEl.innerHTML = d.board.map((o, i) => {
        const gap = o.me ? '' : o.fin ? 'FIN' : `${o.prog - me.prog >= 0 ? '+' : '−'}${Math.abs(o.prog - me.prog).toFixed(0)} m`;
        return `<div class="brow${o.me ? ' me' : ''}"><span class="bpos">${i + 1}</span><i class="bbar" style="background:${colorOf(o.name)}"></i><span class="bname">${o.me ? 'You' : esc(o.name)}</span><span class="bgap">${gap}</span></div>`;
      }).join('');
      for (const o of d.board) if (!o.me) racerDot(o.name).style.left = pct(Math.min(COURSE_END, o.prog));
      mapLabMode.textContent = 'Race';
    } else {
      posEl.innerHTML = `Fare ${Math.min(d.leg + 1, 5)}<small>/5</small>`;
      subEl.textContent = d.carrying ? `→ ${d.legName}` : `Empty — head for ${d.legName}`;
      const lost = '<i class="on"></i>'.repeat(d.faresLost) + '<i></i>'.repeat(d.maxLost - d.faresLost);
      boardEl.innerHTML = `<div class="lostrow">Fares lost <span class="lostpips">${lost}</span></div>`;
      mapLabMode.textContent = 'Route';
    }
    dockEls.forEach((t, i) => t.classList.toggle('done', !d.board && i <= d.leg));
    meDot.style.left = pct(Math.min(COURSE_END, meS));
    fillEl.style.width = pct(Math.min(COURSE_END, meS));
    mapLabDist.textContent = d.targetS != null ? `${Math.max(0, d.targetS - meS).toFixed(0)} m to ${d.board ? 'finish' : 'dock'}` : '';

    kissEl.classList.toggle('on', d.kiss > 0.02);
    kissBar.style.width = `${Math.min(1, d.kiss) * 100}%`;
    rapidsEl.classList.toggle('on', d.rapids > 0.05);
    rapidsBar.style.width = `${Math.min(1, d.rapids || 0) * 100}%`;
    minimap.draw(d);
  });

  return { onRunStart };
}
