// CANAL RUSH — brand: the game's name, tagline and emblem in one place.
// To rename the game, change NAME (and the wordmark in index.html's loader).
export const NAME = { top: 'Canal', bottom: 'Rush' };
export const FULL_NAME = `${NAME.top} ${NAME.bottom}`;
export const TAGLINE = 'Kayak racing on the canals of Venice';

// emblem: a round dawn-coral badge with a bridge arch over rippling water
export const LOGO_SVG = `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="30" fill="#ff7a59"/>
  <circle cx="32" cy="32" r="30" fill="none" stroke="#f6efe4" stroke-width="2.5" opacity=".9"/>
  <circle cx="44" cy="20" r="6" fill="#ffd3a1"/>
  <path d="M10 36 H54 V40 H48 C47 31 41 26 32 26 C23 26 17 31 16 40 H10 Z" fill="#f6efe4"/>
  <path d="M12 46 q5 -3 10 0 t10 0 t10 0 t10 0" fill="none" stroke="#0e2a31" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M17 52 q5 -3 10 0 t10 0 t10 0" fill="none" stroke="#0e2a31" stroke-width="2.6" stroke-linecap="round" opacity=".6"/>
</svg>`;

export function logoHTML(cls = '') {
  return `<div class="brand ${cls}">${LOGO_SVG}<div class="word"><span class="w1">${NAME.top}</span><span class="w2">${NAME.bottom}</span></div></div>`;
}
