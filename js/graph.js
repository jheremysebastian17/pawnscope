// Evaluation graph: White's win chance per ply, with markers on bad moves.
import { META } from './board.js';

const W = 600, H = 120;

export function renderGraph(svg, { wins, classes = [], current = 0 }) {
  if (!wins.length) { svg.innerHTML = ''; return; }
  const n = Math.max(1, wins.length - 1);
  const x = (i) => (i / n) * W;
  const y = (w) => H - (w / 100) * H;
  const line = wins.map((w, i) => `${x(i).toFixed(1)},${y(w).toFixed(1)}`).join(' ');
  let h = `<rect width="${W}" height="${H}" class="g-black"/>
    <polygon points="0,${H} ${line} ${W},${H}" class="g-white"/>
    <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" class="g-mid"/>`;
  classes.forEach((c, i) => {
    if (!['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'].includes(c)) return;
    h += `<circle cx="${x(i + 1)}" cy="${y(wins[i + 1])}" r="4.5" fill="${META[c].color}" stroke="#fff" stroke-width="1.5"/>`;
  });
  h += `<line x1="${x(current)}" y1="0" x2="${x(current)}" y2="${H}" class="g-cursor"/>`;
  svg.innerHTML = h;
}

// Maps a click on the graph to a ply index.
export function plyFromEvent(svg, ev, plies) {
  const r = svg.getBoundingClientRect();
  return Math.round(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (plies - 1));
}
