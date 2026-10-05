// バトルの演出（剣の斬撃・じゅもん・敵の攻撃）
// Web Animations API で動かし、終わるまで await できる Promise を返す。
import { sfx } from './sound.js';
import { sleep, rand } from './util.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function layer() { return $('battle-fx'); }

function enemyCenter() {
  const r = $('enemy-icon').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: Math.min(r.width, r.height) };
}

function el(tag, cls, styles = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  Object.assign(e.style, styles);
  layer().appendChild(e);
  return e;
}

function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
}

function fullSvg() {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'fx-svg');
  svg.setAttribute('width', innerWidth);
  svg.setAttribute('height', innerHeight);
  layer().appendChild(svg);
  return svg;
}

const done = (anim, node) => anim.finished.then(() => node.remove()).catch(() => node.remove());

// 角度 θ（0=真上、時計回り）の位置
const polar = (cx, cy, r, deg) => {
  const t = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(t), y: cy - r * Math.cos(t) };
};

const SWORD_SVG = `
<svg viewBox="0 0 36 170" width="36" height="170" aria-hidden="true">
  <defs><linearGradient id="fxBlade" x1="0" x2="1"><stop offset="0" stop-color="#fdfeff"/><stop offset=".5" stop-color="#c9d4e2"/><stop offset="1" stop-color="#8592a6"/></linearGradient></defs>
  <path d="M18 0l7 16v104H11V16z" fill="url(#fxBlade)" stroke="#4b5566" stroke-width="1.5"/>
  <path d="M18 18v98" stroke="#ffffff" stroke-width="1.5" opacity=".8"/>
  <rect x="1" y="118" width="34" height="9" rx="3" fill="#f2c14e" stroke="#7a5418" stroke-width="1.5"/>
  <rect x="13.5" y="127" width="9" height="30" rx="2" fill="#7a3f1d" stroke="#3d1f0c" stroke-width="1.5"/>
  <circle cx="18" cy="161" r="6" fill="#f2c14e" stroke="#7a5418" stroke-width="1.5"/>
</svg>`;

function sparks(x, y, color = '#fff6c8', count = 10) {
  const flash = el('div', 'fx-impact', { left: `${x}px`, top: `${y}px` });
  done(flash.animate([
    { transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
    { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 },
  ], { duration: 260, easing: 'ease-out' }), flash);
  const ring = el('div', 'fx-ring', { left: `${x}px`, top: `${y}px`, borderColor: color });
  done(ring.animate([
    { transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 },
    { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 },
  ], { duration: 350, easing: 'ease-out' }), ring);
  for (let i = 0; i < count; i++) {
    const deg = (360 / count) * i + rand(-10, 10);
    const s = el('div', 'fx-spark', { left: `${x}px`, top: `${y}px`, background: color });
    const d = rand(70, 120);
    done(s.animate([
      { transform: `translate(-50%,-50%) rotate(${deg}deg) translateY(0) scaleY(1)`, opacity: 1 },
      { transform: `translate(-50%,-50%) rotate(${deg}deg) translateY(-${d}px) scaleY(.3)`, opacity: 0 },
    ], { duration: 380, easing: 'ease-out' }), s);
  }
}

// 剣を振りかぶって振り下ろす（手前の右下から、敵を斜めに斬る一人称視点）。
// mirror=true で左下から斬る（X字の2撃目）
async function swing({ mirror = false, color = '#9ee7ff', trail = true, fast = false } = {}) {
  const c = enemyCenter();
  const R = Math.max(130, c.size * 1.1);
  const side = mirror ? -1 : 1;
  const pivot = { x: c.x + side * R * 0.9, y: c.y + R * 1.1 };
  const reach = Math.hypot(R * 0.9, R * 1.1);           // 柄から敵の中心までの距離
  const scale = (reach * 1.12) / 160;                    // 剣先が敵を通りすぎる長さに
  const center = -side * (Math.atan2(0.9, 1.1) * 180) / Math.PI; // 柄から見た敵の方向
  const dur = fast ? 430 : 640;

  const sword = el('div', 'fx-sword', { left: `${pivot.x - 18}px`, top: `${pivot.y - 160}px` });
  sword.innerHTML = SWORD_SVG;
  const k = (deg, sc = scale) => `rotate(${center + deg * side}deg) scale(${sc})`;
  done(sword.animate([
    { transform: k(44, scale * 0.8), opacity: 0, offset: 0 },
    { transform: k(52), opacity: 1, offset: 0.14 },
    { transform: k(64), opacity: 1, offset: 0.42, easing: 'cubic-bezier(.55,0,.85,.55)' },
    { transform: k(-78), opacity: 1, offset: 0.64 },
    { transform: k(-84), opacity: 1, offset: 0.8 },
    { transform: k(-84), opacity: 0, offset: 1 },
  ], { duration: dur, easing: 'linear' }), sword);

  // 振りかぶった瞬間、剣先がきらりと光る
  setTimeout(() => {
    const tip = polar(pivot.x, pivot.y, 150 * scale, center + 64 * side);
    const g = el('div', 'fx-glint', { left: `${tip.x}px`, top: `${tip.y}px` });
    done(g.animate([
      { transform: 'translate(-50%,-50%) scale(.2) rotate(0deg)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.2) rotate(45deg)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%,-50%) scale(.3) rotate(90deg)', opacity: 0 },
    ], { duration: 280 }), g);
  }, dur * 0.28);

  // 振り下ろしに合わせて風切り音と斬撃の軌跡（剣先の通り道＝敵の中心を通る弧）
  await sleep(dur * 0.42);
  sfx.swing();
  if (trail) {
    const svg = fullSvg();
    const a = polar(pivot.x, pivot.y, reach, center + 52 * side);
    const b = polar(pivot.x, pivot.y, reach, center - 62 * side);
    const d = `M${a.x} ${a.y} A${reach} ${reach} 0 0 ${mirror ? 1 : 0} ${b.x} ${b.y}`;
    const glow = svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 30, 'stroke-linecap': 'round', opacity: 0.55 }, svg);
    const core = svgEl('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 11, 'stroke-linecap': 'round' }, svg);
    for (const p of [glow, core]) {
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: dur * 0.22, easing: 'ease-out', fill: 'forwards' });
    }
    done(svg.animate([
      { opacity: 1, transform: 'scale(1)', offset: 0 },
      { opacity: 1, offset: 0.5 },
      { opacity: 0 },
    ], { duration: dur * 0.85 }), svg);
  }
  await sleep(dur * 0.22);
}

