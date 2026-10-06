// バトル画面に立つ勇者。敵（絵文字）に合わせて、グラデーションと光沢で立体感を出した SVG イラストで描く。
// 体と「剣を持つ腕」を別のパーツにして、腕を肩で回して剣を振る。
// 角度は 0=真上、時計回りがプラス（右向きの勇者なので 90=前へ水平）。

const VB_W = 200, VB_H = 240;      // SVG の座標系
const SCALE = 0.74;                // 画面に出す大きさ（CSS px / SVG 単位）
const SHOULDER = { x: 110, y: 130 };
const FEET_Y = 232;
const TIP_Y = 10;                  // 剣先（腕が真上のとき）
export const SWORD_REACH = (SHOULDER.y - TIP_Y) * SCALE; // 肩から剣先までの長さ（CSS px）

const LINE = 'rgba(45,28,22,.55)'; // 輪郭線

function defs(p) {
  return `
  <defs>
    <radialGradient id="${p}skin" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff3e4"/><stop offset=".55" stop-color="#ffd3aa"/><stop offset="1" stop-color="#e5a173"/></radialGradient>
    <linearGradient id="${p}hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8642f"/><stop offset="1" stop-color="#5b2f14"/></linearGradient>
    <linearGradient id="${p}steel" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#d9e1ec"/><stop offset=".75" stop-color="#93a1b6"/><stop offset="1" stop-color="#5f6b80"/></linearGradient>
    <linearGradient id="${p}gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4b8"/><stop offset=".45" stop-color="#f5c542"/><stop offset="1" stop-color="#b07818"/></linearGradient>
    <linearGradient id="${p}tunic" x1="0" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#7cb0ff"/><stop offset=".45" stop-color="#3b70da"/><stop offset="1" stop-color="#1c3f8a"/></linearGradient>
    <linearGradient id="${p}cape" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef5a6a"/><stop offset=".5" stop-color="#c72f40"/><stop offset="1" stop-color="#7d1420"/></linearGradient>
    <linearGradient id="${p}boot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b47a40"/><stop offset="1" stop-color="#5a3412"/></linearGradient>
    <linearGradient id="${p}pants" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5f8e"/><stop offset="1" stop-color="#2a2d4c"/></linearGradient>
    <linearGradient id="${p}blade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8592a8"/><stop offset=".42" stop-color="#ffffff"/><stop offset=".58" stop-color="#cfd8e6"/><stop offset="1" stop-color="#717d92"/></linearGradient>
    <radialGradient id="${p}shadow"><stop offset="0" stop-color="rgba(0,0,0,.45)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>
  </defs>`;
}

