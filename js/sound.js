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