// プレイヤーの通常攻撃
export async function slashFx({ crit = false, miss = false } = {}) {
  if (reduceMotion()) return sleep(150);
  lunge();
  if (miss) {
    await swing({ trail: false });
    const icon = $('enemy-icon');
    icon.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-46px)', offset: 0.4 }, { transform: 'translateX(0)' },
    ], { duration: 380, easing: 'ease-out' });
    return sleep(200);
  }
  const c = enemyCenter();
  if (crit) {
    await swing({ color: '#ffd34d', fast: true });
    sparks(c.x, c.y, '#ffe27a', 8);
    await swing({ mirror: true, color: '#ffd34d', fast: true });
    sparks(c.x, c.y, '#ffe27a', 14);
  } else {
    await swing();
    sparks(c.x, c.y);
  }
}

function lunge() {
  const card = document.querySelector('#battle-party .pcard');
  if (!card) return;
  card.animate([
    { transform: 'translateY(0)' }, { transform: 'translateY(-14px) scale(1.04)', offset: 0.35 }, { transform: 'translateY(0)' },
  ], { duration: 420, easing: 'ease-out' });
}

function emojiBurst(ch, n, { radius = 50, size = 44, rise = 30, dur = 650, stagger = 60, x, y } = {}) {
  const c = enemyCenter();
  const cx = x ?? c.x, cy = y ?? c.y;
  const anims = [];
  for (let i = 0; i < n; i++) {
    const e = el('div', 'fx-emoji', {
      left: `${cx + rand(-radius, radius)}px`, top: `${cy + rand(-radius * 0.7, radius * 0.7)}px`, fontSize: `${size}px`,
    });
    e.textContent = ch;
    const a = e.animate([
      { transform: 'translate(-50%,-50%) scale(.2)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.35 },
      { transform: `translate(-50%,-50%) translateY(-${rise}px) scale(1.5)`, opacity: 0 },
    ], { duration: dur, delay: i * stagger, easing: 'ease-out' });
    anims.push(done(a, e));
  }
  return Promise.all(anims);
}

function screenTint(color, dur = 450) {
  const t = el('div', 'fx-tint', { background: color });
  return done(t.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: dur }), t);
}

async function fireFx() {
  sfx.fire();
  screenTint('radial-gradient(circle at 50% 40%, rgba(255,140,40,.45), transparent 60%)', 700);
  await emojiBurst('🔥', 7, { radius: 55 });
}

