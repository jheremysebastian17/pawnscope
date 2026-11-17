// Sounds (synthesised with Web Audio, no audio files) and the "brilliant move" effect.

let ctx = null;
let muted = false;

export const setMuted = (m) => { muted = m; };
export const isMuted = () => muted;

// iOS silences Web Audio when the ring/silent switch is on unless the session is "playback".
try { if ('audioSession' in navigator) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }

// The AudioContext must be created/resumed inside a user gesture (autoplay policy),
// so it is unlocked on the first tap/click/key anywhere on the page.
function ensureContext() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== 'running') ctx.resume();
  } catch { ctx = null; }
  return ctx;
}
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, ensureContext, { capture: true, passive: true });

// Runs fn(ac, t0) once the context is actually running, so the first sound is not lost.
function withAudio(fn) {
  if (muted) return;
  const ac = ensureContext();
  if (!ac) return;
  const go = () => fn(ac, ac.currentTime + 0.005);
  if (ac.state === 'running') go(); else ac.resume().then(go, () => {});
}

// Wooden "tock": a bright click transient + a mid-range pitched body that drops quickly.
// Mid frequencies (500-3000 Hz) are what phone and laptop speakers reproduce well.
function knock(ac, at, { pitch = 820, gain = 0.9, length = 0.09 }) {
  const clickLen = 0.012;
  const noise = ac.createBuffer(1, Math.ceil(ac.sampleRate * clickLen), ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = ac.createBufferSource();
  src.buffer = noise;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const cg = ac.createGain();
  cg.gain.value = gain * 0.9;
  src.connect(hp).connect(cg).connect(ac.destination);
  src.start(at);

  for (const [type, mult, vol] of [['triangle', 1, 1], ['sine', 2.4, 0.35]]) {
    const osc = ac.createOscillator();
    const og = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(pitch * mult, at);
    osc.frequency.exponentialRampToValueAtTime(pitch * mult * 0.6, at + length);
    og.gain.setValueAtTime(0.0001, at);
    og.gain.exponentialRampToValueAtTime(gain * vol, at + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(og).connect(ac.destination);
    osc.start(at);
    osc.stop(at + length + 0.01);
  }
}

export function playMove() {
  withAudio((ac, t) => knock(ac, t, { pitch: 760, gain: 0.55 }));
}

// Capture: a sharper, louder double knock (the captured piece being knocked off).
export function playCapture() {
  withAudio((ac, t) => {
    knock(ac, t, { pitch: 1050, gain: 0.65, length: 0.07 });
    knock(ac, t + 0.06, { pitch: 640, gain: 0.55, length: 0.1 });
  });
}

// Crystal chime: a rising bell arpeggio for brilliant moves.
export function playBrilliant() {
  withAudio((ac, t) => chime(ac, t));
}

function chime(ac, t0) {
  const notes = [1046.5, 1318.5, 1568, 2093, 2637];
  notes.forEach((f, i) => {
    const at = t0 + 0.12 + i * 0.075;
    for (const [mult, vol] of [[1, 0.3], [2.76, 0.09]]) { // fundamental + inharmonic partial = bell timbre
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
