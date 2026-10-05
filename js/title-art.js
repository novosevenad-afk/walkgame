// タイトル画面の背景ドット絵（夕焼けの城とドラゴン、崖の上の勇者）
// 低解像度のキャンバスに描いて CSS で拡大し、ドット感を出す。
import { seededRng } from './util.js';

// 絵の基準は幅160の縦長。横長の画面では左右に景色を広げ、中央にそろえる
const BASE_W = 160;
const H = 300;
let W = BASE_W;
let OX = 0;
const HORIZON = 186;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const C = {
  far: hex('#4a2a6e'),
  farRim: hex('#7a3f7e'),
  mid: hex('#2c1a4a'),
  midRim: hex('#5a2f5e'),
  ground: hex('#140b24'),
  groundDeep: hex('#07040e'),
  path: hex('#2a1c3c'),
  castle: hex('#120a22'),
  window: hex('#ffcf5a'),
  cliff: hex('#05030a'),
  cliffRim: hex('#4a2850'),
  moon: hex('#fff1c4'),
  moonShade: hex('#e8cf96'),
};

// 空のグラデーション（上から下へ）
const SKY = [
  [0, hex('#0a0820')],
  [0.35, hex('#1c1446')],
  [0.62, hex('#4a1f5e')],
  [0.82, hex('#a8395a')],
  [0.94, hex('#ec7a3c')],
  [1, hex('#ffc35c')],
];

// 4x4 ベイヤー行列（色の境目をドットで混ぜる）
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)];

// 勇者（左を向いて剣を掲げる）。k=影 c=マント w=刃 y=つば
const HERO = [
  '.........w....',
  '.........w....',
  '.........w....',
  '.........w....',
  '.........w....',
  '.........w....',
  '.........w....',
  '........yyy...',
  '.........k....',
  '........kk....',
  '....kkk.kk....',
  '...kkkkkk.....',
  '...kkkkkk.....',
  '....kkkkc.....',
  '...kkkkkcc....',
  '..kkkkkkccc...',
  '..kkkkkkcccc..',
  '...kkkkkccccc.',
  '...kkkkk.cccc.',
  '...kkkkk..ccc.',
  '...kk.kk...cc.',
  '...kk.kk......',
  '...kk.kk......',
  '..kkk.kkk.....',
];
// マントがなびくもう1コマ（下半分のマントを1ドット後ろへ）
const HERO2 = HERO.map((row, i) => {
  if (i < 15) return row;
  const out = Array(row.length).fill('.');
  [...row].forEach((ch, j) => {
    if (ch === 'c') { if (j + 1 < row.length) out[j + 1] = 'c'; }
    else if (ch !== '.') out[j] = ch;
  });
  return out.join('');
});

const DRAGON = [
  [
    '.......k........k...',
    '......kk.......kk...',
    '.....kkk......kkk...',
    '....kkkk.....kkkk...',
    'kk.kkkkkkkkkkkkkk...',
    '.kkkkkkkkkkkkkkkkkkk',
    '..k.kkkkkkkkkk....kk',
    '.......kk..kk......k',
  ],
  [
    '....................',
    '....................',
    'kk..................',
    '.kkkkkkkkkkkkkkkkk..',
    '..kkkkkkkkkkkkkkkkkk',
    '....kkkkk....kkkk..k',
    '.....kkk......kkk...',
    '......kk.......kk...',
  ],
];

function skyColor(y, x) {
  const t = y / HORIZON;
  let i = 0;
  while (i < SKY.length - 2 && t > SKY[i + 1][0]) i++;
  const [t0, c0] = SKY[i];
  const [t1, c1] = SKY[i + 1];
  const k = (t - t0) / (t1 - t0);
  return k > bayer(x, y) ? c1 : c0;
}

function farHeight(x) {
  return 150 + 12 * Math.sin(x * 0.07 + 1) + 7 * Math.sin(x * 0.19 + 2) + 3 * Math.sin(x * 0.53);
}
function midHeight(x) {
  const ridge = 172 + 6 * Math.sin(x * 0.09 + 4) + 3 * Math.sin(x * 0.27);
  const castleHill = 166 - 12 * Math.exp(-(((x - 45) / 16) ** 2));
  return Math.min(ridge, castleHill);
}
function cliffTop(x) {
  if (x < 84) return H + 1;
  return 206 - (x - 84) * 0.22 + 2 * Math.sin(x * 0.8) + (x < 90 ? (90 - x) * 2.2 : 0);
}

