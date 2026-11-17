// SVG chessboard with move highlights, arrows and classification badges.
import { PIECES } from './pieces.js';

// Own palette and standard annotation symbols (!!, !, ?!, ?, ??).
export const META = {
  brilliant: { sym: '!!', color: '#19b3a6' },
  great: { sym: '!', color: '#3b82f6' },
  best: { sym: '★', color: '#22a35a' },
  excellent: { sym: '✓', color: '#65b741' },
  good: { sym: '✓', color: '#8aa58a' },
  inaccuracy: { sym: '?!', color: '#e6b422' },
  mistake: { sym: '?', color: '#f08a24' },
  miss: { sym: '✕', color: '#c2410c' },
  blunder: { sym: '??', color: '#dc2626' },
  forced: { sym: '→', color: '#8b93a7' },
};

const FILES = 'abcdefgh';
const S = 100; // square size in SVG units

export function squareXY(sq, flip) {
  const f = FILES.indexOf(sq[0]), r = Number(sq[1]) - 1;
  return flip ? { x: (7 - f) * S, y: r * S } : { x: f * S, y: (7 - r) * S };
}

function piecesFromFen(fen) {
  const out = [];
  fen.split(' ')[0].split('/').forEach((row, ri) => {
    let fi = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { fi += Number(ch); continue; }
      out.push({ sq: FILES[fi] + (8 - ri), code: (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase() });
      fi++;
    }
  });
  return out;
}

function arrow(fromSq, toSq, flip, color, id) {
  const a = squareXY(fromSq, flip), b = squareXY(toSq, flip);
  const x1 = a.x + S / 2, y1 = a.y + S / 2, x2 = b.x + S / 2, y2 = b.y + S / 2;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  const head = 34, w = 16;
  const ex = x2 - ux * 18, ey = y2 - uy * 18; // tip stops just short of the centre
  const bx = ex - ux * head, by = ey - uy * head;
  const px = -uy, py = ux;
  return `<g class="arrow" data-arrow="${id}" opacity=".82">
    <line x1="${x1}" y1="${y1}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>
    <polygon points="${ex},${ey} ${bx + px * 26},${by + py * 26} ${bx - px * 26},${by - py * 26}" fill="${color}"/>
  </g>`;
}

// opts: { fen, flip, move: {from,to}|null, cls, bestUci, showBest, check }
export function renderBoard(svg, opts) {
  const { fen, flip = false, move = null, cls = null, bestUci = null, showBest = true } = opts;
  const meta = cls ? META[cls] : null;
  let h = '';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      h += `<rect x="${f * S}" y="${r * S}" width="${S}" height="${S}" class="${(r + f) % 2 ? 'sq-d' : 'sq-l'}"/>`;
    }
  }
  if (move) {
    for (const sq of [move.from, move.to]) {
      const { x, y } = squareXY(sq, flip);
      h += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="${meta?.color || '#f6d743'}" opacity=".42"/>`;
    }
  }
  // Coordinates on the edge squares.
  for (let i = 0; i < 8; i++) {
    const file = flip ? FILES[7 - i] : FILES[i];
    const rank = flip ? i + 1 : 8 - i;
    h += `<text x="${i * S + S - 6}" y="${8 * S - 6}" class="coord ${i % 2 ? 'on-l' : 'on-d'}" text-anchor="end">${file}</text>`;
    h += `<text x="5" y="${i * S + 20}" class="coord ${i % 2 ? 'on-d' : 'on-l'}">${rank}</text>`;
  }
  for (const p of piecesFromFen(fen)) {
    const { x, y } = squareXY(p.sq, flip);
    h += `<image href="${PIECES[p.code]}" x="${x}" y="${y}" width="${S}" height="${S}"/>`;
  }
  if (move && meta) h += arrow(move.from, move.to, flip, meta.color, 'played');
  if (showBest && bestUci && (!move || bestUci !== move.from + move.to + (move.promotion || ''))) {
    h += arrow(bestUci.slice(0, 2), bestUci.slice(2, 4), flip, META.best.color, 'best');
  }
  if (move && meta) {
    const { x, y } = squareXY(move.to, flip);
    const cx = x + S - 20, cy = y + 20;
    h += `<g class="badge" data-cls="${cls}"><circle cx="${cx}" cy="${cy}" r="19" fill="${meta.color}" stroke="#fff" stroke-width="3"/>
      <text x="${cx}" y="${cy + 7}" text-anchor="middle" class="badge-sym">${meta.sym}</text></g>`;
  }
  svg.innerHTML = h;
}
