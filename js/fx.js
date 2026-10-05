// バトルの演出（剣の斬撃・じゅもん・敵の攻撃）
// Web Animations API で動かし、終わるまで await できる Promise を返す。
import { sfx } from './sound.js';
import { sleep, rand } from './util.js';
import * as hero from './hero.js';

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

// 剣の通り道に光る軌跡を描く（中心 (cx,cy)、半径 r、角度 a0→a1）
function trailArc(cx, cy, r, a0, a1, color, dur) {
  const svg = fullSvg();
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const d = `M${p0.x} ${p0.y} A${r} ${r} 0 ${large} ${a1 > a0 ? 1 : 0} ${p1.x} ${p1.y}`;
  const glow = svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 26, 'stroke-linecap': 'round', opacity: 0.55 }, svg);
  const core = svgEl('path', { d, fill: 'none', stroke: '#ffffff', 'stroke-width': 9, 'stroke-linecap': 'round' }, svg);
  for (const p of [glow, core]) {
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: dur, easing: 'ease-in', fill: 'forwards' });
  }
  done(svg.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration: dur + 380 }), svg);
}

// 勇者が剣を振りかぶって (from) から振り下ろす (to)
async function heroSwing({ from = -40, to = 150, color = '#9ee7ff', trail = true, fast = false } = {}) {
  await hero.turnArm(from, fast ? 110 : 190, 'out');
  const sh = hero.heroShoulder();
  // 振りかぶった剣先がきらりと光る
  const tip = polar(sh.x, sh.y, hero.SWORD_REACH, from);
  const gl = el('div', 'fx-glint', { left: `${tip.x}px`, top: `${tip.y}px` });
  done(gl.animate([
    { transform: 'translate(-50%,-50%) scale(.2) rotate(0deg)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(1.2) rotate(45deg)', opacity: 1, offset: 0.4 },
    { transform: 'translate(-50%,-50%) scale(.3) rotate(90deg)', opacity: 0 },
  ], { duration: 260 }), gl);
  await sleep(fast ? 50 : 110);
  sfx.swing();
  const dur = fast ? 90 : 120;
  // 軌跡は勇者の前方（頭の上より前）だけに描く
  const down = to > from;
  const a0 = down ? Math.max(from + 12, 8) : Math.min(from - 12, 140);
  const a1 = down ? to : Math.max(to, 8);
  if (trail) trailArc(sh.x, sh.y, hero.SWORD_REACH * 0.9, a0, a1, color, dur);
  await hero.turnArm(to, dur, 'in');
}

// プレイヤーの通常攻撃：敵のそばへ駆け寄って斬りつけ、元の位置へ戻る
export async function slashFx({ crit = false, miss = false } = {}) {
  const c = enemyCenter();
  if (reduceMotion() || !hero.heroReady()) {
    if (!miss) sparks(c.x, c.y);
    return sleep(150);
  }
  // 剣を前へ水平に出したとき、剣先が敵の中心を少し越える位置まで踏み込む
  const target = { x: c.x - hero.SWORD_REACH * 0.75, y: c.y + c.size * 0.12 };
  hero.turnArm(20, 200);
  await hero.moveHeroTo(target.x, target.y, 230, 22);

  if (miss) {
    $('enemy-icon').animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(54px)', offset: 0.4 }, { transform: 'translateX(0)' },
    ], { duration: 420, easing: 'ease-out' });
    await heroSwing({ trail: false });
  } else if (crit) {
    await heroSwing({ color: '#ffd34d', fast: true });
    sparks(c.x, c.y, '#ffe27a', 8);
    await heroSwing({ from: 150, to: -30, color: '#ffd34d', fast: true }); // 切り返しの2撃目
    sparks(c.x, c.y, '#ffe27a', 14);
  } else {
    await heroSwing();
    sparks(c.x, c.y);
  }
  await sleep(150);
  hero.heroRest();
  await hero.moveHeroHome(260, 16);
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
  await hero.heroCast();
  setTimeout(hero.heroRest, 500);
  if (id === 'fire') return fireFx();
  if (id === 'thunder') return thunderFx();
  if (id === 'meteo') return meteoFx();
  return screenTint('rgba(255,255,255,.6)', 300);
}

// かいふく（ステータスカードの上にきらきら）
export async function healFx(target = 'player') {
  if (reduceMotion()) return sleep(100);
  if (target === 'enemy') return emojiBurst('✨', 5, { radius: 50, size: 30, rise: 40 });
  hero.heroCast().then(() => setTimeout(hero.heroRest, 300));
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

export const showHero = () => hero.showHero(layer());
export const { removeHero, layoutHero, heroHurt, heroVictory, heroDown } = hero;