// 動かない部分を1回だけ描く
function drawStatic() {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  // x は絵の座標（0〜159 が基準の範囲）。画面上は OX だけずらす
  const put = (sx, y, c) => {
    const x = sx + OX;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  };

  // 空
  for (let y = 0; y < H; y++) for (let x = -OX; x < W - OX; x++) put(x, y, skyColor(Math.min(y, HORIZON), x));

  // 月とまわりの光
  const mx = 90, my = 122, mr = 13;
  for (let y = my - 26; y <= my + 26; y++) {
    for (let x = mx - 26; x <= mx + 26; x++) {
      const r = Math.hypot(x - mx, y - my);
      if (r <= mr) {
        const crater = Math.hypot(x - mx - 4, y - my + 3) < 3 || Math.hypot(x - mx + 5, y - my - 4) < 2 || Math.hypot(x - mx + 1, y - my - 7) < 1.5;
        put(x, y, crater || x - mx > 8 - (y - my) * 0.2 ? C.moonShade : C.moon);
      } else if (r < mr + 9 && (1 - (r - mr) / 9) * 0.45 > bayer(x, y)) {
        put(x, y, hex('#c05a6a'));
      }
    }
  }

  // 遠くの山（上の縁だけ夕日で明るく）
  for (let x = -OX; x < W - OX; x++) {
    const top = Math.round(farHeight(x));
    for (let y = top; y < H; y++) put(x, y, y === top ? C.farRim : C.far);
  }
  // 地平線のかすみ
  for (let y = 172; y < 186; y++) {
    for (let x = -OX; x < W - OX; x++) {
      if ((y - 172) / 14 * 0.6 > bayer(x, y)) put(x, y, hex('#8a3a62'));
    }
  }
  // 近くの丘
  for (let x = -OX; x < W - OX; x++) {
    const top = Math.round(midHeight(x));
    for (let y = top; y < H; y++) put(x, y, y === top ? C.midRim : C.mid);
  }

  // 地面（下へいくほど暗く）
  for (let y = 182; y < H; y++) {
    for (let x = -OX; x < W - OX; x++) {
      if (y < midHeight(x) + 10) continue;
      const k = (y - 182) / (H - 182);
      put(x, y, k > bayer(x, y) ? C.groundDeep : C.ground);
    }
  }
  // 城へつづく道
  for (let y = 176; y < H; y++) {
    const cx = 52 + (y - 176) * 0.35 + 14 * Math.sin((y - 176) / 22);
    const half = 0.5 + (y - 176) * 0.07;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      if (y > midHeight(x) + 2 && ((x + y) % 2 === 0 || half > 3)) put(x, y, C.path);
    }
  }

  // 城
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };
  const roof = (cx, apex, base, half) => {
    for (let y = apex; y <= base; y++) {
      const w = Math.round(((y - apex) / (base - apex)) * half);
      for (let x = cx - w; x <= cx + w; x++) put(x, y, C.castle);
    }
  };
  rect(30, 146, 60, 160, C.castle);
  for (let x = 30; x <= 60; x += 2) put(x, 145, C.castle);
  rect(29, 132, 35, 160, C.castle);
  roof(32, 123, 131, 4);
  rect(55, 132, 61, 160, C.castle);
  roof(58, 123, 131, 4);
  rect(40, 124, 50, 146, C.castle);
  for (let x = 40; x <= 50; x += 2) put(x, 123, C.castle);
  roof(45, 110, 122, 5);
  rect(45, 102, 45, 110, C.castle);
  for (const [x, y] of [[43, 129], [47, 129], [45, 135], [32, 137], [58, 137], [36, 151], [53, 151]]) put(x, y, C.window);
  rect(43, 153, 47, 160, hex('#05030c'));

  // 手前の崖（上の縁に夕日の照り返し）
  for (let x = -OX; x < W - OX; x++) {
    const top = Math.round(cliffTop(x));
    for (let y = top; y < H; y++) put(x, y, y === top ? C.cliffRim : C.cliff);
  }

  g.putImageData(img, 0, 0);
  return cv;
}

function drawSprite(g, rows, x0, y0, colors, scale = 1) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]];
      if (!c) continue;
      g.fillStyle = c;
      g.fillRect(x0 + x * scale, y0 + y * scale, scale, scale);
    }
  });
}

