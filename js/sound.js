// WebAudio で鳴らす簡単な効果音（音声ファイル不要）
let ctx = null;
let enabled = true;

export function setSound(on) { enabled = on; }
export function soundEnabled() { return enabled; }

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function tone(freq, start, dur, type = 'square', vol = 0.08) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(start, dur, vol = 0.12) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + start;
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  cursor() { tone(880, 0, 0.05); },
  encounter() { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.06, 0.08)); },
  hit() { noise(0, 0.12); tone(180, 0, 0.1, 'sawtooth'); },
  damage() { noise(0, 0.2, 0.18); tone(90, 0, 0.2, 'sawtooth'); },
  spell() { [1200, 900, 1500, 1100].forEach((f, i) => tone(f, i * 0.05, 0.06, 'triangle')); },
  heal() { [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.1, 'triangle')); },
  win() { [784, 784, 784, 1046].forEach((f, i) => tone(f, i * 0.12, i === 3 ? 0.4 : 0.1)); },
  levelup() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.1, 0.15, 'square', 0.07)); },
  miss() { tone(300, 0, 0.08, 'triangle'); },
  run() { [600, 500, 400, 300].forEach((f, i) => tone(f, i * 0.05, 0.05)); },
  chest() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.12, 'triangle')); },
  lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.25, 0.3, 'triangle')); },
};

/* ---------- フィールドBGM ----------
 * オリジナル曲を WebAudio で演奏する。1文字＝8分音符。
 * 「-」は前の音をのばす、「.」は休符。小節区切りの「|」は読み飛ばす。 */
const BGM_TEMPO = 132;
const BGM_SCORE = {
  melody: `
    G4 - C5 - E5 - D5 C5 | D5 - - C5 A4 - - . | B4 - D5 - G5 - F5 E5 | E5 - - - - - . . |
    A4 - C5 - E5 - D5 C5 | F5 - E5 - D5 - C5 - | D5 - E5 F5 G5 - B4 - | C5 - - - - - . . |
    A5 - - G5 F5 - E5 - | G5 - - E5 C5 - - . | F5 - - E5 D5 - C5 - | B4 - G4 - B4 - D5 - |
    C5 - E5 - A5 - G5 - | F5 - A5 - C6 - A5 - | G5 - F5 - D5 - B4 - | C5 - G4 - C5 - - . |`,
  bass: `
    C3 - G3 - C3 - G3 - | F2 - C3 - F2 - C3 - | G2 - D3 - G2 - D3 - | C3 - G3 - C3 - G3 - |
    A2 - E3 - A2 - E3 - | F2 - C3 - F2 - C3 - | D3 - A3 - G2 - D3 - | C3 - G3 - C3 - G3 - |
    F2 - C3 - F2 - C3 - | C3 - G3 - C3 - G3 - | D3 - A3 - D3 - A3 - | G2 - D3 - G2 - D3 - |
    A2 - E3 - A2 - E3 - | F2 - C3 - F2 - C3 - | G2 - D3 - G2 - D3 - | C3 - G3 - C3 - . . |`,
};

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function noteFreq(name) {
  const m = name.match(/^([A-G]#?)(\d)$/);
  const midi = (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function parseTrack(str) {
  const tokens = str.trim().split(/\s+/).filter((t) => t !== '|');
  const events = [];
  let last = null;
  tokens.forEach((t, step) => {
    if (t === '-') { if (last) last.len++; }
    else if (t === '.') last = null;
    else { last = { step, freq: noteFreq(t), len: 1 }; events.push(last); }
  });
  return { events, length: tokens.length };
}

// ステップ番号 -> そのステップで鳴らす音
const BGM_LENGTH = parseTrack(BGM_SCORE.melody).length;
const BGM_STEPS = Array.from({ length: BGM_LENGTH }, () => []);
for (const [part, type, vol] of [['melody', 'square', 0.035], ['bass', 'triangle', 0.09]]) {
  for (const ev of parseTrack(BGM_SCORE[part]).events) BGM_STEPS[ev.step].push({ ...ev, type, vol });
}
const STEP_SEC = 60 / BGM_TEMPO / 2;

let bgmEnabled = true;
let bgmTimer = null;
let bgmGain = null;
let bgmStep = 0;
let bgmNext = 0;

export function bgmOn() { return bgmEnabled; }
export function setBgm(on) {
  bgmEnabled = on;
  if (!on) stopBgm();
}

function bgmNote(ev, t) {
  const dur = ev.len * STEP_SEC;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = ev.type;
  o.frequency.setValueAtTime(ev.freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(ev.vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(ev.vol * 0.6, t + Math.min(0.15, dur * 0.5));
  g.gain.setValueAtTime(ev.vol * 0.6, t + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.98);
  o.connect(g).connect(bgmGain);
  o.start(t);
  o.stop(t + dur);
}

// 少し先までの音をまとめて予約する（タイマーのズレで音が乱れないように）
function scheduleBgm() {
  while (bgmNext < ctx.currentTime + 0.3) {
    for (const ev of BGM_STEPS[bgmStep]) bgmNote(ev, bgmNext);
    bgmStep = (bgmStep + 1) % BGM_LENGTH;
    bgmNext += STEP_SEC;
  }
}

export function startBgm() {
  if (!ctx || !bgmEnabled || bgmTimer) return;
  bgmGain = ctx.createGain();
  bgmGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  bgmGain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);
  bgmGain.connect(ctx.destination);
  bgmStep = 0;
  bgmNext = ctx.currentTime + 0.1;
  scheduleBgm();
  bgmTimer = setInterval(scheduleBgm, 60);
}

export function stopBgm(fade = 0.25) {
  if (!bgmTimer) return;
  clearInterval(bgmTimer);
  bgmTimer = null;
  const g = bgmGain;
  bgmGain = null;
  const t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(0, t + fade);
  setTimeout(() => g.disconnect(), (fade + 0.4) * 1000);
}
