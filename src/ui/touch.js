// On-screen oar controls for coarse-pointer devices (phones/tablets).
// The buttons feed the exact same input surface as the keyboard — W/S/A/D
// held state, Space shove, E item, Esc pause — so gameplay needs no fork.
export function makeTouchControls(app) {
  if (!matchMedia('(pointer: coarse)').matches) return null;
  const game = app.game;
  const el = document.createElement('div');
  el.id = 'touch';
  el.innerHTML = `
    <div class="tc-cluster tc-steer">
      <button class="tc" data-k="a" aria-label="Steer left">◀</button>
      <button class="tc" data-k="d" aria-label="Steer right">▶</button>
    </div>
    <div class="tc-cluster tc-acts">
      <button class="tc tc-small" data-act="shove" aria-label="Shove off a wall">SHOVE</button>
      <button class="tc tc-small" data-act="item" aria-label="Use item">ITEM</button>
    </div>
    <div class="tc-cluster tc-pole">
      <button class="tc" data-k="w" aria-label="Pole forward">▲</button>
      <button class="tc" data-k="s" aria-label="Back-pole / brake">▼</button>
    </div>
    <button class="tc tc-pause" data-act="pause" aria-label="Pause">❚❚</button>
  `;
  document.getElementById('ui').appendChild(el);

  const setDown = (btn, down) => {
    if (btn.dataset.k) game.setKey(btn.dataset.k, down);
    btn.classList.toggle('down', down);
  };
  for (const btn of el.querySelectorAll('.tc')) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch {}
      if (btn.dataset.k) setDown(btn, true);
      else if (btn.dataset.act === 'shove') { game.shove(); btn.classList.add('down'); }
      else if (btn.dataset.act === 'item') { game.useItem(); btn.classList.add('down'); }
      else if (btn.dataset.act === 'pause') {
        dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    });
    const release = () => { setDown(btn, false); };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  return el;
}