function setup(canvas) {
  const r = canvas.getBoundingClientRect();
  const aspect = r.width && r.height ? r.width / r.height : BASE_W / H;
  W = Math.max(BASE_W, Math.min(640, Math.round(H * aspect)));
  OX = Math.round((W - BASE_W) / 2);
  canvas.width = W;
  canvas.height = H;
}

export function startTitleArt(canvas) {
  setup(canvas);
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  let bg = drawStatic();
  const onResize = () => { setup(canvas); g.imageSmoothingEnabled = false; bg = drawStatic(); };
  window.addEventListener('resize', onResize);

  const rng = seededRng('title-stars');
  const stars = Array.from({ length: 70 }, () => ({
    x: Math.floor(rng() * W),  // 画面座標
    y: Math.floor(rng() * 120),
    phase: rng() * Math.PI * 2,
    speed: 0.5 + rng() * 2,
    big: rng() < 0.12,
  }));

  // 手前の勇者は遠近感を出すため2倍のドットで描く
  const HERO_SCALE = 2;
  const heroSX = 104;
  const heroY = Math.round(cliffTop(heroSX + 10)) - HERO.length * HERO_SCALE + 1;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let last = 0;

  function frame(now) {
    const t = now / 1000;
    g.drawImage(bg, 0, 0);

    // 星のまたたき
    for (const s of stars) {
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * s.speed + s.phase));
      g.fillStyle = `rgba(255, 246, 220, ${a.toFixed(2)})`;
      g.fillRect(s.x, s.y, 1, 1);
      if (s.big && a > 0.8) {
        g.fillStyle = 'rgba(255, 246, 220, 0.45)';
        g.fillRect(s.x - 1, s.y, 1, 1); g.fillRect(s.x + 1, s.y, 1, 1);
        g.fillRect(s.x, s.y - 1, 1, 1); g.fillRect(s.x, s.y + 1, 1, 1);
      }
    }

    // 流れる雲
    g.fillStyle = 'rgba(160, 90, 150, 0.35)';
    for (const [y, len, sp, off] of [[58, 34, 2.2, 0], [64, 22, 1.6, 70], [96, 40, 1.2, 30], [104, 26, 1.9, 110]]) {
      const x = ((t * sp + off) % (W + len)) - len;
      g.fillRect(Math.round(x), y, len, 1);
      g.fillRect(Math.round(x) + 4, y + 1, len - 8, 1);
    }

    // ドラゴン（右から左へ横切る）
    const period = 26;
    const p = ((t + 9) % period) / period;
    const dx = Math.round(W + 10 - p * (W + 40));
    const dy = Math.round(78 + 8 * Math.sin(p * Math.PI * 2));
    drawSprite(g, DRAGON[Math.floor(t * 4) % 2], dx, dy, { k: '#0b0614' });
    g.fillStyle = '#ff4a3a';
    g.fillRect(dx + 1, dy + (Math.floor(t * 4) % 2 ? 3 : 4), 1, 1);

    // 城の旗
    const wave = Math.floor(t * 3) % 2;
    g.fillStyle = '#d23a3a';
    g.fillRect(OX + 46, 102, 4, 1);
    g.fillRect(OX + 46, 103, 5 - wave, 1);
    g.fillRect(OX + 46, 104, 4, 1);

    // 勇者（マントがなびく）
    const heroX = OX + heroSX;
    drawSprite(g, Math.floor(t * 2.5) % 2 ? HERO2 : HERO, heroX, heroY, {
      k: '#05030a', c: '#a8222c', w: '#e9eef8', y: '#f5c542',
    }, HERO_SCALE);
    // 剣のきらめき
    const glint = t % 3.2;
    if (glint < 0.35) {
      const gx = heroX + 9 * HERO_SCALE, gy = heroY - 1;
      const r = glint < 0.18 ? 2 : 3;
      g.fillStyle = '#ffffff';
      g.fillRect(gx - r, gy, r * 2 + 1, 1);
      g.fillRect(gx, gy - r, 1, r * 2 + 1);
    }
  }

  function loop(now) {
    // レトロ感と省電力のため 12fps 程度に間引く
    if (now - last > 80) { frame(now); last = now; }
    raf = requestAnimationFrame(loop);
  }

  if (reduce) frame(0);
  else raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
  };
}