async function thunderFx() {
  const c = enemyCenter();
  const svg = fullSvg();
  let x = c.x + rand(-30, 30);
  let pts = `${x},0`;
  const steps = 7;
  for (let i = 1; i <= steps; i++) {
    x = i === steps ? c.x : x + rand(-35, 35);
    pts += ` ${x},${(c.y * i) / steps}`;
  }
  svgEl('polyline', { points: pts, fill: 'none', stroke: '#ffe45c', 'stroke-width': 14, 'stroke-linejoin': 'miter', opacity: 0.6 }, svg);
  svgEl('polyline', { points: pts, fill: 'none', stroke: '#ffffff', 'stroke-width': 5, 'stroke-linejoin': 'miter' }, svg);
  sfx.thunder();
  screenTint('rgba(255,250,200,.55)', 450);
  const a = svg.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }, { opacity: 0 }], { duration: 520 });
  await done(a, svg);
  sparks(c.x, c.y, '#fff27a', 12);
}

async function meteoFx() {
  const c = enemyCenter();
  const falls = [];
  for (let i = 0; i < 5; i++) {
    const e = el('div', 'fx-emoji', { left: '0px', top: '0px', fontSize: '46px' });
    const sx = c.x + 180 + i * 30, sy = -80 - i * 20;
    const tx = c.x + rand(-50, 50), ty = c.y + rand(-30, 30);
    const a = e.animate([
      { transform: `translate(${sx}px, ${sy}px) translate(-50%,-50%) rotate(-30deg)`, opacity: 1 },
      { transform: `translate(${tx}px, ${ty}px) translate(-50%,-50%) rotate(-30deg)`, opacity: 1 },
    ], { duration: 420, delay: i * 90, easing: 'ease-in' });
    e.textContent = '☄️';
    falls.push(done(a, e));
  }
  await Promise.all(falls);
  sfx.thunder();
  screenTint('rgba(255,120,60,.5)', 500);
  await emojiBurst('💥', 3, { radius: 30, size: 90, rise: 0, dur: 500, stagger: 70 });
}

// じゅもん（こうげき）
export async function spellFx(id) {
  if (reduceMotion()) return sleep(150);
  if (id === 'fire') return fireFx();
  if (id === 'thunder') return thunderFx();
  if (id === 'meteo') return meteoFx();
  return screenTint('rgba(255,255,255,.6)', 300);
}

// かいふく（ステータスカードの上にきらきら）
export async function healFx(target = 'player') {
  if (reduceMotion()) return sleep(100);
  if (target === 'enemy') return emojiBurst('✨', 5, { radius: 50, size: 30, rise: 40 });
  const card = document.querySelector('#battle-party .pcard');
  if (!card) return null;
  const r = card.getBoundingClientRect();
  card.animate([{ boxShadow: '0 0 0 0 rgba(90,217,138,0)' }, { boxShadow: '0 0 24px 8px rgba(90,217,138,.8)' }, { boxShadow: '0 0 0 0 rgba(90,217,138,0)' }], { duration: 700 });
  return emojiBurst('✨', 6, { x: r.left + r.width / 2, y: r.top + r.height / 2, radius: 60, size: 28, rise: 50, stagger: 50 });
}

// 敵のひっかき（画面に3本の爪あと）
export async function clawFx() {
  if (reduceMotion()) return sleep(100);
  sfx.claw();
  const svg = fullSvg();
  const cx = innerWidth / 2, cy = innerHeight * 0.55;
  for (let i = -1; i <= 1; i++) {
    const x0 = cx - 90 + i * 34, y0 = cy - 110, x1 = cx + 70 + i * 34, y1 = cy + 110;
    const d = `M${x0} ${y0} Q${(x0 + x1) / 2 + 30} ${(y0 + y1) / 2 - 20} ${x1} ${y1}`;
    svgEl('path', { d, stroke: '#ff2020', 'stroke-width': 18, 'stroke-linecap': 'round', fill: 'none', opacity: 0.35 }, svg);
    const p = svgEl('path', { d, stroke: '#ff5a4a', 'stroke-width': 7, 'stroke-linecap': 'round', fill: 'none' }, svg);
    for (const q of [p, p.previousSibling]) {
      const len = q.getTotalLength();
      q.style.strokeDasharray = `${len}`;
      q.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 140, delay: (i + 1) * 40, fill: 'both', easing: 'ease-out' });
    }
  }
  await done(svg.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: 480 }), svg);
}

// 敵のブレス（画面全体に色の波）
export async function breathFx(name) {
  if (reduceMotion()) return sleep(100);
  const color = /つめた|こおり/.test(name) ? '120,220,255' : /やみ/.test(name) ? '160,50,210' : '255,120,30';
  sfx.fire();
  const w = el('div', 'fx-tint', { background: `linear-gradient(rgba(${color},.0), rgba(${color},.75) 40%, rgba(${color},.35))` });
  await done(w.animate([
    { transform: 'translateY(-100%)', opacity: 1 },
    { transform: 'translateY(0)', opacity: 1, offset: 0.55 },
    { transform: 'translateY(10%)', opacity: 0 },
  ], { duration: 700, easing: 'ease-out' }), w);
}