// 体（腕以外）
function body(p) {
  return `
  <ellipse cx="98" cy="232" rx="56" ry="9" fill="url(#${p}shadow)"/>
  <path d="M80 122 C56 140 40 178 32 222 Q62 234 94 222 C86 190 92 156 106 126 Z" fill="url(#${p}cape)" stroke="${LINE}" stroke-width="2.5"/>
  <path d="M46 196 Q60 204 88 198" fill="none" stroke="#ff8f9b" stroke-width="3" opacity=".5" stroke-linecap="round"/>
  <rect x="72" y="178" width="21" height="40" rx="9" fill="url(#${p}pants)" stroke="${LINE}" stroke-width="2"/>
  <rect x="66" y="208" width="32" height="20" rx="9" fill="url(#${p}boot)" stroke="${LINE}" stroke-width="2"/>
  <rect x="99" y="178" width="21" height="40" rx="9" fill="url(#${p}pants)" stroke="${LINE}" stroke-width="2"/>
  <path d="M97 212 Q97 206 104 206 L120 206 Q136 208 136 220 Q136 228 128 228 L100 228 Q96 228 97 220 Z" fill="url(#${p}boot)" stroke="${LINE}" stroke-width="2"/>
  <path d="M104 210 Q116 208 128 214" fill="none" stroke="#e8b47a" stroke-width="2.5" opacity=".7" stroke-linecap="round"/>
  <path d="M74 128 Q101 114 128 128 L132 184 Q102 196 70 184 Z" fill="url(#${p}tunic)" stroke="${LINE}" stroke-width="2.5"/>
  <path d="M70 176 L132 176 L139 200 Q102 212 63 200 Z" fill="url(#${p}tunic)" stroke="${LINE}" stroke-width="2.5"/>
  <path d="M70 196 Q102 206 136 196" fill="none" stroke="#1a3570" stroke-width="2" opacity=".6"/>
  <rect x="69" y="168" width="64" height="10" rx="4" fill="url(#${p}boot)" stroke="${LINE}" stroke-width="2"/>
  <rect x="104" y="165" width="14" height="16" rx="3" fill="url(#${p}gold)" stroke="${LINE}" stroke-width="2"/>
  <path d="M79 132 Q103 122 126 132 L123 156 Q102 166 82 156 Z" fill="url(#${p}steel)" stroke="${LINE}" stroke-width="2.5"/>
  <ellipse cx="94" cy="136" rx="9" ry="4" fill="#fff" opacity=".7"/>
  <path d="M60 80 Q52 48 76 34 Q100 20 126 32 Q146 44 142 74 L134 98 Q118 114 96 114 Q66 112 60 80 Z" fill="url(#${p}hair)" stroke="${LINE}" stroke-width="2.5"/>
  <path d="M60 80 L48 92 L64 92 Z M62 96 L52 108 L70 104 Z" fill="url(#${p}hair)" stroke="${LINE}" stroke-width="2"/>
  <ellipse cx="108" cy="82" rx="35" ry="34" fill="url(#${p}skin)" stroke="${LINE}" stroke-width="2.5"/>
  <ellipse cx="80" cy="86" rx="6.5" ry="8.5" fill="url(#${p}skin)" stroke="${LINE}" stroke-width="2"/>
  <path d="M76 66 Q98 46 136 58 L132 72 Q124 62 116 72 Q108 60 98 72 Q90 62 80 74 Z" fill="url(#${p}hair)" stroke="${LINE}" stroke-width="2"/>
  <path d="M66 68 Q66 26 108 24 Q148 26 148 66 Q140 58 132 56 L82 56 Q72 58 66 68 Z" fill="url(#${p}steel)" stroke="${LINE}" stroke-width="2.5"/>
  <path d="M63 68 Q106 46 150 66 L148 75 Q106 56 65 77 Z" fill="url(#${p}gold)" stroke="${LINE}" stroke-width="2"/>
  <path d="M104 27 Q106 8 120 2 Q113 15 116 27 Z" fill="url(#${p}gold)" stroke="${LINE}" stroke-width="2"/>
  <circle cx="124" cy="60" r="4.5" fill="#43b8ff" stroke="${LINE}" stroke-width="1.5"/>
  <circle cx="122.5" cy="58.5" r="1.4" fill="#fff"/>
  <ellipse cx="94" cy="36" rx="14" ry="6" fill="#fff" opacity=".75" transform="rotate(-18 94 36)"/>
  <path d="M68 72 Q63 94 74 106 L82 101 Q75 88 78 74 Z" fill="url(#${p}steel)" stroke="${LINE}" stroke-width="2"/>
  <path d="M110 76 q6 -4 12 0 M131 74 q4 -3 9 0" fill="none" stroke="#5b2f14" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="117" cy="88" rx="5.2" ry="7.5" fill="#2b2240"/>
  <ellipse cx="136" cy="86" rx="4.2" ry="6.5" fill="#2b2240"/>
  <circle cx="118.6" cy="85" r="2" fill="#fff"/>
  <circle cx="137.3" cy="83.2" r="1.6" fill="#fff"/>
  <ellipse cx="112" cy="100" rx="6" ry="3.4" fill="#ff8080" opacity=".45"/>
  <ellipse cx="140" cy="97" rx="3.5" ry="2.6" fill="#ff8080" opacity=".4"/>
  <path d="M143 89 q3.5 3 0.5 6" fill="none" stroke="rgba(170,95,60,.65)" stroke-width="2" stroke-linecap="round"/>
  <path d="M123 104 Q129 109 135 103" fill="none" stroke="#a5453a" stroke-width="2.6" stroke-linecap="round"/>`;
}

// 剣を持つ腕（真上を向いた状態。肩 SHOULDER を中心に回す）
function arm(p) {
  return `
  <rect x="102" y="104" width="16" height="30" rx="7" fill="url(#${p}tunic)" stroke="${LINE}" stroke-width="2"/>
  <rect x="106" y="80" width="8" height="30" rx="3" fill="#6b3a1c" stroke="${LINE}" stroke-width="1.5"/>
  <path d="M104 84 L104 24 L110 10 L116 24 L116 84 Z" fill="url(#${p}blade)" stroke="#4b5566" stroke-width="2" stroke-linejoin="round"/>
  <path d="M110 18 L110 80" stroke="#ffffff" stroke-width="1.6" opacity=".85"/>
  <rect x="93" y="80" width="34" height="9" rx="4.5" fill="url(#${p}gold)" stroke="${LINE}" stroke-width="2"/>
  <circle cx="110" cy="84.5" r="3" fill="#ff4d5e" stroke="${LINE}" stroke-width="1"/>
  <circle cx="110" cy="101" r="10" fill="url(#${p}boot)" stroke="${LINE}" stroke-width="2"/>
  <ellipse cx="106" cy="97" rx="3.5" ry="2.2" fill="#f0c48e" opacity=".8"/>`;
}

function shoulderPad(p) {
  return `
  <ellipse cx="110" cy="128" rx="17" ry="12" fill="url(#${p}steel)" stroke="${LINE}" stroke-width="2.5"/>
  <ellipse cx="105" cy="123" rx="6" ry="3" fill="#fff" opacity=".75"/>`;
}

let uid = 0;

