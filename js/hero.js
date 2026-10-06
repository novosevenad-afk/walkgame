// バトル画面に立つ人型ロボット「ウォーカー」。敵（絵文字）に合わせて、グラデーションと光沢で立体感を出した SVG で描く。
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
    <linearGradient id="${p}gun" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#d7dde4"/><stop offset=".35" stop-color="#8f99a5"/><stop offset=".8" stop-color="#4c545e"/><stop offset="1" stop-color="#2e333a"/></linearGradient>
    <linearGradient id="${p}gunDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d7681"/><stop offset="1" stop-color="#262a30"/></linearGradient>
    <linearGradient id="${p}red" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#e4646a"/><stop offset=".45" stop-color="#a8323a"/><stop offset="1" stop-color="#561418"/></linearGradient>
    <linearGradient id="${p}visor" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b1520"/><stop offset=".6" stop-color="#123a52"/><stop offset="1" stop-color="#0b1520"/></linearGradient>
    <radialGradient id="${p}cyan"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#7ff0ff"/><stop offset="1" stop-color="rgba(40,200,255,0)"/></radialGradient>
    <radialGradient id="${p}flame"><stop offset="0" stop-color="#fff3c4"/><stop offset=".4" stop-color="#ffb02e"/><stop offset="1" stop-color="rgba(255,90,20,0)"/></radialGradient>
    <linearGradient id="${p}heat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff4a1c"/><stop offset=".3" stop-color="#ffb347"/><stop offset=".5" stop-color="#fff7dc"/><stop offset=".7" stop-color="#ffb347"/><stop offset="1" stop-color="#ff4a1c"/></linearGradient>
    <radialGradient id="${p}shadow"><stop offset="0" stop-color="rgba(0,0,0,.5)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>
  </defs>`;
}

// 体（腕以外）：人型ロボット「ウォーカー」
function body(p) {
  return `
  <ellipse cx="98" cy="232" rx="58" ry="9" fill="url(#${p}shadow)"/>
  <ellipse class="hero-thrust" cx="64" cy="186" rx="9" ry="14" fill="url(#${p}flame)"/>
  <ellipse class="hero-thrust" cx="80" cy="188" rx="8" ry="12" fill="url(#${p}flame)"/>
  <rect x="52" y="118" width="38" height="58" rx="9" fill="url(#${p}gunDark)" stroke="${LINE}" stroke-width="2.5"/>
  <rect x="56" y="168" width="14" height="12" rx="3" fill="#2a2e34" stroke="${LINE}" stroke-width="2"/>
  <rect x="73" y="170" width="13" height="11" rx="3" fill="#2a2e34" stroke="${LINE}" stroke-width="2"/>
  <path d="M58 128 h26 M58 138 h26" stroke="#ff9a2e" stroke-width="2.5" opacity=".8"/>
  <rect x="72" y="178" width="24" height="38" rx="7" fill="url(#${p}gunDark)" stroke="${LINE}" stroke-width="2"/>
  <circle cx="84" cy="196" r="6" fill="url(#${p}gun)" stroke="${LINE}" stroke-width="1.5"/>
  <path d="M64 216 Q64 208 72 208 L96 208 Q102 208 102 216 L102 228 L62 228 Z" fill="url(#${p}red)" stroke="${LINE}" stroke-width="2"/>
  <rect x="100" y="178" width="24" height="38" rx="7" fill="url(#${p}gun)" stroke="${LINE}" stroke-width="2"/>
  <circle cx="112" cy="196" r="6.5" fill="url(#${p}red)" stroke="${LINE}" stroke-width="1.5"/>
  <path d="M96 216 Q96 206 106 206 L124 206 Q140 208 140 220 L140 228 L96 228 Z" fill="url(#${p}red)" stroke="${LINE}" stroke-width="2"/>
  <path d="M104 211 Q118 209 132 214" fill="none" stroke="#ff9aa0" stroke-width="2.5" opacity=".6" stroke-linecap="round"/>
  <rect x="70" y="170" width="64" height="14" rx="5" fill="url(#${p}gunDark)" stroke="${LINE}" stroke-width="2"/>
  <path d="M74 177 h10 M90 177 h10" stroke="#ffcc33" stroke-width="3" stroke-dasharray="4 3"/>
  <path d="M70 126 Q102 114 132 126 L136 172 Q102 182 68 172 Z" fill="url(#${p}red)" stroke="${LINE}" stroke-width="2.5"/>
  <path d="M84 132 Q104 124 124 132 L122 160 Q103 168 86 160 Z" fill="url(#${p}gun)" stroke="${LINE}" stroke-width="2"/>
  <circle cx="104" cy="146" r="9" fill="#0d2230" stroke="${LINE}" stroke-width="2"/>
  <circle class="hero-core" cx="104" cy="146" r="9" fill="url(#${p}cyan)"/>
  <ellipse cx="90" cy="134" rx="7" ry="3" fill="#fff" opacity=".6"/>
  <rect x="94" y="108" width="20" height="16" rx="4" fill="url(#${p}gunDark)" stroke="${LINE}" stroke-width="2"/>
  <path d="M78 42 L72 16" stroke="#9aa3ad" stroke-width="3" stroke-linecap="round"/>
  <circle class="hero-blink" cx="72" cy="14" r="4" fill="#ff4d4d" stroke="${LINE}" stroke-width="1.5"/>
  <rect x="64" y="38" width="86" height="76" rx="28" fill="url(#${p}gun)" stroke="${LINE}" stroke-width="2.5"/>
  <path d="M70 58 Q106 30 146 54 L146 62 Q106 40 70 66 Z" fill="url(#${p}red)" stroke="${LINE}" stroke-width="2"/>
  <ellipse cx="90" cy="50" rx="13" ry="5" fill="#fff" opacity=".7" transform="rotate(-15 90 50)"/>
  <circle cx="74" cy="84" r="13" fill="url(#${p}gunDark)" stroke="${LINE}" stroke-width="2"/>
  <circle cx="74" cy="84" r="6" fill="#ff9a2e" stroke="${LINE}" stroke-width="1.5"/>
  <rect x="94" y="68" width="58" height="22" rx="11" fill="url(#${p}visor)" stroke="${LINE}" stroke-width="2.5"/>
  <ellipse class="hero-eye" cx="134" cy="79" rx="12" ry="6.5" fill="url(#${p}cyan)"/>
  <rect x="104" y="72" width="18" height="3" rx="1.5" fill="#7ff0ff" opacity=".45"/>
  <path d="M110 98 h28 M112 104 h24" stroke="#2e333a" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>`;
}

// ヒートブレードを持つ機械の腕（真上を向いた状態。肩 SHOULDER を中心に回す）
function arm(p) {
  return `
  <rect x="101" y="104" width="18" height="30" rx="6" fill="url(#${p}gunDark)" stroke="${LINE}" stroke-width="2"/>
  <path d="M101 116 h18" stroke="#ff9a2e" stroke-width="2"/>
  <rect x="106" y="80" width="8" height="28" rx="2" fill="#2a2e34" stroke="${LINE}" stroke-width="1.5"/>
  <path d="M110 6 L118 22 L118 84 L102 84 L102 22 Z" fill="rgba(255,110,40,.45)" transform="translate(110 45) scale(1.35 1.04) translate(-110 -45)"/>
  <path d="M104 84 L104 24 L110 10 L116 24 L116 84 Z" fill="url(#${p}heat)" stroke="#8a2a10" stroke-width="1.8" stroke-linejoin="round"/>
  <rect x="93" y="80" width="34" height="9" rx="3" fill="url(#${p}gun)" stroke="${LINE}" stroke-width="2"/>
  <circle cx="110" cy="84.5" r="3" fill="#7ff0ff" stroke="${LINE}" stroke-width="1"/>
  <rect x="99" y="92" width="22" height="18" rx="6" fill="url(#${p}gun)" stroke="${LINE}" stroke-width="2"/>
  <path d="M103 97 h14 M103 102 h14" stroke="#4c545e" stroke-width="2"/>`;
}

function shoulderPad(p) {
  return `
  <path d="M92 126 Q92 112 110 112 Q130 112 130 128 L128 140 L94 140 Z" fill="url(#${p}red)" stroke="${LINE}" stroke-width="2.5"/>
  <circle cx="112" cy="128" r="3.5" fill="url(#${p}gun)" stroke="${LINE}" stroke-width="1"/>
  <ellipse cx="104" cy="118" rx="7" ry="3" fill="#fff" opacity=".55"/>`;
}

let uid = 0;

// ステータスカード用の顔アイコン（同じ絵の頭の部分を切り出す）
export function heroPortraitSVG() {
  const p = `hp${uid++}`;
  return `<svg viewBox="58 8 100 104" aria-hidden="true">${defs(p)}${body(p)}</svg>`;
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
