// バトル画面に立つ勇者（ドット絵）。体と「剣を持つ腕」を別に描き、腕を肩で回して剣を振る。
// 角度は 0=真上、時計回りがプラス（右向きの勇者なので 90=前へ水平）。

const PX = 4;            // 1ドットの大きさ（CSS px）
const CW = 72, CH = 96;  // 低解像度キャンバスの大きさ
const BODY_X = 20, BODY_Y = 48;      // 体スプライトの左上
const SHOULDER = { x: 29, y: 57 };   // 腕を回す中心（キャンバス座標）

const COLORS = {
  o: '#1a1020', h: '#b9c4d4', H: '#7a879c', y: '#f5c542', s: '#f2c79b', b: '#7a4520', e: '#1a1a2a',
  c: '#2f5fb3', C: '#1f3f80', r: '#c0303a', R: '#7e1c24', a: '#dfe6ef', l: '#3a2a1e', k: '#5a3a1a',
  w: '#f4f7fc', W: '#a3afc2', g: '#7a3f1d',
};

// 右を向いた勇者の体（腕なし）16x22
const BODY = [
  '.....hhhh.......',
  '...hhhhhhhh.....',
  '..hhhhhhhhyh....',
  '..Hhhhhhhhhh....',
  '..Hbbbbbsss.....',
  '..bbbbbssess....',
  '..bbbbsssss.....',
  '...bbbssss......',
  '....rrsss.......',
  '...rraaaaa......',
  '..rrrcccccc.....',
  '..rrrcccccC.....',
  '.rrrrcyyycC.....',
  '.rrrrccccCC.....',
  '.rrrRccccCC.....',
  'rrrRR.cc.cc.....',
  'rrRR..ll..ll....',
  'rRR...ll..ll....',
  '.R....ll...ll...',
  '......ll...ll...',
  '.....kkk...kkk..',
  '.....kkk...kkkk.',
].map((r) => r.padEnd(16, '.'));

// 剣を持つ腕（上向き）。下端中央 (3,25) が肩
const ARM = [
  '...w...',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  '..wwW..',
  'yyyyyyy',
  '...g...',
  '...g...',
  '..sss..',
  '..sss..',
  '..ccc..',
  '..cCc..',
  '..cCc..',
  '..ccc..',
];
const ARM_PIVOT = { x: 3.5, y: 25.5 };
export const SWORD_REACH = 24 * PX; // 肩から剣先までの長さ（CSS px）

function spriteCanvas(rows) {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!COLORS[ch]) return;
    g.fillStyle = COLORS[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return c;
}

let bodyImg = null;
let armImg = null;
let wrap = null;
let canvas = null;
let g = null;
let angle = 45;
let home = { x: 0, y: 0 };
let off = { x: 0, y: 0 };   // 立ち位置からのずれ

function draw() {
  g.clearRect(0, 0, CW, CH);
  g.drawImage(bodyImg, BODY_X, BODY_Y);
  g.save();
  g.translate(SHOULDER.x, SHOULDER.y);
  g.rotate((angle * Math.PI) / 180);
  g.drawImage(armImg, -ARM_PIVOT.x, -ARM_PIVOT.y);
  g.restore();
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
      draw();
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

// 肩の位置（画面座標）に勇者を置く
function place(x, y) {
  wrap.style.left = `${x - SHOULDER.x * PX}px`;
  wrap.style.top = `${y - SHOULDER.y * PX}px`;
}

// バトル開始時：フィールドの左下に立たせる
export function showHero(layer) {
  if (!bodyImg) { bodyImg = spriteCanvas(BODY); armImg = spriteCanvas(ARM); }
  removeHero();
  wrap = document.createElement('div');
  wrap.className = 'hero';
  canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  canvas.style.width = `${CW * PX}px`;
  canvas.style.height = `${CH * PX}px`;
  g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  wrap.appendChild(canvas);
  layer.appendChild(wrap);
  angle = 45;
  off = { x: 0, y: 0 };
  layoutHero();
  draw();
}

// 立ち位置を画面の大きさに合わせる（足元がフィールドの下端あたり）
export function layoutHero() {
  if (!wrap) return;
  const field = document.getElementById('battle-field').getBoundingClientRect();
  const feet = field.bottom - 8;
  home = { x: Math.max(70, innerWidth * 0.2), y: feet - (BODY_Y + BODY.length - SHOULDER.y) * PX };
  place(home.x, home.y);
}

export function removeHero() {
  if (wrap) wrap.remove();
  wrap = null;
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

export function heroRest() { if (wrap) turnArm(45, 260); }

export function heroHurt() {
  if (!wrap) return;
  wrap.animate([
    { filter: 'none', translate: '0 0' },
    { filter: 'brightness(3) saturate(0)', translate: '-10px 0' },
    { filter: 'none', translate: '-4px 0' },
    { filter: 'brightness(3) saturate(0)', translate: '-8px 0' },
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
  wrap.style.transformOrigin = `${(BODY_X + 8) * PX}px ${(BODY_Y + BODY.length) * PX}px`;
  wrap.animate([
    { rotate: '0deg', opacity: 1 }, { rotate: '-80deg', opacity: 0.6 },
  ], { duration: 600, fill: 'forwards', easing: 'ease-in' });
}