// ステータスカード用の顔アイコン（同じ絵の頭の部分を切り出す）
export function heroPortraitSVG() {
  const p = `hp${uid++}`;
  return `<svg viewBox="58 2 94 100" aria-hidden="true">${defs(p)}${body(p)}</svg>`;
}

let wrap = null;
let armEl = null;
const READY = 80;           // かまえ（剣を前へ向ける。顔にかからない角度）
let angle = READY;
let home = { x: 0, y: 0 };
let off = { x: 0, y: 0 };   // 立ち位置からのずれ

function draw() {
  armEl.setAttribute('transform', `rotate(${angle} ${SHOULDER.x} ${SHOULDER.y})`);
}

const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
};

// 腕の角度をなめらかに変える
export function turnArm(to, dur, curve = 'out') {
  const from = angle;
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      angle = from + (to - from) * ease[curve](k);
      if (armEl) draw();
      if (k < 1 && armEl) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

// 肩の位置（画面座標）に勇者を置く
function place(x, y) {
  wrap.style.left = `${x - SHOULDER.x * SCALE}px`;
  wrap.style.top = `${y - SHOULDER.y * SCALE}px`;
}

// バトル開始時：フィールドの左下に立たせる
export function showHero(layer) {
  removeHero();
  const p = `hb${uid++}`;
  wrap = document.createElement('div');
  wrap.className = 'hero';
  wrap.innerHTML = `
    <svg viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W * SCALE}" height="${VB_H * SCALE}" overflow="visible" aria-hidden="true">
      ${defs(p)}${body(p)}<g class="hero-arm">${arm(p)}</g>${shoulderPad(p)}
    </svg>`;
  armEl = wrap.querySelector('.hero-arm');
  layer.appendChild(wrap);
  angle = READY;
  off = { x: 0, y: 0 };
  layoutHero();
  draw();
}

// 立ち位置を画面の大きさに合わせる（足元がフィールドの下端あたり）
export function layoutHero() {
  if (!wrap) return;
  const field = document.getElementById('battle-field').getBoundingClientRect();
  const feet = field.bottom - 6;
  home = { x: Math.max(70, innerWidth * 0.2), y: feet - (FEET_Y - SHOULDER.y) * SCALE };
  place(home.x, home.y);
}

export function removeHero() {
  if (wrap) wrap.remove();
  wrap = null;
  armEl = null;
}

export function heroReady() { return !!wrap; }

// 肩が画面上の (x, y) に来るように移動する（hop で跳ねる高さ）
export function moveHeroTo(x, y, dur, hop = 0) {
  const dx = x - home.x, dy = y - home.y;
  const a = wrap.animate([
    { transform: `translate(${off.x}px, ${off.y}px)` },
    { transform: `translate(${(off.x + dx) / 2}px, ${(off.y + dy) / 2 - hop}px)` },
    { transform: `translate(${dx}px, ${dy}px)` },
  ], { duration: dur, easing: 'ease-in-out', fill: 'forwards' });
  off = { x: dx, y: dy };
  return a.finished;
}

export function moveHeroHome(dur, hop = 0) { return moveHeroTo(home.x, home.y, dur, hop); }

// 今の肩の位置（画面座標）
export function heroShoulder() { return { x: home.x + off.x, y: home.y + off.y }; }

// じゅもんを唱えるときのポーズ（剣を天にかかげて光る）
export async function heroCast() {
  if (!wrap) return;
  wrap.animate([
    { filter: 'drop-shadow(0 0 0 rgba(160,220,255,0))' },
    { filter: 'drop-shadow(0 0 14px rgba(160,220,255,1))' },
    { filter: 'drop-shadow(0 0 0 rgba(160,220,255,0))' },
  ], { duration: 700 });
  await turnArm(-4, 220);
}

export function heroRest() { if (wrap) turnArm(READY, 260); }

export function heroHurt() {
  if (!wrap) return;
  wrap.animate([
    { filter: 'none', translate: '0 0' },
    { filter: 'brightness(2.2) saturate(0)', translate: '-10px 0' },
    { filter: 'none', translate: '-4px 0' },
    { filter: 'brightness(2.2) saturate(0)', translate: '-8px 0' },
    { filter: 'none', translate: '0 0' },
  ], { duration: 360 });
}

export async function heroVictory() {
  if (!wrap) return;
  turnArm(-8, 250);
  await wrap.animate([
    { translate: '0 0' }, { translate: '0 -26px', offset: 0.4 }, { translate: '0 0' },
  ], { duration: 520, easing: 'ease-out' }).finished;
}

export function heroDown() {
  if (!wrap) return;
  turnArm(120, 400);
  wrap.style.transformOrigin = `${100 * SCALE}px ${FEET_Y * SCALE}px`;
  wrap.animate([
    { rotate: '0deg', opacity: 1 }, { rotate: '-80deg', opacity: 0.6 },
  ], { duration: 600, fill: 'forwards', easing: 'ease-in' });
}
