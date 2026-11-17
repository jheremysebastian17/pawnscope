// Sounds (synthesised with Web Audio, no audio files) and the "brilliant move" effect.

let ctx = null;
let muted = false;

export const setMuted = (m) => { muted = m; };
export const isMuted = () => muted;

// The AudioContext is created lazily inside a user gesture (browsers block autoplay otherwise).
function audio() {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

// A short filtered noise burst + low body: sounds like a wooden piece on a board.
function knock(ac, at, { freq = 1500, q = 3, gain = 0.5, body = 170, length = 0.07 }) {
  const noise = ac.createBuffer(1, Math.ceil(ac.sampleRate * length), ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const src = ac.createBufferSource();
  src.buffer = noise;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(at);

  const osc = ac.createOscillator();
  const og = ac.createGain();
  osc.frequency.setValueAtTime(body, at);
  osc.frequency.exponentialRampToValueAtTime(body * 0.55, at + length);
  og.gain.setValueAtTime(gain * 0.6, at);
  og.gain.exponentialRampToValueAtTime(0.001, at + length);
  osc.connect(og).connect(ac.destination);
  osc.start(at);
  osc.stop(at + length);
}

export function playMove() {
  const ac = audio();
  if (ac) knock(ac, ac.currentTime, { freq: 1400, gain: 0.35, body: 160 });
}

// Capture: a sharper double knock (the captured piece being knocked off).
export function playCapture() {
  const ac = audio();
  if (!ac) return;
  knock(ac, ac.currentTime, { freq: 2300, q: 2, gain: 0.5, body: 210, length: 0.06 });
  knock(ac, ac.currentTime + 0.055, { freq: 1700, q: 2.5, gain: 0.38, body: 150, length: 0.08 });
}

// Crystal chime: a rising bell arpeggio for brilliant moves.
export function playBrilliant() {
  const ac = audio();
  if (!ac) return;
  const notes = [1046.5, 1318.5, 1568, 2093, 2637];
  notes.forEach((f, i) => {
    const at = ac.currentTime + 0.12 + i * 0.075;
    for (const [mult, vol] of [[1, 0.16], [2.76, 0.05]]) { // fundamental + inharmonic partial = bell timbre
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
      o.connect(g).connect(ac.destination);
      o.start(at);
      o.stop(at + 1.15);
    }
  });
}

// Visual burst over the board: shockwave rings, flying diamonds and a board glow.
// x, y: centre of the destination square as a fraction (0..1) of the board size.
export function brilliantBurst(host, x, y) {
  host.querySelector('.fx-layer')?.remove();
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.style.setProperty('--x', `${x * 100}%`);
  layer.style.setProperty('--y', `${y * 100}%`);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let html = '<span class="fx-glow"></span>';
  if (!reduced) {
    html += '<span class="fx-ring"></span><span class="fx-ring r2"></span><span class="fx-ring r3"></span>';
    const n = 14;
    const size = host.clientWidth;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const dist = size * (0.22 + Math.random() * 0.2); // px, scaled to the board
      const glyph = i % 3 === 0 ? '💎' : i % 3 === 1 ? '✦' : '✧';
      html += `<span class="fx-p" style="--dx:${(Math.cos(angle) * dist).toFixed(1)}px;--dy:${(Math.sin(angle) * dist).toFixed(1)}px;--r:${Math.round(Math.random() * 540 - 270)}deg;--d:${(Math.random() * 0.15).toFixed(2)}s">${glyph}</span>`;
    }
    html += '<span class="fx-gem">💎</span>';
  }
  layer.innerHTML = html;
  host.appendChild(layer);
  host.classList.remove('fx-shine');
  void host.offsetWidth; // restart the CSS animation
  host.classList.add('fx-shine');
  setTimeout(() => { layer.remove(); host.classList.remove('fx-shine'); }, 1800);
}
